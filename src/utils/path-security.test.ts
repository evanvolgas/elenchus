/**
 * Comprehensive security tests for path validation utilities.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import {
  validatePath,
  sanitizeGlobPattern,
  isPathWithinRoot,
  PathTraversalError,
  InvalidPathError,
} from './path-security.js';

describe('path-security', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `elenchus-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
    mkdirSync(join(testDir, 'subdir'), { recursive: true });
    writeFileSync(join(testDir, 'test.txt'), 'test content');
    writeFileSync(join(testDir, 'subdir', 'nested.txt'), 'nested content');
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('validatePath', () => {
    describe('valid paths', () => {
      it('should accept a valid relative path', () => {
        const result = validatePath('.', { allowedRoot: testDir });
        expect(result).toBe(resolve(testDir));
      });

      it('should accept a valid subdirectory path', () => {
        const result = validatePath('subdir', {
          allowedRoot: testDir,
          mustBeDirectory: true,
        });
        expect(result).toBe(join(testDir, 'subdir'));
      });

      it('should accept a valid file path', () => {
        const result = validatePath('test.txt', {
          allowedRoot: testDir,
          mustBeDirectory: false,
        });
        expect(result).toBe(join(testDir, 'test.txt'));
      });

      it('should accept nested path', () => {
        const result = validatePath('subdir/nested.txt', {
          allowedRoot: testDir,
          mustBeDirectory: false,
        });
        expect(result).toBe(join(testDir, 'subdir', 'nested.txt'));
      });
    });

    describe('path traversal attacks', () => {
      it('should reject simple parent directory traversal', () => {
        expect(() =>
          validatePath('../', { allowedRoot: testDir, mustExist: false })
        ).toThrow(PathTraversalError);
      });

      it('should reject deep parent directory traversal', () => {
        expect(() =>
          validatePath('../../../etc/passwd', {
            allowedRoot: testDir,
            mustExist: false,
          })
        ).toThrow(PathTraversalError);
      });

      it('should reject encoded traversal attempts', () => {
        // URL-encoded path traversal - detected because resolved path is outside allowed root
        expect(() =>
          validatePath('..%2F..', { allowedRoot: testDir, mustExist: false })
        ).toThrow(PathTraversalError);
      });

      it('should reject mixed traversal patterns', () => {
        expect(() =>
          validatePath('subdir/../../sensitive', {
            allowedRoot: testDir,
            mustExist: false,
          })
        ).toThrow(PathTraversalError);
      });

      it('should reject absolute paths outside allowed root', () => {
        expect(() =>
          validatePath('/etc/passwd', {
            allowedRoot: testDir,
            mustExist: false,
          })
        ).toThrow(PathTraversalError);
      });

      it('should reject Windows-style traversal', () => {
        expect(() =>
          validatePath('..\\..\\windows\\system32', {
            allowedRoot: testDir,
            mustExist: false,
          })
        ).toThrow(PathTraversalError);
      });
    });

    describe('null byte injection', () => {
      it('should reject paths with null bytes', () => {
        expect(() =>
          validatePath('file.txt\x00.jpg', {
            allowedRoot: testDir,
            mustExist: false,
          })
        ).toThrow(InvalidPathError);
        expect(() =>
          validatePath('file.txt\x00.jpg', {
            allowedRoot: testDir,
            mustExist: false,
          })
        ).toThrow(/null bytes/);
      });

      it('should reject paths with control characters', () => {
        expect(() =>
          validatePath('file\x01name', {
            allowedRoot: testDir,
            mustExist: false,
          })
        ).toThrow(InvalidPathError);
      });
    });

    describe('DoS prevention', () => {
      it('should reject excessively long paths', () => {
        const longPath = 'a'.repeat(5000);
        expect(() =>
          validatePath(longPath, {
            allowedRoot: testDir,
            mustExist: false,
          })
        ).toThrow(InvalidPathError);
        expect(() =>
          validatePath(longPath, {
            allowedRoot: testDir,
            mustExist: false,
          })
        ).toThrow(/exceeds maximum length/);
      });

      it('should respect custom max length', () => {
        const path = 'a'.repeat(50);
        expect(() =>
          validatePath(path, {
            allowedRoot: testDir,
            mustExist: false,
            maxLength: 30,
          })
        ).toThrow(/exceeds maximum length/);
      });
    });

    describe('empty and invalid inputs', () => {
      it('should reject empty string', () => {
        expect(() =>
          validatePath('', { allowedRoot: testDir })
        ).toThrow(InvalidPathError);
      });

      it('should reject non-string input', () => {
        expect(() =>
          // @ts-expect-error Testing invalid input
          validatePath(null, { allowedRoot: testDir })
        ).toThrow(InvalidPathError);
      });

      it('should reject undefined input', () => {
        expect(() =>
          // @ts-expect-error Testing invalid input
          validatePath(undefined, { allowedRoot: testDir })
        ).toThrow(InvalidPathError);
      });
    });

    describe('existence checks', () => {
      it('should reject non-existent path when mustExist is true', () => {
        expect(() =>
          validatePath('nonexistent', {
            allowedRoot: testDir,
            mustExist: true,
          })
        ).toThrow(InvalidPathError);
      });

      it('should accept non-existent path when mustExist is false', () => {
        const result = validatePath('nonexistent', {
          allowedRoot: testDir,
          mustExist: false,
        });
        expect(result).toBe(join(testDir, 'nonexistent'));
      });

      it('should reject file when mustBeDirectory is true', () => {
        expect(() =>
          validatePath('test.txt', {
            allowedRoot: testDir,
            mustBeDirectory: true,
          })
        ).toThrow(InvalidPathError);
      });

      it('should reject directory when mustBeDirectory is false', () => {
        expect(() =>
          validatePath('subdir', {
            allowedRoot: testDir,
            mustBeDirectory: false,
          })
        ).toThrow(InvalidPathError);
      });
    });
  });

  describe('sanitizeGlobPattern', () => {
    it('should pass through safe patterns', () => {
      expect(sanitizeGlobPattern('auth')).toBe('auth');
      expect(sanitizeGlobPattern('user-name')).toBe('user-name');
      expect(sanitizeGlobPattern('test_file')).toBe('test_file');
    });

    it('should remove glob wildcards', () => {
      expect(sanitizeGlobPattern('**/*')).toBe('');
      expect(sanitizeGlobPattern('*.ts')).toBe('.ts');
      expect(sanitizeGlobPattern('src/**/*.js')).toBe('src.js');
    });

    it('should remove character classes', () => {
      expect(sanitizeGlobPattern('user[0-9]')).toBe('user0-9');
      expect(sanitizeGlobPattern('file{a,b}')).toBe('fileab');
    });

    it('should remove shell escapes', () => {
      expect(sanitizeGlobPattern('$(command)')).toBe('command');
      expect(sanitizeGlobPattern('`cmd`')).toBe('cmd');
    });

    it('should handle empty input', () => {
      expect(sanitizeGlobPattern('')).toBe('');
      // @ts-expect-error Testing invalid input
      expect(sanitizeGlobPattern(null)).toBe('');
      // @ts-expect-error Testing invalid input
      expect(sanitizeGlobPattern(undefined)).toBe('');
    });

    it('should truncate long patterns', () => {
      const longPattern = 'a'.repeat(200);
      expect(sanitizeGlobPattern(longPattern).length).toBeLessThanOrEqual(100);
    });
  });

  describe('isPathWithinRoot', () => {
    it('should return true for paths within root', () => {
      expect(isPathWithinRoot('subdir', testDir)).toBe(true);
      expect(isPathWithinRoot('.', testDir)).toBe(true);
    });

    it('should return false for paths outside root', () => {
      expect(isPathWithinRoot('../', testDir)).toBe(false);
      expect(isPathWithinRoot('/etc/passwd', testDir)).toBe(false);
    });

    it('should return false for malicious paths', () => {
      expect(isPathWithinRoot('../../../etc', testDir)).toBe(false);
      expect(isPathWithinRoot('subdir/../../..', testDir)).toBe(false);
    });
  });
});
