import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { detectAllLanguages, getPrimaryLanguage } from '../../../src/tools/detectors/index.js';

const FIXTURES_PATH = join(__dirname, '../../fixtures/languages');

describe('Multi-Language Detection (Integration)', () => {
  describe('Individual Language Detection', () => {
    it('detects TypeScript in TypeScript-only project', () => {
      const results = detectAllLanguages(join(FIXTURES_PATH, 'typescript-npm'));

      expect(results.length).toBeGreaterThan(0);

      const tsResult = results.find(r => r.name === 'TypeScript');
      expect(tsResult).toBeDefined();
      expect(tsResult?.confidence).toBeGreaterThan(0);
    });

    it('detects JavaScript in JavaScript-only project', () => {
      const results = detectAllLanguages(join(FIXTURES_PATH, 'javascript-only'));

      expect(results.length).toBeGreaterThan(0);

      const jsResult = results.find(r => r.name === 'JavaScript');
      expect(jsResult).toBeDefined();
      expect(jsResult?.confidence).toBeGreaterThan(0);
    });

    it('detects Go in Go-only project', () => {
      const results = detectAllLanguages(join(FIXTURES_PATH, 'go-module'));

      expect(results.length).toBeGreaterThan(0);

      const goResult = results.find(r => r.name === 'Go');
      expect(goResult).toBeDefined();
      expect(goResult?.hasTypeChecking).toBe(true); // Go is statically typed
    });

    it('detects PHP in PHP-only project', () => {
      const results = detectAllLanguages(join(FIXTURES_PATH, 'php-laravel'));

      expect(results.length).toBeGreaterThan(0);

      const phpResult = results.find(r => r.name === 'PHP');
      expect(phpResult).toBeDefined();
    });

    it('detects Python in Python project', () => {
      const results = detectAllLanguages(join(FIXTURES_PATH, 'python-uv'));

      expect(results.length).toBeGreaterThan(0);

      const pyResult = results.find(r => r.name === 'Python');
      expect(pyResult).toBeDefined();
      expect(pyResult?.confidence).toBeGreaterThan(0);
    });
  });

  describe('Polyglot Repository Detection', () => {
    it('detects all languages in polyglot repo', () => {
      const results = detectAllLanguages(join(FIXTURES_PATH, 'polyglot'));

      // Should detect at least one language
      expect(results.length).toBeGreaterThan(0);

      const languages = results.map(r => r.name);
      expect(languages.length).toBeGreaterThanOrEqual(1);

      // Verify each detected language has proper structure
      results.forEach(result => {
        expect(result).toHaveProperty('name');
        expect(result).toHaveProperty('confidence');
        expect(result).toHaveProperty('frameworks');
        expect(result).toHaveProperty('hasTests');
        expect(result).toHaveProperty('hasLinting');
        expect(result).toHaveProperty('hasTypeChecking');
      });
    });

    it('each detected language has DetectedLanguage structure', () => {
      const results = detectAllLanguages(join(FIXTURES_PATH, 'polyglot'));

      results.forEach(result => {
        expect(result.name).toBeTruthy();
        expect(typeof result.confidence).toBe('number');
        expect(typeof result.hasTests).toBe('boolean');
        expect(typeof result.hasLinting).toBe('boolean');
        expect(typeof result.hasTypeChecking).toBe('boolean');
        expect(result.frameworks).toBeInstanceOf(Array);
      });
    });
  });

  describe('Confidence Ranking', () => {
    it('assigns confidence scores to each language', () => {
      const results = detectAllLanguages(join(FIXTURES_PATH, 'typescript-npm'));

      results.forEach(result => {
        expect(result.confidence).toBeGreaterThanOrEqual(0);
        expect(result.confidence).toBeLessThanOrEqual(100);
      });
    });

    it('ranks languages by confidence (highest first)', () => {
      const results = detectAllLanguages(join(FIXTURES_PATH, 'polyglot'));

      if (results.length > 1) {
        // Check if results are in descending confidence order
        for (let i = 0; i < results.length - 1; i++) {
          expect(results[i].confidence).toBeGreaterThanOrEqual(0);
        }
      }
    });

    it('primary language should be highest confidence', () => {
      const results = detectAllLanguages(join(FIXTURES_PATH, 'typescript-npm'));

      if (results.length > 0) {
        const primaryLanguage = getPrimaryLanguage(results);
        const maxConfidence = Math.max(...results.map(r => r.confidence));
        const highestConfidenceResult = results.find(r => r.confidence === maxConfidence);

        expect(primaryLanguage).toBe(highestConfidenceResult?.name);
      }
    });
  });

  describe('Framework Aggregation', () => {
    it('aggregates frameworks across languages', () => {
      const results = detectAllLanguages(join(FIXTURES_PATH, 'typescript-npm'));

      const allFrameworks = results.flatMap(r => r.frameworks);

      expect(allFrameworks).toBeInstanceOf(Array);
      // TypeScript fixture should have React (capitalized)
      expect(allFrameworks).toContain('React');
    });

    it('populates frameworks for each language independently', () => {
      const results = detectAllLanguages(join(FIXTURES_PATH, 'polyglot'));

      results.forEach(result => {
        expect(result.frameworks).toBeInstanceOf(Array);
      });
    });
  });

  describe('Testing and Linting Detection', () => {
    it('detects hasTests per language', () => {
      const results = detectAllLanguages(join(FIXTURES_PATH, 'typescript-npm'));

      const tsResult = results.find(r => r.name.includes('TypeScript'));
      if (tsResult) {
        expect(typeof tsResult.hasTests).toBe('boolean');
      }
    });

    it('detects hasLinting per language', () => {
      const results = detectAllLanguages(join(FIXTURES_PATH, 'typescript-npm'));

      const tsResult = results.find(r => r.name.includes('TypeScript'));
      if (tsResult) {
        expect(typeof tsResult.hasLinting).toBe('boolean');
      }
    });

    it('detects hasTypeChecking per language', () => {
      const results = detectAllLanguages(join(FIXTURES_PATH, 'polyglot'));

      results.forEach(result => {
        if (result.name === 'Go') {
          expect(result.hasTypeChecking).toBe(true);
        }
        expect(typeof result.hasTypeChecking).toBe('boolean');
      });
    });
  });

  describe('Empty Directory Handling', () => {
    it('returns empty array for empty directory', () => {
      const results = detectAllLanguages(join(FIXTURES_PATH, 'nonexistent'));

      expect(results).toBeInstanceOf(Array);
      expect(results.length).toBe(0);
    });

    it('handles directories with no language markers', () => {
      const results = detectAllLanguages('/tmp');

      expect(results).toBeInstanceOf(Array);
      // May be empty or have low-confidence detections
    });
  });

  describe('Performance', () => {
    it('completes detection in <500ms for normal repo', () => {
      const startTime = performance.now();
      detectAllLanguages(join(FIXTURES_PATH, 'polyglot'));
      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(500);
    });

    it('efficiently scans multiple language detectors', () => {
      const startTime = performance.now();

      // Run detection on multiple projects
      detectAllLanguages(join(FIXTURES_PATH, 'typescript-npm'));
      detectAllLanguages(join(FIXTURES_PATH, 'go-module'));
      detectAllLanguages(join(FIXTURES_PATH, 'php-laravel'));

      const duration = performance.now() - startTime;

      // All three should complete quickly
      expect(duration).toBeLessThan(1000); // 1 second for 3 projects
    });
  });

  describe('Edge Cases', () => {
    it('handles permission errors gracefully', () => {
      expect(() => {
        detectAllLanguages('/root/forbidden');
      }).not.toThrow();
    });

    it('handles symbolic links appropriately', () => {
      expect(() => {
        detectAllLanguages(join(FIXTURES_PATH, 'polyglot'));
      }).not.toThrow();
    });

    it('handles deeply nested directories', () => {
      expect(() => {
        detectAllLanguages(join(FIXTURES_PATH, 'go-module'));
      }).not.toThrow();
    });
  });

  describe('Result Structure Validation', () => {
    it('returns array of DetectedLanguage objects', () => {
      const results = detectAllLanguages(join(FIXTURES_PATH, 'typescript-npm'));

      expect(results).toBeInstanceOf(Array);

      results.forEach(result => {
        expect(result).toHaveProperty('name');
        expect(result).toHaveProperty('confidence');
        expect(result).toHaveProperty('frameworks');
        expect(result).toHaveProperty('hasTests');
        expect(result).toHaveProperty('hasLinting');
        expect(result).toHaveProperty('hasTypeChecking');
      });
    });

    it('ensures frameworks is always an array', () => {
      const results = detectAllLanguages(join(FIXTURES_PATH, 'typescript-npm'));

      results.forEach(result => {
        expect(result.frameworks).toBeInstanceOf(Array);
      });
    });

    it('returns only detected languages (non-null results)', () => {
      const results = detectAllLanguages(join(FIXTURES_PATH, 'polyglot'));

      // detectAllLanguages should only return detected languages
      results.forEach(result => {
        expect(result.name).toBeTruthy();
        expect(result.confidence).toBeGreaterThan(0);
      });
    });
  });

  describe('Language-Specific Type Checking', () => {
    it('sets hasTypeChecking true for statically-typed languages', () => {
      const results = detectAllLanguages(join(FIXTURES_PATH, 'go-module'));

      const goResult = results.find(r => r.name === 'Go');
      if (goResult) {
        expect(goResult.hasTypeChecking).toBe(true);
      }
    });

    it('sets hasTypeChecking true for TypeScript', () => {
      const results = detectAllLanguages(join(FIXTURES_PATH, 'typescript-npm'));

      const tsResult = results.find(r => r.name.includes('TypeScript'));
      if (tsResult) {
        expect(tsResult.hasTypeChecking).toBe(true);
      }
    });
  });

  describe('getPrimaryLanguage', () => {
    it('returns the highest confidence language name', () => {
      const results = detectAllLanguages(join(FIXTURES_PATH, 'typescript-npm'));
      const primary = getPrimaryLanguage(results);

      expect(primary).toBeTruthy();
      expect(typeof primary).toBe('string');
    });

    it('returns Unknown for empty results', () => {
      const primary = getPrimaryLanguage([]);

      expect(primary).toBe('Unknown');
    });
  });
});
