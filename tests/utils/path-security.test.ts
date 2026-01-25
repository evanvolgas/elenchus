import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  validatePath,
  sanitizeGlobPattern,
  isPathWithinRoot,
  PathTraversalError,
  InvalidPathError,
} from '../../src/utils/path-security.js';

describe('path-security', () => {
  const TEST_DIR = join(process.cwd(), 'test-fixtures-path-security');
  const SUB_DIR = join(TEST_DIR, 'subdir');

  beforeEach(() => {
    // Create test directory structure
    mkdirSync(TEST_DIR, { recursive: true });
    mkdirSync(SUB_DIR, { recursive: true });
    writeFileSync(join(TEST_DIR, 'test-file.txt'), 'test content');
  });

  afterEach(() => {
    // Clean up test directory
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  describe('validatePath', () => {
    it('should accept valid relative paths within root', () => {
      const result = validatePath('./subdir', {
        allowedRoot: TEST_DIR,
        mustExist: true,
        mustBeDirectory: true,
      });
      expect(result).toBe(SUB_DIR);
    });

    it('should accept valid file paths', () => {
      const result = validatePath('./test-file.txt', {
        allowedRoot: TEST_DIR,
        mustExist: true,
        mustBeDirectory: false,
      });
      expect(result).toBe(join(TEST_DIR, 'test-file.txt'));
    });

    it('should reject path traversal attempts with ../', () => {
      expect(() =>
        validatePath('../../../etc/passwd', {
          allowedRoot: TEST_DIR,
          mustExist: false,
        })
      ).toThrow(PathTraversalError);
    });

    it('should reject absolute paths outside root', () => {
      expect(() =>
        validatePath('/etc/passwd', {
          allowedRoot: TEST_DIR,
          mustExist: false,
        })
      ).toThrow(PathTraversalError);
    });

    it('should reject empty paths', () => {
      expect(() => validatePath('')).toThrow(InvalidPathError);
    });

    it('should reject paths with null bytes', () => {
      expect(() =>
        validatePath('file.txt\x00.jpg', {
          allowedRoot: TEST_DIR,
          mustExist: false,
        })
      ).toThrow(InvalidPathError);
    });

    it('should reject paths with control characters', () => {
      expect(() =>
        validatePath('file\x01name.txt', {
          allowedRoot: TEST_DIR,
          mustExist: false,
        })
      ).toThrow(InvalidPathError);
    });

    it('should reject excessively long paths', () => {
      const longPath = 'a'.repeat(5000);
      expect(() =>
        validatePath(longPath, {
          allowedRoot: TEST_DIR,
          mustExist: false,
        })
      ).toThrow(InvalidPathError);
    });

    it('should reject non-existent paths when mustExist is true', () => {
      expect(() =>
        validatePath('./nonexistent', {
          allowedRoot: TEST_DIR,
          mustExist: true,
        })
      ).toThrow(InvalidPathError);
    });

    it('should reject files when mustBeDirectory is true', () => {
      expect(() =>
        validatePath('./test-file.txt', {
          allowedRoot: TEST_DIR,
          mustExist: true,
          mustBeDirectory: true,
        })
      ).toThrow(InvalidPathError);
    });

    it('should reject directories when mustBeDirectory is false', () => {
      expect(() =>
        validatePath('./subdir', {
          allowedRoot: TEST_DIR,
          mustExist: true,
          mustBeDirectory: false,
        })
      ).toThrow(InvalidPathError);
    });
  });

  describe('sanitizeGlobPattern', () => {
    it('should keep alphanumeric characters', () => {
      expect(sanitizeGlobPattern('auth')).toBe('auth');
      expect(sanitizeGlobPattern('user123')).toBe('user123');
    });

    it('should remove glob special characters', () => {
      expect(sanitizeGlobPattern('**/*')).toBe('');
      expect(sanitizeGlobPattern('file[0-9]')).toBe('file0-9');
      // Comma is kept as it's not a glob special character
      expect(sanitizeGlobPattern('*.{ts,js}')).toBe('.ts,js');
    });

    it('should handle empty strings', () => {
      expect(sanitizeGlobPattern('')).toBe('');
    });

    it('should truncate long patterns', () => {
      const longPattern = 'a'.repeat(200);
      expect(sanitizeGlobPattern(longPattern).length).toBe(100);
    });

    it('should keep hyphens and underscores', () => {
      expect(sanitizeGlobPattern('my-component_v2')).toBe('my-component_v2');
    });

    it('should keep dots', () => {
      expect(sanitizeGlobPattern('file.test')).toBe('file.test');
    });
  });

  describe('isPathWithinRoot', () => {
    it('should return true for valid paths within root', () => {
      expect(isPathWithinRoot('./subdir', TEST_DIR)).toBe(true);
    });

    it('should return false for traversal attempts', () => {
      expect(isPathWithinRoot('../../../etc/passwd', TEST_DIR)).toBe(false);
    });

    it('should return false for absolute paths outside root', () => {
      expect(isPathWithinRoot('/etc/passwd', TEST_DIR)).toBe(false);
    });
  });
});
