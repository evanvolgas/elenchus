import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Storage } from '../storage/index.js';
import {
  type CodebaseContext,
  type Convention,
  type Dependency,
  type DetectedLanguage,
  type FileReference,
  type RiskAssessment,
  AnalyzeInputSchema,
} from '../types/index.js';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { glob } from 'glob';
import { detectAllLanguages } from './detectors/index.js';
import { logger } from '../utils/logger.js';
import { validatePath, sanitizeGlobPattern, InvalidPathError, PathTraversalError } from '../utils/path-security.js';

/**
 * Tool definition for codebase analysis
 */
export const analyzeTool: Tool = {
  name: 'elenchus_analyze',
  description: `Analyze a codebase to understand its context, patterns, and conventions.

Detects:
- Codebase maturity (greenfield, early, established, legacy)
- Architecture patterns (monolith, microservices, serverless, etc.)
- Code conventions (naming, structure, testing patterns)
- Dependencies and tech stack
- Risk areas and relevant files

Use this before generating specs to ensure they fit the existing codebase.`,

  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to analyze (defaults to current directory)',
        default: '.',
      },
      depth: {
        type: 'string',
        enum: ['shallow', 'medium', 'deep'],
        description: 'Analysis depth (affects time and detail)',
        default: 'medium',
      },
      focusAreas: {
        type: 'array',
        items: { type: 'string' },
        description: 'Specific areas to analyze deeper',
      },
      epicId: {
        type: 'string',
        description: 'Associate analysis with an epic for relevance scoring',
      },
    },
  },
};

/**
 * Handle codebase analysis
 */
export async function handleAnalyze(
  args: Record<string, unknown>,
  storage: Storage
): Promise<CodebaseContext> {
  const input = AnalyzeInputSchema.parse(args);

  // Validate and normalize path to prevent directory traversal attacks
  let rootPath: string;
  try {
    rootPath = validatePath(input.path, {
      mustExist: true,
      mustBeDirectory: true,
    });
  } catch (error) {
    if (error instanceof PathTraversalError) {
      throw new Error(`Security error: Path traversal attempt detected in "${input.path}"`);
    }
    if (error instanceof InvalidPathError) {
      throw new Error(`Invalid path: ${error.reason}`);
    }
    throw error;
  }

  const now = new Date().toISOString();

  // Analyze components
  const packageJson = readPackageJson(rootPath);
  const maturity = detectMaturity(rootPath, packageJson);
  const architecture = detectArchitecture(rootPath);
  const conventions = detectConventions(rootPath);
  const dependencies = extractDependencies(packageJson);
  const testCoverage = analyzeTestCoverage(rootPath);
  const contextFiles = findContextFiles(rootPath);

  // Sanitize focus areas to prevent glob injection attacks
  const sanitizedFocusAreas = (input.focusAreas ?? [])
    .map(area => sanitizeGlobPattern(area))
    .filter(area => area.length > 0);

  const relevantFiles = findRelevantFiles(rootPath, sanitizedFocusAreas);

  // Multi-language detection (must happen before risk assessment)
  const detectedLanguages = detectAllLanguages(rootPath);
  const primaryLanguage = detectedLanguages.length > 0
    ? (detectedLanguages[0]?.name ?? 'Unknown')
    : detectPrimaryLanguage(rootPath, packageJson);

  // Aggregate frameworks from all detected languages
  const allFrameworks = detectedLanguages.flatMap((lang) => lang.frameworks);
  const legacyFrameworks = detectFrameworks(packageJson);
  const frameworks = [...new Set([...allFrameworks, ...legacyFrameworks])];

  // Risk assessment (uses detected languages for language-aware checks)
  const riskAreas = assessRisks(rootPath, maturity, detectedLanguages);

  // Derive quality signals from detected languages to avoid false positives
  const anyLanguageHasLinting = detectedLanguages.some(lang => lang.hasLinting);
  const anyLanguageHasTypeChecking = detectedLanguages.some(lang => lang.hasTypeChecking);

  const context: CodebaseContext = {
    analyzedAt: now,
    rootPath,
    analysisDepth: input.depth,
    maturity,
    architecture,
    primaryLanguage,
    detectedLanguages,
    frameworks,
    conventions,
    suggestedPatterns: [],
    dependencies,
    testCoverage,
    hasTypeScript: existsSync(join(rootPath, 'tsconfig.json')) || anyLanguageHasTypeChecking,
    hasLinting: hasLintingConfig(rootPath) || anyLanguageHasLinting,
    hasCICD: hasCICDConfig(rootPath),
    riskAreas,
    relevantFiles,
    contextFiles,
  };

  // Save to storage
  storage.saveContext(context, input.epicId);

  return context;
}

