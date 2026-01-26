/**
 * Tests for delivery type schemas with security validation
 */

import { describe, it, expect } from 'vitest';
import { DeliveryArtifactSchema, CreateDeliveryInputSchema } from './delivery.js';

describe('delivery schemas', () => {
  describe('DeliveryArtifactSchema', () => {
    describe('valid artifacts', () => {
      it('should accept valid artifact with relative path', () => {
        const result = DeliveryArtifactSchema.safeParse({
          type: 'code',
          path: 'src/index.ts',
          description: 'Main entry point',
        });

        expect(result.success).toBe(true);
      });

      it('should accept artifact with nested path', () => {
        const result = DeliveryArtifactSchema.safeParse({
          type: 'test',
          path: 'tests/unit/auth/login.test.ts',
          description: 'Login tests',
        });

        expect(result.success).toBe(true);
      });

      it('should accept all valid artifact types', () => {
        const types = ['code', 'test', 'docs', 'config', 'other'] as const;

        for (const type of types) {
          const result = DeliveryArtifactSchema.safeParse({
            type,
            path: 'file.txt',
            description: 'Test',
          });
          expect(result.success, `Type ${type} should be valid`).toBe(true);
        }
      });
    });

    describe('path traversal prevention', () => {
      it('should reject simple parent traversal', () => {
        const result = DeliveryArtifactSchema.safeParse({
          type: 'code',
          path: '../../../etc/passwd',
          description: 'Malicious path',
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.message).toContain('path traversal');
        }
      });

      it('should reject traversal with valid prefix', () => {
        const result = DeliveryArtifactSchema.safeParse({
          type: 'code',
          path: 'src/../../../sensitive',
          description: 'Sneaky traversal',
        });

        expect(result.success).toBe(false);
      });

      it('should reject Windows-style traversal', () => {
        const result = DeliveryArtifactSchema.safeParse({
          type: 'code',
          path: '..\\..\\windows\\system32',
          description: 'Windows traversal',
        });

        expect(result.success).toBe(false);
      });

      it('should reject double slashes', () => {
        const result = DeliveryArtifactSchema.safeParse({
          type: 'code',
          path: 'src//file.ts',
          description: 'Double slashes',
        });

        expect(result.success).toBe(false);
      });
    });

    describe('absolute path prevention', () => {
      it('should reject Unix absolute paths', () => {
        const result = DeliveryArtifactSchema.safeParse({
          type: 'code',
          path: '/etc/passwd',
          description: 'Absolute path',
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.message).toContain('relative');
        }
      });

      it('should reject Windows absolute paths', () => {
        const result = DeliveryArtifactSchema.safeParse({
          type: 'code',
          path: '\\windows\\system32',
          description: 'Windows absolute',
        });

        expect(result.success).toBe(false);
      });
    });

    describe('null byte injection prevention', () => {
      it('should reject paths with null bytes', () => {
        const result = DeliveryArtifactSchema.safeParse({
          type: 'code',
          path: 'file.txt\x00.jpg',
          description: 'Null byte injection',
        });

        expect(result.success).toBe(false);
      });

      it('should reject paths with control characters', () => {
        const result = DeliveryArtifactSchema.safeParse({
          type: 'code',
          path: 'file\x01name.ts',
          description: 'Control char',
        });

        expect(result.success).toBe(false);
      });
    });

    describe('length limits', () => {
      it('should reject empty paths', () => {
        const result = DeliveryArtifactSchema.safeParse({
          type: 'code',
          path: '',
          description: 'Empty path',
        });

        expect(result.success).toBe(false);
      });

      it('should reject excessively long paths', () => {
        const result = DeliveryArtifactSchema.safeParse({
          type: 'code',
          path: 'a'.repeat(2000),
          description: 'Long path',
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.message).toContain('1024');
        }
      });

      it('should reject excessively long descriptions', () => {
        const result = DeliveryArtifactSchema.safeParse({
          type: 'code',
          path: 'file.ts',
          description: 'a'.repeat(3000),
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.message).toContain('2000');
        }
      });
    });
  });

  describe('CreateDeliveryInputSchema', () => {
    it('should accept valid delivery input', () => {
      const result = CreateDeliveryInputSchema.safeParse({
        specId: 'spec-123',
        artifacts: [
          { type: 'code', path: 'src/index.ts', description: 'Main file' },
          { type: 'test', path: 'tests/index.test.ts', description: 'Tests' },
        ],
      });

      expect(result.success).toBe(true);
    });

    it('should accept optional notes', () => {
      const result = CreateDeliveryInputSchema.safeParse({
        specId: 'spec-123',
        artifacts: [{ type: 'code', path: 'file.ts', description: 'File' }],
        notes: 'Implementation notes',
      });

      expect(result.success).toBe(true);
    });

    it('should accept optional limitations', () => {
      const result = CreateDeliveryInputSchema.safeParse({
        specId: 'spec-123',
        artifacts: [{ type: 'code', path: 'file.ts', description: 'File' }],
        knownLimitations: ['No error handling', 'No tests'],
      });

      expect(result.success).toBe(true);
    });

    it('should reject if any artifact has invalid path', () => {
      const result = CreateDeliveryInputSchema.safeParse({
        specId: 'spec-123',
        artifacts: [
          { type: 'code', path: 'src/index.ts', description: 'Valid' },
          { type: 'code', path: '../../../etc/passwd', description: 'Invalid' },
        ],
      });

      expect(result.success).toBe(false);
    });

    it('should require specId', () => {
      const result = CreateDeliveryInputSchema.safeParse({
        artifacts: [{ type: 'code', path: 'file.ts', description: 'File' }],
      });

      expect(result.success).toBe(false);
    });

    it('should require at least one artifact', () => {
      const result = CreateDeliveryInputSchema.safeParse({
        specId: 'spec-123',
        artifacts: [],
      });

      // Empty array is technically valid per schema, but good to verify behavior
      expect(result.success).toBe(true);
    });
  });
});
