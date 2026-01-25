import { describe, it, expect } from 'vitest';
import { generateId, shortId, isValidId } from '../../src/utils/id.js';

describe('id utilities', () => {
  describe('generateId', () => {
    it('should generate IDs with the correct format', () => {
      const id = generateId('epic');
      expect(id).toMatch(/^epic-[a-z0-9]+-[A-Za-z0-9_-]+$/);
    });

    it('should generate unique IDs on each call', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateId('test'));
      }
      // All 100 IDs should be unique
      expect(ids.size).toBe(100);
    });

    it('should include the prefix', () => {
      const id = generateId('session');
      expect(id.startsWith('session-')).toBe(true);
    });

    it('should reject empty prefix', () => {
      expect(() => generateId('')).toThrow('Prefix must be a non-empty string');
    });

    it('should reject null/undefined prefix', () => {
      // @ts-expect-error - testing invalid input
      expect(() => generateId(null)).toThrow('Prefix must be a non-empty string');
      // @ts-expect-error - testing invalid input
      expect(() => generateId(undefined)).toThrow('Prefix must be a non-empty string');
    });

    it('should reject prefix longer than 50 characters', () => {
      const longPrefix = 'a'.repeat(51);
      expect(() => generateId(longPrefix)).toThrow('must be 50 characters or less');
    });

    it('should reject prefix with invalid characters', () => {
      expect(() => generateId('epic/test')).toThrow('alphanumeric characters and hyphens');
      expect(() => generateId('epic..test')).toThrow('alphanumeric characters and hyphens');
      expect(() => generateId('epic\x00test')).toThrow('alphanumeric characters and hyphens');
    });

    it('should accept valid prefixes with hyphens', () => {
      const id = generateId('my-epic-123');
      expect(id.startsWith('my-epic-123-')).toBe(true);
    });
  });

  describe('shortId', () => {
    it('should generate 11-character IDs', () => {
      const id = shortId();
      expect(id.length).toBe(11);
    });

    it('should generate unique IDs on each call', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(shortId());
      }
      // All 100 IDs should be unique
      expect(ids.size).toBe(100);
    });

    it('should use base64url alphabet', () => {
      // Base64url uses A-Z, a-z, 0-9, -, _
      const id = shortId();
      expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
    });
  });

  describe('isValidId', () => {
    it('should validate correctly formatted IDs', () => {
      const id = generateId('epic');
      expect(isValidId(id)).toBe(true);
    });

    it('should validate IDs with expected prefix', () => {
      const id = generateId('session');
      expect(isValidId(id, 'session')).toBe(true);
    });

    it('should reject IDs with wrong prefix', () => {
      const id = generateId('epic');
      expect(isValidId(id, 'session')).toBe(false);
    });

    it('should reject empty strings', () => {
      expect(isValidId('')).toBe(false);
    });

    it('should reject malformed IDs', () => {
      expect(isValidId('no-separators')).toBe(false);
      expect(isValidId('only-one')).toBe(false);
    });

    it('should reject IDs with invalid prefix characters', () => {
      expect(isValidId('evil/../../etc-123-abc')).toBe(false);
    });

    it('should reject null/undefined', () => {
      // @ts-expect-error - testing invalid input
      expect(isValidId(null)).toBe(false);
      // @ts-expect-error - testing invalid input
      expect(isValidId(undefined)).toBe(false);
    });
  });

  describe('cryptographic security', () => {
    it('should generate IDs that are not easily predictable', () => {
      // Generate two IDs at approximately the same time
      const id1 = generateId('test');
      const id2 = generateId('test');

      // Extract the random portions (after the second hyphen)
      const parts1 = id1.split('-');
      const parts2 = id2.split('-');

      // Even if timestamps are the same, random parts should differ
      if (parts1[1] === parts2[1]) {
        expect(parts1[2]).not.toBe(parts2[2]);
      }
    });

    it('should use sufficient entropy', () => {
      // 9 bytes = 72 bits of entropy, which is considered strong
      // This is a sanity check that our ID has reasonable length
      const id = generateId('test');
      // ID format: prefix-timestamp-random
      // We need to find the random part after the last hyphen
      const lastHyphenIndex = id.lastIndexOf('-');
      const randomPart = id.slice(lastHyphenIndex + 1);

      // 12 characters of base64url = ~72 bits of entropy
      expect(randomPart.length).toBeGreaterThanOrEqual(10);
    });
  });
});