function readPackageJson(rootPath: string): Record<string, unknown> | null {
  const packagePath = join(rootPath, 'package.json');
  if (!existsSync(packagePath)) return null;

  try {
    const content = readFileSync(packagePath, 'utf-8');
    return JSON.parse(content) as Record<string, unknown>;
  } catch (error) {
    logger.warn('Failed to read package.json', error, { path: packagePath });
    return null;
  }
}

function detectMaturity(
  rootPath: string,
  _packageJson: Record<string, unknown> | null
): CodebaseContext['maturity'] {
  // Count files across all supported languages
  let fileCount = 0;
  let testCount = 0;

  try {
    const files = glob.sync('**/*.{ts,tsx,js,jsx,py,go,rs,php}', {
      cwd: rootPath,
      ignore: ['node_modules/**', 'dist/**', 'build/**', '.git/**', 'venv/**', '.venv/**', 'vendor/**'],
    });
    fileCount = files.length;

    // Count test files with language-aware patterns
    testCount = files.filter(f =>
      // JavaScript/TypeScript patterns
      f.includes('.test.') ||
      f.includes('.spec.') ||
      f.includes('__tests__') ||
      // Python patterns
      f.startsWith('test_') ||
      f.includes('/test_') ||
      f.includes('_test.py') ||
      // Go patterns
      f.endsWith('_test.go')
    ).length;
  } catch (error) {
    logger.warn('Failed to glob source files during maturity detection', error, { rootPath });
  }

  // Check for common maturity signals
  const hasTests = testCount > 0;
  const hasCI = hasCICDConfig(rootPath);
  const hasStaticTyping = hasStaticTypeConfig(rootPath);
  const hasReadme = existsSync(join(rootPath, 'README.md'));
  const hasDocs = existsSync(join(rootPath, 'docs'));

  // Score maturity
  let score = 0;
  if (hasTests) score += 2;
  if (hasCI) score += 2;
  if (hasStaticTyping) score += 1;
  if (hasReadme) score += 1;
  if (hasDocs) score += 1;
  if (fileCount > 50) score += 1;
  if (testCount > 10) score += 1;

  if (fileCount === 0) return 'greenfield';
  if (score <= 2) return 'early';
  if (score <= 5) return 'established';
  return 'legacy';
}

/**
 * Check for static type configuration (language-agnostic)
 */
function hasStaticTypeConfig(rootPath: string): boolean {
  const typeConfigs = [
    // TypeScript
    'tsconfig.json',
    // Python
    'mypy.ini',
    'pyrightconfig.json',
    '.mypy.ini',
    // Pyproject.toml with [tool.mypy] is handled by detector
  ];

  // Also check pyproject.toml for [tool.mypy] or [tool.pyright]
  const pyprojectPath = join(rootPath, 'pyproject.toml');
  if (existsSync(pyprojectPath)) {
    try {
      const content = readFileSync(pyprojectPath, 'utf-8');
      if (content.includes('[tool.mypy]') || content.includes('[tool.pyright]')) {
        return true;
      }
    } catch {
      // Ignore read errors
    }
  }

  return typeConfigs.some(config => existsSync(join(rootPath, config)));
}

function detectArchitecture(rootPath: string): CodebaseContext['architecture'] {
  // Check for common architectural patterns
  const hasDocker = existsSync(join(rootPath, 'Dockerfile')) ||
                    existsSync(join(rootPath, 'docker-compose.yml'));
  const hasServerless = existsSync(join(rootPath, 'serverless.yml')) ||
                        existsSync(join(rootPath, 'serverless.ts'));
  const hasKubernetes = existsSync(join(rootPath, 'k8s')) ||
                        existsSync(join(rootPath, 'kubernetes'));
  const hasPackages = existsSync(join(rootPath, 'packages'));
  const hasApps = existsSync(join(rootPath, 'apps'));
  const hasMicroservices = existsSync(join(rootPath, 'services')) && hasDocker;

  if (hasServerless) return 'serverless';
  if (hasMicroservices || hasKubernetes) return 'microservices';
  if (hasPackages || hasApps) return 'modular-monolith';
  if (hasDocker) return 'hybrid';

  return 'monolith';
}

