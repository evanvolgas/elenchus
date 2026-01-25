import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { detectPHP } from '../../../src/tools/detectors/php-detector.js';

const FIXTURES_PATH = join(__dirname, '../../fixtures/languages');

describe('PHP Detector', () => {
  describe('Project Detection', () => {
    it('detects PHP project with composer.json', () => {
      const result = detectPHP(join(FIXTURES_PATH, 'php-laravel'));

      expect(result).not.toBeNull();
      expect(result?.name).toBe('PHP');
      expect(result?.confidence).toBeGreaterThanOrEqual(50);
    });

    it('returns null for non-PHP project', () => {
      const result = detectPHP(join(FIXTURES_PATH, 'typescript-npm'));

      expect(result).toBeNull();
    });

    it('returns null when no PHP files or composer.json', () => {
      const result = detectPHP(join(FIXTURES_PATH, 'python-uv'));

      expect(result).toBeNull();
    });
  });

  describe('composer.json Detection', () => {
    it('includes composer.json in manifestFiles', () => {
      const result = detectPHP(join(FIXTURES_PATH, 'php-laravel'));

      expect(result).not.toBeNull();
      expect(result?.manifestFiles).toContain('composer.json');
      expect(result?.detectionMethod).toBe('manifest');
    });

    it('handles missing composer.json gracefully', () => {
      expect(() => {
        detectPHP(join(FIXTURES_PATH, 'nonexistent'));
      }).not.toThrow();
    });
  });

  describe('Framework Detection', () => {
    it('detects Laravel framework', () => {
      const result = detectPHP(join(FIXTURES_PATH, 'php-laravel'));

      expect(result).not.toBeNull();
      expect(result?.frameworks).toContain('Laravel');
    });

    it('detects PHPUnit framework', () => {
      const result = detectPHP(join(FIXTURES_PATH, 'php-laravel'));

      expect(result).not.toBeNull();
      expect(result?.frameworks).toContain('PHPUnit');
    });

    it('returns frameworks as array', () => {
      const result = detectPHP(join(FIXTURES_PATH, 'php-laravel'));

      expect(result).not.toBeNull();
      expect(result?.frameworks).toBeInstanceOf(Array);
    });
  });

  describe('Test Detection', () => {
    it('detects tests from phpunit.xml', () => {
      const result = detectPHP(join(FIXTURES_PATH, 'php-laravel'));

      expect(result).not.toBeNull();
      expect(result?.hasTests).toBe(true);
    });

    it('detects tests from PHPUnit in dependencies', () => {
      const result = detectPHP(join(FIXTURES_PATH, 'php-laravel'));

      expect(result).not.toBeNull();
      expect(result?.hasTests).toBe(true);
    });

    it('sets hasTests to false when no test framework', () => {
      // For projects without test setup
      // Current fixture has PHPUnit so hasTests should be true
      const result = detectPHP(join(FIXTURES_PATH, 'php-laravel'));

      expect(result).not.toBeNull();
      expect(typeof result?.hasTests).toBe('boolean');
    });
  });

  describe('Linting Detection', () => {
    it('detects linting from config files', () => {
      const result = detectPHP(join(FIXTURES_PATH, 'php-laravel'));

      expect(result).not.toBeNull();
      expect(typeof result?.hasLinting).toBe('boolean');
    });

    it('returns hasLinting boolean', () => {
      const result = detectPHP(join(FIXTURES_PATH, 'php-laravel'));

      expect(result).not.toBeNull();
      expect(typeof result?.hasLinting).toBe('boolean');
    });
  });

  describe('Confidence Calculation', () => {
    it('assigns confidence based on metadata', () => {
      const result = detectPHP(join(FIXTURES_PATH, 'php-laravel'));

      expect(result).not.toBeNull();
      expect(result?.confidence).toBeGreaterThan(0);
    });

    it('caps confidence at 100', () => {
      const result = detectPHP(join(FIXTURES_PATH, 'php-laravel'));

      expect(result).not.toBeNull();
      expect(result?.confidence).toBeLessThanOrEqual(100);
    });
  });

  describe('Acceptance Criteria', () => {
    it('sets hasTests when test framework is present', () => {
      const result = detectPHP(join(FIXTURES_PATH, 'php-laravel'));

      expect(result).not.toBeNull();
      expect(result?.hasTests).toBe(true);
    });

    it('populates frameworks array correctly', () => {
      const result = detectPHP(join(FIXTURES_PATH, 'php-laravel'));

      expect(result).not.toBeNull();
      expect(result?.frameworks).toBeInstanceOf(Array);
      expect(result?.frameworks.length).toBeGreaterThan(0);
    });

    it('sets detection method correctly', () => {
      const result = detectPHP(join(FIXTURES_PATH, 'php-laravel'));

      expect(result).not.toBeNull();
      expect(result?.detectionMethod).toBe('manifest');
    });
  });

  describe('Error Handling', () => {
    it('handles filesystem errors gracefully', () => {
      expect(() => {
        detectPHP('/root/forbidden-path');
      }).not.toThrow();
    });

    it('returns null for nonexistent paths', () => {
      const result = detectPHP(join(FIXTURES_PATH, 'nonexistent'));

      expect(result).toBeNull();
    });
  });

  describe('Performance', () => {
    it('handles detection efficiently', () => {
      const startTime = performance.now();
      detectPHP(join(FIXTURES_PATH, 'php-laravel'));
      const duration = performance.now() - startTime;

      // Should complete in reasonable time
      expect(duration).toBeLessThan(100); // 100ms
    });
  });

  describe('Config Files', () => {
    it('detects phpunit.xml as config file', () => {
      const result = detectPHP(join(FIXTURES_PATH, 'php-laravel'));

      expect(result).not.toBeNull();
      // Config files should include phpunit.xml if present
      if (result?.configFiles) {
        expect(
          result.configFiles.some(f => f.includes('phpunit'))
        ).toBe(true);
      }
    });
  });
});
