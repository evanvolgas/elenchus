/**
 * Tests for input sanitization utilities
 */

import { describe, it, expect } from 'vitest';
import {
  sanitizeString,
  sanitizeArray,
  sanitizeObject,
  hasSuspiciousPatterns,
  sanitizeFilePath,
  sanitizeIdentifier,
} from './sanitize.js';

describe('sanitize', () => {
  describe('sanitizeString', () => {
    it('should pass through normal strings', () => {
      expect(sanitizeString('hello world')).toBe('hello world');
      expect(sanitizeString('Test 123')).toBe('Test 123');
    });

    it('should trim whitespace by default', () => {
      expect(sanitizeString('  hello  ')).toBe('hello');
      expect(sanitizeString('\n\ttest\n')).toBe('test');
    });

    it('should preserve whitespace when trim is false', () => {
      expect(sanitizeString('  hello  ', { trim: false })).toBe('  hello  ');
    });

    it('should remove invisible characters', () => {
      expect(sanitizeString('hello\u200Bworld')).toBe('helloworld'); // Zero-width space
      expect(sanitizeString('test\u00ADvalue')).toBe('testvalue'); // Soft hyphen
      expect(sanitizeString('a\uFEFFb')).toBe('ab'); // BOM
    });

    it('should remove control characters', () => {
      expect(sanitizeString('hello\x00world')).toBe('helloworld'); // Null
      expect(sanitizeString('test\x1Fvalue')).toBe('testvalue'); // Unit separator
    });

    it('should enforce maximum length', () => {
      const long = 'a'.repeat(20000);
      expect(sanitizeString(long).length).toBeLessThanOrEqual(10000);
      expect(sanitizeString(long, { maxLength: 100 }).length).toBe(100);
    });

    it('should normalize Unicode by default', () => {
      // e + combining acute accent should normalize to é
      const composed = '\u0065\u0301'; // e + ́
      const result = sanitizeString(composed);
      expect(result).toBe('\u00E9'); // é
    });

    it('should replace homoglyphs when enabled', () => {
      // Cyrillic 'a' looks like Latin 'a'
      const cyrillic = 'p\u0430yment'; // "pаyment" with Cyrillic a
      expect(sanitizeString(cyrillic, { replaceHomoglyphs: true })).toBe('payment');
    });
  });

  describe('sanitizeArray', () => {
    it('should pass through normal arrays', () => {
      expect(sanitizeArray([1, 2, 3])).toEqual([1, 2, 3]);
      expect(sanitizeArray(['a', 'b'])).toEqual(['a', 'b']);
    });

    it('should enforce maximum length', () => {
      const long = Array(2000).fill(0);
      expect(sanitizeArray(long).length).toBeLessThanOrEqual(1000);
      expect(sanitizeArray(long, { maxLength: 10 }).length).toBe(10);
    });

    it('should sanitize elements when function provided', () => {
      const input = ['  hello  ', '  world  '];
      const result = sanitizeArray(input, {
        sanitizeElement: (s) => s.trim(),
      });
      expect(result).toEqual(['hello', 'world']);
    });
  });

  describe('sanitizeObject', () => {
    it('should pass through simple objects', () => {
      const obj = { name: 'test', value: 42 };
      expect(sanitizeObject(obj)).toEqual(obj);
    });

    it('should sanitize string values', () => {
      const obj = { name: '  hello\u200B  ' };
      expect(sanitizeObject(obj)).toEqual({ name: 'hello' });
    });

    it('should handle nested objects', () => {
      const obj = {
        outer: {
          inner: '  test  ',
        },
      };
      expect(sanitizeObject(obj)).toEqual({
        outer: {
          inner: 'test',
        },
      });
    });

    it('should handle arrays in objects', () => {
      const obj = {
        items: ['  a  ', '  b  '],
      };
      expect(sanitizeObject(obj)).toEqual({
        items: ['a', 'b'],
      });
    });

    it('should sanitize object keys', () => {
      const obj = { '  key\u200B  ': 'value' };
      expect(sanitizeObject(obj)).toEqual({ key: 'value' });
    });

    it('should prevent infinite recursion', () => {
      const deepObj: Record<string, unknown> = {};
      let current = deepObj;
      for (let i = 0; i < 100; i++) {
        current.nested = {};
        current = current.nested as Record<string, unknown>;
      }

      // Should not throw, should truncate at max depth
      const result = sanitizeObject(deepObj, { maxDepth: 5 });
      expect(result).toBeDefined();
    });

    it('should preserve primitives', () => {
      const obj = {
        num: 42,
        bool: true,
        nil: null,
      };
      expect(sanitizeObject(obj)).toEqual(obj);
    });
  });

  describe('hasSuspiciousPatterns', () => {
    describe('SQL injection patterns', () => {
      it('should detect OR-based injection', () => {
        expect(hasSuspiciousPatterns("' OR 1=1 --")).toBe(true);
        expect(hasSuspiciousPatterns("'; DROP TABLE users; --")).toBe(true);
      });

      it('should detect UNION injection', () => {
        expect(hasSuspiciousPatterns("' UNION SELECT * FROM users")).toBe(true);
      });
    });

    describe('command injection patterns', () => {
      it('should detect command chaining', () => {
        expect(hasSuspiciousPatterns('; rm -rf /')).toBe(true);
        expect(hasSuspiciousPatterns('| cat /etc/passwd')).toBe(true);
      });

      it('should detect backtick execution', () => {
        expect(hasSuspiciousPatterns('`curl malicious.com`')).toBe(true);
      });
    });

    describe('path traversal', () => {
      it('should detect traversal sequences', () => {
        expect(hasSuspiciousPatterns('../../../etc/passwd')).toBe(true);
        expect(hasSuspiciousPatterns('..\\..\\windows\\system32')).toBe(true);
      });
    });

    describe('null byte injection', () => {
      it('should detect null bytes', () => {
        expect(hasSuspiciousPatterns('file.txt\x00.jpg')).toBe(true);
      });
    });

    describe('XSS patterns', () => {
      it('should detect script tags', () => {
        expect(hasSuspiciousPatterns('<script>alert(1)</script>')).toBe(true);
        expect(hasSuspiciousPatterns('<script src="evil.js">')).toBe(true);
      });
    });

    describe('template injection', () => {
      it('should detect template expressions', () => {
        expect(hasSuspiciousPatterns('{{ config }}')).toBe(true);
        expect(hasSuspiciousPatterns('{{constructor.constructor}}')).toBe(true);
      });
    });

    describe('safe strings', () => {
      it('should not flag normal text', () => {
        expect(hasSuspiciousPatterns('Hello, world!')).toBe(false);
        expect(hasSuspiciousPatterns('user@example.com')).toBe(false);
        expect(hasSuspiciousPatterns('The quick brown fox')).toBe(false);
      });
    });
  });

  describe('sanitizeFilePath', () => {
    it('should pass through safe paths', () => {
      expect(sanitizeFilePath('src/index.ts')).toBe('src/index.ts');
      expect(sanitizeFilePath('file.txt')).toBe('file.txt');
    });

    it('should remove traversal sequences', () => {
      expect(sanitizeFilePath('../../../etc/passwd')).toBe('etc/passwd');
      expect(sanitizeFilePath('src/../sensitive')).toBe('src/sensitive');
    });

    it('should normalize slashes', () => {
      expect(sanitizeFilePath('src//file.ts')).toBe('src/file.ts');
      expect(sanitizeFilePath('a///b///c')).toBe('a/b/c');
    });

    it('should remove leading slashes', () => {
      expect(sanitizeFilePath('/etc/passwd')).toBe('etc/passwd');
      expect(sanitizeFilePath('///root')).toBe('root');
    });

    it('should handle invisible characters', () => {
      expect(sanitizeFilePath('src\u200B/file.ts')).toBe('src/file.ts');
    });
  });

  describe('sanitizeIdentifier', () => {
    it('should pass through valid identifiers', () => {
      expect(sanitizeIdentifier('user_123')).toBe('user_123');
      expect(sanitizeIdentifier('my-id')).toBe('my-id');
      expect(sanitizeIdentifier('CamelCase')).toBe('CamelCase');
    });

    it('should remove special characters', () => {
      expect(sanitizeIdentifier('user@name')).toBe('username');
      expect(sanitizeIdentifier('file.txt')).toBe('filetxt');
      expect(sanitizeIdentifier('path/to/file')).toBe('pathtofile');
    });

    it('should handle spaces and whitespace', () => {
      expect(sanitizeIdentifier('  hello world  ')).toBe('helloworld');
    });

    it('should enforce length limit', () => {
      const long = 'a'.repeat(500);
      expect(sanitizeIdentifier(long).length).toBeLessThanOrEqual(256);
    });
  });
});