function detectConventions(rootPath: string): Convention[] {
  const conventions: Convention[] = [];

  // Check for eslint config
  if (existsSync(join(rootPath, '.eslintrc.json')) ||
      existsSync(join(rootPath, '.eslintrc.js')) ||
      existsSync(join(rootPath, 'eslint.config.js'))) {
    conventions.push({
      type: 'naming',
      pattern: 'ESLint configured',
      examples: ['Enforced via .eslintrc'],
      confidence: 90,
    });
  }

  // Check for prettier config
  if (existsSync(join(rootPath, '.prettierrc')) ||
      existsSync(join(rootPath, '.prettierrc.json')) ||
      existsSync(join(rootPath, 'prettier.config.js'))) {
    conventions.push({
      type: 'other',
      pattern: 'Prettier formatting',
      examples: ['Enforced via Prettier'],
      confidence: 90,
    });
  }

  // Check src structure
  if (existsSync(join(rootPath, 'src'))) {
    conventions.push({
      type: 'file-structure',
      pattern: 'src/ directory for source code',
      examples: ['src/index.ts', 'src/components/'],
      confidence: 80,
    });
  }

  // Check test structure
  if (existsSync(join(rootPath, '__tests__'))) {
    conventions.push({
      type: 'testing',
      pattern: '__tests__ directory for tests',
      examples: ['__tests__/component.test.ts'],
      confidence: 80,
    });
  } else if (existsSync(join(rootPath, 'tests'))) {
    conventions.push({
      type: 'testing',
      pattern: 'tests/ directory for tests',
      examples: ['tests/component.test.ts'],
      confidence: 80,
    });
  }

  return conventions;
}

function extractDependencies(
  packageJson: Record<string, unknown> | null
): Dependency[] {
  if (!packageJson) return [];

  const dependencies: Dependency[] = [];

  const addDeps = (deps: unknown, type: Dependency['type']) => {
    if (typeof deps !== 'object' || deps === null) return;
    for (const [name, version] of Object.entries(deps)) {
      dependencies.push({
        name,
        version: String(version),
        type,
      });
    }
  };

  addDeps(packageJson['dependencies'], 'production');
  addDeps(packageJson['devDependencies'], 'development');
  addDeps(packageJson['peerDependencies'], 'peer');
  addDeps(packageJson['optionalDependencies'], 'optional');

  return dependencies;
}

function detectPrimaryLanguage(
  rootPath: string,
  packageJson: Record<string, unknown> | null
): string {
  // Check for TypeScript
  if (existsSync(join(rootPath, 'tsconfig.json'))) {
    return 'TypeScript';
  }

  // Check package.json for hints
  if (packageJson) {
    const deps = {
      ...((packageJson['dependencies'] as Record<string, string>) ?? {}),
      ...((packageJson['devDependencies'] as Record<string, string>) ?? {}),
    };
    if ('typescript' in deps) return 'TypeScript';
  }

  // Check for other language files
  const pyFiles = glob.sync('**/*.py', { cwd: rootPath, ignore: ['node_modules/**'] });
  if (pyFiles.length > 0) return 'Python';

  const goFiles = glob.sync('**/*.go', { cwd: rootPath, ignore: ['node_modules/**'] });
  if (goFiles.length > 0) return 'Go';

  const rsFiles = glob.sync('**/*.rs', { cwd: rootPath, ignore: ['node_modules/**'] });
  if (rsFiles.length > 0) return 'Rust';

  return 'JavaScript';
}

function detectFrameworks(packageJson: Record<string, unknown> | null): string[] {
  if (!packageJson) return [];

  const frameworks: string[] = [];
  const allDeps = {
    ...((packageJson['dependencies'] as Record<string, string>) ?? {}),
    ...((packageJson['devDependencies'] as Record<string, string>) ?? {}),
  };

  // Frontend frameworks
  if ('react' in allDeps) frameworks.push('React');
  if ('vue' in allDeps) frameworks.push('Vue');
  if ('svelte' in allDeps) frameworks.push('Svelte');
  if ('next' in allDeps) frameworks.push('Next.js');
  if ('nuxt' in allDeps) frameworks.push('Nuxt');

  // Backend frameworks
  if ('express' in allDeps) frameworks.push('Express');
  if ('fastify' in allDeps) frameworks.push('Fastify');
  if ('hono' in allDeps) frameworks.push('Hono');
  if ('nestjs' in allDeps || '@nestjs/core' in allDeps) frameworks.push('NestJS');

  // Testing
  if ('jest' in allDeps) frameworks.push('Jest');
  if ('vitest' in allDeps) frameworks.push('Vitest');
  if ('mocha' in allDeps) frameworks.push('Mocha');

  return frameworks;
}

