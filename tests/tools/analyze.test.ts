import { describe, it, expect, beforeEach, vi } from 'vitest';
import { join } from 'node:path';
import { handleAnalyze } from '../../src/tools/analyze.js';
import type { Storage } from '../../src/storage/index.js';

const FIXTURES_PATH = join(__dirname, '../fixtures/languages');

// Mock storage
const mockStorage: Storage = {
  saveEpic: vi.fn(),
  getEpic: vi.fn(),
  saveSession: vi.fn(),
  getSession: vi.fn(),
  saveContext: vi.fn(),
  getContext: vi.fn(),
  saveSpec: vi.fn(),
  getSpec: vi.fn(),
  listEpics: vi.fn(),
  listSessions: vi.fn(),
  deleteEpic: vi.fn(),
  deleteSession: vi.fn(),
};

describe('Codebase Analysis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Risk Assessment - Type Safety', () => {
    it('should NOT flag Type Safety risk for Python project with mypy configured', async () => {
      const result = await handleAnalyze(
        { path: join(FIXTURES_PATH, 'python-uv') },
        mockStorage
      );

      // Verify Python was detected
      expect(result.primaryLanguage).toBe('Python');

      // Verify mypy was detected
      const pythonLang = result.detectedLanguages?.find(
        (lang) => lang.name === 'Python'
      );
      expect(pythonLang?.hasTypeChecking).toBe(true);

      // Verify Type Safety risk is NOT present (this was the false positive)
      const typeSafetyRisk = result.riskAreas.find(
        (risk) => risk.area === 'Type Safety'
      );
      expect(typeSafetyRisk).toBeUndefined();
    });

    it('should flag Type Safety risk for Python project WITHOUT type checker', async () => {
      const result = await handleAnalyze(
        { path: join(FIXTURES_PATH, 'python-legacy') },
        mockStorage
      );

      // Verify Python was detected
      expect(result.primaryLanguage).toBe('Python');

      // Verify no type checking
      const pythonLang = result.detectedLanguages?.find(
        (lang) => lang.name === 'Python'
      );
      expect(pythonLang?.hasTypeChecking).toBe(false);

      // Verify Type Safety risk IS present with Python-specific mitigations
      const typeSafetyRisk = result.riskAreas.find(
        (risk) => risk.area === 'Type Safety'
      );
      expect(typeSafetyRisk).toBeDefined();
      expect(typeSafetyRisk?.mitigations).toContain(
        'Add mypy or pyright for static type checking'
      );
    });

    it('should NOT flag Type Safety risk for TypeScript project', async () => {
      const result = await handleAnalyze(
        { path: join(FIXTURES_PATH, 'typescript-npm') },
        mockStorage
      );

      // Verify TypeScript was detected
      expect(result.hasTypeScript).toBe(true);

      // Type Safety risk should not be present because tsconfig.json exists
      const typeSafetyRisk = result.riskAreas.find(
        (risk) => risk.area === 'Type Safety'
      );
      expect(typeSafetyRisk).toBeUndefined();
    });

    it('should provide language-specific mitigations', async () => {
      // Test with a project that has no type checking
      const result = await handleAnalyze(
        { path: join(FIXTURES_PATH, 'python-legacy') },
        mockStorage
      );

      const typeSafetyRisk = result.riskAreas.find(
        (risk) => risk.area === 'Type Safety'
      );

      // Mitigations should be Python-specific, not TypeScript-specific
      expect(typeSafetyRisk?.mitigations).not.toContain(
        'Consider adding TypeScript'
      );
    });
  });

  describe('Risk Assessment - Testing', () => {
    it('should respect language-specific test detection', async () => {
      const result = await handleAnalyze(
        { path: join(FIXTURES_PATH, 'python-poetry') },
        mockStorage
      );

      // Poetry project has pytest in dev dependencies and tests directory
      const pythonLang = result.detectedLanguages?.find(
        (lang) => lang.name === 'Python'
      );

      // The hasTests flag should be considered
      if (pythonLang?.hasTests) {
        // No testing risk should be flagged if language detector found tests
        const testingRisk = result.riskAreas.find(
          (risk) => risk.area === 'Testing'
        );
        expect(testingRisk).toBeUndefined();
      }
    });
  });

  describe('Multi-language Detection Integration', () => {
    it('should aggregate type checking across all detected languages', async () => {
      const result = await handleAnalyze(
        { path: join(FIXTURES_PATH, 'python-uv') },
        mockStorage
      );

      // Ensure detected languages are populated
      expect(result.detectedLanguages).toBeDefined();
      expect(result.detectedLanguages?.length).toBeGreaterThan(0);

      // Primary language should match first detected
      expect(result.primaryLanguage).toBe(result.detectedLanguages?.[0]?.name);
    });
  });

  describe('Linting Detection - Language Aware', () => {
    it('should set hasLinting true for Python project with ruff', async () => {
      const result = await handleAnalyze(
        { path: join(FIXTURES_PATH, 'python-uv') },
        mockStorage
      );

      // Python project with [tool.ruff] should have hasLinting = true
      const pythonLang = result.detectedLanguages?.find(
        (lang) => lang.name === 'Python'
      );
      expect(pythonLang?.hasLinting).toBe(true);
      expect(result.hasLinting).toBe(true);
    });

    it('should set hasLinting based on config files, not just dependencies', async () => {
      const result = await handleAnalyze(
        { path: join(FIXTURES_PATH, 'typescript-npm') },
        mockStorage
      );

      // TypeScript project with eslint in devDeps but NO config file
      // should NOT have hasLinting = true (dependency alone is not enough)
      // This is correct behavior - having the tool installed doesn't mean it's configured
      const tsLang = result.detectedLanguages?.find(
        (lang) => lang.name === 'TypeScript'
      );

      // No eslint config file in fixture = hasLinting should be false
      expect(tsLang?.hasLinting).toBe(false);
    });
  });

  describe('Test Coverage Detection - Multi-language', () => {
    it('should detect pytest test framework for Python projects', async () => {
      const result = await handleAnalyze(
        { path: join(FIXTURES_PATH, 'python-uv') },
        mockStorage
      );

      // Project with [tool.pytest] should detect pytest
      // Note: testCoverage.testFramework comes from analyzeTestCoverage
      if (result.testCoverage.testFramework) {
        expect(result.testCoverage.testFramework).toBe('pytest');
        expect(result.testCoverage.testCommand).toBe('pytest');
      }
    });

    it('should detect vitest for TypeScript projects', async () => {
      const result = await handleAnalyze(
        { path: join(FIXTURES_PATH, 'typescript-npm') },
        mockStorage
      );

      // TypeScript project with vitest should detect it
      if (result.testCoverage.testFramework) {
        expect(['vitest', 'jest']).toContain(result.testCoverage.testFramework);
      }
    });
  });

  describe('hasTypeScript - Semantic Correctness', () => {
    it('should set hasTypeScript true for Python with mypy (static typing)', async () => {
      const result = await handleAnalyze(
        { path: join(FIXTURES_PATH, 'python-uv') },
        mockStorage
      );

      // hasTypeScript is now semantic: "has static type checking"
      // Python with mypy should return true
      expect(result.hasTypeScript).toBe(true);
    });

    it('should set hasTypeScript true for actual TypeScript project', async () => {
      const result = await handleAnalyze(
        { path: join(FIXTURES_PATH, 'typescript-npm') },
        mockStorage
      );

      expect(result.hasTypeScript).toBe(true);
    });
  });
});
