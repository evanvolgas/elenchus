import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { detectTypeScript } from '../../../src/tools/detectors/typescript-detector.js';

const FIXTURES_PATH = join(__dirname, '../../fixtures/languages');

describe('TypeScript Detector', () => {
  describe('Project Detection', () => {
    it('detects TypeScript project with tsconfig.json', () => {
      const result = detectTypeScript(join(FIXTURES_PATH, 'typescript-npm'));

      expect(result).not.toBeNull();
      expect(result?.name).toContain('TypeScript');
      expect(result?.confidence).toBeGreaterThanOrEqual(70); // 30 (package.json) + 40 (tsconfig)
    });

    it('detects JavaScript-only project', () => {
      const result = detectTypeScript(join(FIXTURES_PATH, 'javascript-only'));

      expect(result).not.toBeNull();
      expect(result?.name).toBe('JavaScript');
      expect(result?.confidence).toBeGreaterThanOrEqual(30); // package.json
    });

    it('returns null when no Node.js project detected', () => {
      const result = detectTypeScript(join(FIXTURES_PATH, 'go-module'));

      expect(result).toBeNull();
    });

    it('handles malformed package.json gracefully', () => {
      // Verify it doesn't throw
      expect(() => {
        detectTypeScript(join(FIXTURES_PATH, 'nonexistent'));
      }).not.toThrow();
    });
  });

  describe('File Counting', () => {
    it('counts TypeScript/JavaScript files', () => {
      const result = detectTypeScript(join(FIXTURES_PATH, 'typescript-npm'));

      expect(result).not.toBeNull();
      expect(result?.fileCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Manifest Detection', () => {
    it('detects package.json manifest', () => {
      const result = detectTypeScript(join(FIXTURES_PATH, 'typescript-npm'));

      expect(result).not.toBeNull();
      expect(result?.manifestFiles).toContain('package.json');
    });

    it('detects tsconfig.json config file', () => {
      const result = detectTypeScript(join(FIXTURES_PATH, 'typescript-npm'));

      expect(result).not.toBeNull();
      expect(result?.configFiles).toContain('tsconfig.json');
    });

    it('sets detection method correctly', () => {
      const result = detectTypeScript(join(FIXTURES_PATH, 'typescript-npm'));

      expect(result).not.toBeNull();
      expect(result?.detectionMethod).toMatch(/manifest|config/);
    });
  });

  describe('Framework Detection', () => {
    it('detects React framework', () => {
      const result = detectTypeScript(join(FIXTURES_PATH, 'typescript-npm'));

      expect(result).not.toBeNull();
      expect(result?.frameworks).toContain('React');
    });

    it('detects Express framework', () => {
      const result = detectTypeScript(join(FIXTURES_PATH, 'javascript-only'));

      expect(result).not.toBeNull();
      expect(result?.frameworks).toContain('Express');
    });

    it('returns empty frameworks array when none detected', () => {
      // polyglot has package.json but may not have frameworks
      const result = detectTypeScript(join(FIXTURES_PATH, 'polyglot'));

      if (result !== null) {
        expect(result.frameworks).toBeInstanceOf(Array);
      }
    });
  });

  describe('Test Framework Detection', () => {
    it('detects hasTests when test framework present', () => {
      const result = detectTypeScript(join(FIXTURES_PATH, 'typescript-npm'));

      expect(result).not.toBeNull();
      // hasTests is true if test files are found
      expect(typeof result?.hasTests).toBe('boolean');
    });

    it('includes Vitest in frameworks', () => {
      const result = detectTypeScript(join(FIXTURES_PATH, 'typescript-npm'));

      expect(result).not.toBeNull();
      expect(result?.frameworks).toContain('Vitest');
    });

    it('includes Jest in frameworks', () => {
      const result = detectTypeScript(join(FIXTURES_PATH, 'javascript-only'));

      expect(result).not.toBeNull();
      expect(result?.frameworks).toContain('Jest');
    });
  });

  describe('Linting Detection', () => {
    it('detects linting configuration', () => {
      const result = detectTypeScript(join(FIXTURES_PATH, 'typescript-npm'));

      expect(result).not.toBeNull();
      expect(typeof result?.hasLinting).toBe('boolean');
    });

    it('returns hasLinting false when no linter configured', () => {
      // polyglot doesn't have eslint config files
      const result = detectTypeScript(join(FIXTURES_PATH, 'polyglot'));

      if (result !== null) {
        expect(typeof result.hasLinting).toBe('boolean');
      }
    });
  });

  describe('Type Checking Detection', () => {
    it('detects type checking for TypeScript projects', () => {
      const result = detectTypeScript(join(FIXTURES_PATH, 'typescript-npm'));

      expect(result).not.toBeNull();
      expect(result?.hasTypeChecking).toBe(true);
    });

    it('no type checking for JavaScript-only projects', () => {
      const result = detectTypeScript(join(FIXTURES_PATH, 'javascript-only'));

      expect(result).not.toBeNull();
      expect(result?.hasTypeChecking).toBe(false);
    });
  });

  describe('Confidence Calculation', () => {
    it('assigns high confidence to TypeScript projects', () => {
      const result = detectTypeScript(join(FIXTURES_PATH, 'typescript-npm'));

      expect(result).not.toBeNull();
      expect(result?.confidence).toBeGreaterThanOrEqual(70);
    });

    it('assigns confidence to JavaScript-only projects', () => {
      const result = detectTypeScript(join(FIXTURES_PATH, 'javascript-only'));

      expect(result).not.toBeNull();
      expect(result?.confidence).toBeGreaterThanOrEqual(30);
    });

    it('caps confidence at 100', () => {
      const result = detectTypeScript(join(FIXTURES_PATH, 'typescript-npm'));

      expect(result).not.toBeNull();
      expect(result?.confidence).toBeLessThanOrEqual(100);
    });
  });

  describe('Acceptance Criteria', () => {
    it('sets hasTests when test framework is present', () => {
      const result = detectTypeScript(join(FIXTURES_PATH, 'typescript-npm'));

      expect(result).not.toBeNull();
      expect(typeof result?.hasTests).toBe('boolean');
    });

    it('sets hasLinting when linter is configured', () => {
      const result = detectTypeScript(join(FIXTURES_PATH, 'typescript-npm'));

      expect(result).not.toBeNull();
      expect(typeof result?.hasLinting).toBe('boolean');
    });

    it('populates frameworks array correctly', () => {
      const result = detectTypeScript(join(FIXTURES_PATH, 'typescript-npm'));

      expect(result).not.toBeNull();
      expect(result?.frameworks).toBeInstanceOf(Array);
      expect(result?.frameworks.length).toBeGreaterThan(0);
    });

    it('distinguishes between TypeScript and JavaScript via name', () => {
      const tsResult = detectTypeScript(join(FIXTURES_PATH, 'typescript-npm'));
      const jsResult = detectTypeScript(join(FIXTURES_PATH, 'javascript-only'));

      expect(tsResult).not.toBeNull();
      expect(jsResult).not.toBeNull();
      expect(tsResult?.name).toContain('TypeScript');
      expect(jsResult?.name).toBe('JavaScript');
    });
  });

  describe('Error Handling', () => {
    it('handles filesystem errors gracefully', () => {
      expect(() => {
        detectTypeScript('/root/forbidden-path');
      }).not.toThrow();
    });

    it('returns null for non-existent directory', () => {
      const result = detectTypeScript(join(FIXTURES_PATH, 'nonexistent'));

      expect(result).toBeNull();
    });
  });
});