function analyzeTestCoverage(rootPath: string): CodebaseContext['testCoverage'] {
  let hasTests = false;
  let testFramework: string | undefined;
  let testCommand: string | undefined;

  // Check for test files across all languages
  try {
    const ignorePatterns = ['node_modules/**', 'dist/**', 'venv/**', '.venv/**', 'vendor/**', '__pycache__/**'];

    // JavaScript/TypeScript test patterns
    const jsTestFiles = glob.sync('**/*.{test,spec}.{ts,tsx,js,jsx}', {
      cwd: rootPath,
      ignore: ignorePatterns,
    });

    // Python test patterns (test_*.py or *_test.py)
    const pyTestFiles = glob.sync('**/test_*.py', {
      cwd: rootPath,
      ignore: ignorePatterns,
    });
    const pyTestFiles2 = glob.sync('**/*_test.py', {
      cwd: rootPath,
      ignore: ignorePatterns,
    });

    // Go test patterns (*_test.go)
    const goTestFiles = glob.sync('**/*_test.go', {
      cwd: rootPath,
      ignore: ignorePatterns,
    });

    hasTests = jsTestFiles.length > 0 || pyTestFiles.length > 0 || pyTestFiles2.length > 0 || goTestFiles.length > 0;
  } catch (error) {
    logger.warn('Failed to glob test files', error, { rootPath });
  }

  // Detect test framework from package.json (JavaScript/TypeScript)
  const packagePath = join(rootPath, 'package.json');
  if (existsSync(packagePath)) {
    try {
      const pkg = JSON.parse(readFileSync(packagePath, 'utf-8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if ('vitest' in deps) {
        testFramework = 'vitest';
        testCommand = 'npm test';
      } else if ('jest' in deps) {
        testFramework = 'jest';
        testCommand = 'npm test';
      } else if ('mocha' in deps) {
        testFramework = 'mocha';
        testCommand = 'npm test';
      }
    } catch (error) {
      logger.warn('Failed to parse package.json for test framework detection', error, { packagePath });
    }
  }

  // Detect pytest from pyproject.toml or pytest.ini (Python)
  if (!testFramework) {
    const pyprojectPath = join(rootPath, 'pyproject.toml');
    const pytestIniPath = join(rootPath, 'pytest.ini');

    if (existsSync(pytestIniPath)) {
      testFramework = 'pytest';
      testCommand = 'pytest';
    } else if (existsSync(pyprojectPath)) {
      try {
        const content = readFileSync(pyprojectPath, 'utf-8');
        if (content.includes('[tool.pytest]') || content.includes('pytest')) {
          testFramework = 'pytest';
          testCommand = 'pytest';
        }
      } catch {
        // Ignore read errors
      }
    }
  }

  // Detect Go testing
  if (!testFramework && existsSync(join(rootPath, 'go.mod'))) {
    testFramework = 'go test';
    testCommand = 'go test ./...';
  }

  return {
    overallPercentage: hasTests ? 50 : 0, // Placeholder - would need actual coverage run
    hasTests,
    testFramework,
    testCommand,
    criticalPathsCovered: hasTests,
  };
}

function findContextFiles(rootPath: string): CodebaseContext['contextFiles'] {
  const readIfExists = (path: string): string | undefined => {
    const fullPath = join(rootPath, path);
    if (existsSync(fullPath)) {
      try {
        return readFileSync(fullPath, 'utf-8');
      } catch (error) {
        logger.debug('Failed to read context file', error, { path: fullPath });
        return undefined;
      }
    }
    return undefined;
  };

  return {
    claudeMd: readIfExists('CLAUDE.md') ?? readIfExists('.claude/CLAUDE.md'),
    agentsMd: readIfExists('AGENTS.md') ?? readIfExists('.agents/AGENTS.md'),
    conventionsMd: readIfExists('CONVENTIONS.md'),
    readme: readIfExists('README.md'),
  };
}

function assessRisks(
  rootPath: string,
  maturity: CodebaseContext['maturity'],
  detectedLanguages: DetectedLanguage[]
): RiskAssessment[] {
  const risks: RiskAssessment[] = [];

  // Check if any detected language has test coverage
  const anyLanguageHasTests = detectedLanguages.some(lang => lang.hasTests);

  // No tests risk - check both directory structure and language-specific detection
  const hasTestsDirectory = existsSync(join(rootPath, '__tests__')) ||
                            existsSync(join(rootPath, 'tests'));
  if (!hasTestsDirectory && !anyLanguageHasTests && maturity !== 'greenfield') {
    risks.push({
      area: 'Testing',
      level: 'high',
      reason: 'No test directory found. Changes may introduce regressions.',
      mitigations: ['Add test coverage before major changes', 'Use TDD for new features'],
    });
  }

  // Type safety risk - check language-specific type checking, not just TypeScript
  const anyLanguageHasTypeChecking = detectedLanguages.some(lang => lang.hasTypeChecking);
  const hasTypeScriptConfig = existsSync(join(rootPath, 'tsconfig.json'));

  if (!hasTypeScriptConfig && !anyLanguageHasTypeChecking) {
    // Determine appropriate mitigation based on primary language
    const primaryLang = detectedLanguages.length > 0 ? detectedLanguages[0] : null;
    const mitigations = getTypeCheckingMitigations(primaryLang?.name);

    risks.push({
      area: 'Type Safety',
      level: 'medium',
      reason: 'No static type checking configured. Type errors may go undetected.',
      mitigations,
    });
  }

  // No CI risk
  if (!existsSync(join(rootPath, '.github/workflows')) &&
      !existsSync(join(rootPath, '.gitlab-ci.yml'))) {
    risks.push({
      area: 'CI/CD',
      level: 'medium',
      reason: 'No CI configuration found. Code quality may not be automatically verified.',
      mitigations: ['Add GitHub Actions or GitLab CI', 'Run tests locally before commits'],
    });
  }

  return risks;
}

/**
 * Check for linting configuration (language-agnostic)
 */
function hasLintingConfig(rootPath: string): boolean {
  const lintConfigs = [
    // JavaScript/TypeScript
    '.eslintrc.json',
    '.eslintrc.js',
    '.eslintrc.cjs',
    '.eslintrc.yaml',
    '.eslintrc.yml',
    'eslint.config.js',
    'eslint.config.mjs',
    // Python
    'ruff.toml',
    '.ruff.toml',
    '.pylintrc',
    '.flake8',
    // Go
    '.golangci.yml',
    '.golangci.yaml',
    // PHP
    'phpstan.neon',
    'phpstan.neon.dist',
    'psalm.xml',
  ];

  return lintConfigs.some(config => existsSync(join(rootPath, config)));
}

/**
 * Check for CI/CD configuration
 */
function hasCICDConfig(rootPath: string): boolean {
  const ciConfigs = [
    '.github/workflows',
    '.gitlab-ci.yml',
    'Jenkinsfile',
    '.circleci/config.yml',
    '.travis.yml',
    'azure-pipelines.yml',
    'bitbucket-pipelines.yml',
  ];

  return ciConfigs.some(config => existsSync(join(rootPath, config)));
}

/**
 * Get language-appropriate type checking mitigations
 */
function getTypeCheckingMitigations(language: string | undefined): string[] {
  switch (language) {
    case 'Python':
      return ['Add mypy or pyright for static type checking', 'Use type hints (PEP 484)'];
    case 'Go':
      return ['Go has built-in type checking - ensure go vet is run', 'Add golangci-lint'];
    case 'TypeScript':
    case 'JavaScript':
      return ['Consider adding TypeScript', 'Use JSDoc for type hints'];
    case 'PHP':
      return ['Add PHPStan or Psalm for static analysis', 'Use PHP 8+ typed properties'];
    case 'Rust':
      return ['Rust has built-in type checking - ensure cargo check passes'];
    default:
      return ['Consider adding static type checking for your language'];
  }
}

function findRelevantFiles(rootPath: string, focusAreas: string[]): FileReference[] {
  const files: FileReference[] = [];

  // Find entry points
  const entryPoints = ['src/index.ts', 'src/index.js', 'index.ts', 'index.js', 'main.ts', 'main.js'];
  for (const entry of entryPoints) {
    const fullPath = join(rootPath, entry);
    if (existsSync(fullPath)) {
      files.push({
        path: entry,
        relevance: 100,
        reason: 'Entry point',
      });
      break;
    }
  }

  // Find config files
  const configFiles = ['package.json', 'tsconfig.json', '.env.example'];
  for (const config of configFiles) {
    const fullPath = join(rootPath, config);
    if (existsSync(fullPath)) {
      files.push({
        path: config,
        relevance: 80,
        reason: 'Configuration file',
      });
    }
  }

  // Find files matching focus areas
  for (const area of focusAreas) {
    try {
      const matches = glob.sync(`**/*${area}*`, {
        cwd: rootPath,
        ignore: ['node_modules/**', 'dist/**', '.git/**'],
        nodir: true,
      });
      for (const match of matches.slice(0, 5)) {
        files.push({
          path: match,
          relevance: 70,
          reason: `Matches focus area: ${area}`,
        });
      }
    } catch (error) {
      logger.warn('Failed to glob files for focus area', error, { area, rootPath });
    }
  }

  return files;
}
