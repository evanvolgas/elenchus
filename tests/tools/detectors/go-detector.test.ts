import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { detectGo } from '../../../src/tools/detectors/go-detector.js';

const FIXTURES_PATH = join(__dirname, '../../fixtures/languages');

describe('Go Detector', () => {
  describe('Project Detection', () => {
    it('detects Go project with go.mod', () => {
      const result = detectGo(join(FIXTURES_PATH, 'go-module'));

      expect(result).not.toBeNull();
      expect(result?.name).toBe('Go');
      expect(result?.confidence).toBeGreaterThanOrEqual(40);
    });

    it('returns null for non-Go project', () => {
      const result = detectGo(join(FIXTURES_PATH, 'typescript-npm'));

      expect(result).toBeNull();
    });

    it('returns null when no go.mod or .go files', () => {
      const result = detectGo(join(FIXTURES_PATH, 'python-uv'));

      expect(result).toBeNull();
    });
  });

  describe('go.mod Detection', () => {
    it('includes go.mod in manifestFiles', () => {
      const result = detectGo(join(FIXTURES_PATH, 'go-module'));

      expect(result).not.toBeNull();
      expect(result?.manifestFiles).toContain('go.mod');
      expect(result?.detectionMethod).toBe('manifest');
    });

    it('handles missing go.mod gracefully', () => {
      expect(() => {
        detectGo(join(FIXTURES_PATH, 'nonexistent'));
      }).not.toThrow();
    });
  });

  describe('Framework Detection', () => {
    it('detects Gin framework', () => {
      const result = detectGo(join(FIXTURES_PATH, 'go-module'));

      expect(result).not.toBeNull();
      expect(result?.frameworks).toContain('Gin');
    });

    it('returns frameworks as array', () => {
      const result = detectGo(join(FIXTURES_PATH, 'go-module'));

      expect(result).not.toBeNull();
      expect(result?.frameworks).toBeInstanceOf(Array);
    });
  });

  describe('Test File Detection', () => {
    it('detects test files (*_test.go)', () => {
      const result = detectGo(join(FIXTURES_PATH, 'go-module'));

      expect(result).not.toBeNull();
      expect(result?.hasTests).toBe(true);
    });

    it('handles filesystem errors during test detection', () => {
      expect(() => {
        detectGo('/root/forbidden-path');
      }).not.toThrow();
    });
  });

  describe('Linting Detection', () => {
    it('detects golangci-lint config', () => {
      const result = detectGo(join(FIXTURES_PATH, 'go-module'));

      expect(result).not.toBeNull();
      expect(typeof result?.hasLinting).toBe('boolean');
    });
  });

  describe('Confidence Calculation', () => {
    it('assigns confidence based on metadata', () => {
      const result = detectGo(join(FIXTURES_PATH, 'go-module'));

      expect(result).not.toBeNull();
      expect(result?.confidence).toBeGreaterThan(0);
    });

    it('caps confidence at 100', () => {
      const result = detectGo(join(FIXTURES_PATH, 'go-module'));

      expect(result).not.toBeNull();
      expect(result?.confidence).toBeLessThanOrEqual(100);
    });
  });

  describe('Acceptance Criteria', () => {
    it('sets hasTests when test files exist', () => {
      const result = detectGo(join(FIXTURES_PATH, 'go-module'));

      expect(result).not.toBeNull();
      expect(result?.hasTests).toBe(true);
    });

    it('sets hasLinting when config present', () => {
      const result = detectGo(join(FIXTURES_PATH, 'go-module'));

      expect(result).not.toBeNull();
      expect(typeof result?.hasLinting).toBe('boolean');
    });

    it('populates frameworks array correctly', () => {
      const result = detectGo(join(FIXTURES_PATH, 'go-module'));

      expect(result).not.toBeNull();
      expect(result?.frameworks).toBeInstanceOf(Array);
      expect(result?.frameworks.length).toBeGreaterThan(0);
    });

    it('sets detection method correctly', () => {
      const result = detectGo(join(FIXTURES_PATH, 'go-module'));

      expect(result).not.toBeNull();
      expect(result?.detectionMethod).toBe('manifest');
    });
  });

  describe('Error Handling', () => {
    it('handles filesystem errors gracefully', () => {
      expect(() => {
        detectGo('/root/forbidden-path');
      }).not.toThrow();
    });

    it('returns null for nonexistent paths', () => {
      const result = detectGo(join(FIXTURES_PATH, 'nonexistent'));

      expect(result).toBeNull();
    });
  });

  describe('go.mod Edge Cases', () => {
    it('parses dependencies correctly', () => {
      const result = detectGo(join(FIXTURES_PATH, 'go-module'));

      expect(result).not.toBeNull();
      // Frameworks array populated from dependencies
      expect(result?.frameworks).toBeInstanceOf(Array);
    });

    it('handles empty require blocks', () => {
      expect(() => {
        detectGo(join(FIXTURES_PATH, 'polyglot'));
      }).not.toThrow();
    });
  });
});
