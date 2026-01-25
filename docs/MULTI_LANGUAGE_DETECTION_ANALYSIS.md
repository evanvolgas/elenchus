# Multi-Language Project Detection - Requirements Analysis

**Status**: Research Phase
**Priority**: High (Python detection broken in MVP)
**Date**: 2026-01-24

## Executive Summary

Elenchus currently only detects TypeScript/JavaScript projects via `package.json`. To support Python, PHP, and Go projects, we need a manifest-file-first detection strategy with language-specific parsers and framework detection.

**Key Insight**: Don't glob entire source trees. Parse only manifest files (declarative), then infer frameworks from declared dependencies.

---

## 1. Current State Analysis

### 1.1 What Works
- **JavaScript/TypeScript**: Fully functional via `package.json`
- **Basic language detection**: Fallback file globbing (finds `*.py`, `*.go`, `*.rs`)
- **Framework detection**: Dependency-based (React, Express, etc.)

### 1.2 What's Broken
- **Python projects**: No `pyproject.toml` parsing
  - uv-managed projects not detected (same format as poetry)
  - No test framework detection (`pytest`, `unittest`)
  - No type checker detection (`mypy`, `pyright`)
  - Falls back to slow `*.py` globbing
- **PHP projects**: No manifest detection
- **Go projects**: No manifest detection (only fallback `*.go` globbing)

### 1.3 Current Implementation Issues

```typescript
// analyze.ts - detectPrimaryLanguage()
// Problem 1: Falls back to globbing (slow on large repos)
const pyFiles = glob.sync('**/*.py', { cwd: rootPath });
if (pyFiles.length > 0) return 'Python';

// Problem 2: No manifest-based detection
// Doesn't check:
// - pyproject.toml (uv, poetry, setuptools)
// - go.mod (Go modules)
// - composer.json (PHP)
// - composer.lock (locked versions)
```

---

## 2. Recommended Architecture

### 2.1 Detection Flow

```
┌─────────────────────────────────────────────────────┐
│  detectLanguagesAndFrameworks(rootPath)             │
│  (Primary detection function)                       │
└────────┬──────────────────────────────────────────┘
         │
         ├─▶ [ Manifest-First Phase ]
         │   ├─ readPackageJson() → JavaScript/TypeScript
         │   ├─ readPyprojectToml() → Python
         │   ├─ readGoMod() → Go
         │   └─ readComposerJson() → PHP
         │
         ├─▶ [ Parse & Extract ]
         │   ├─ extractNodeDependencies()
         │   ├─ extractPythonDependencies()
         │   ├─ extractGoDependencies()
         │   └─ extractPHPDependencies()
         │
         ├─▶ [ Framework Detection ]
         │   ├─ detectNodeFrameworks()
         │   ├─ detectPythonFrameworks()
         │   ├─ detectGoFrameworks()
         │   └─ detectPHPFrameworks()
         │
         └─▶ [ Consolidate & Return ]
             └─ Merged result with all detected languages/frameworks
```

### 2.2 Data Structure Enhancement

**Current**:
```typescript
interface CodebaseContext {
  primaryLanguage: string;           // Single language
  frameworks: string[];              // All frameworks
  dependencies: Dependency[];         // Mixed languages
}
```

**Proposed**:
```typescript
interface CodebaseContext {
  // Existing (keep for compatibility)
  primaryLanguage: string;           // Still single, but now more accurate
  frameworks: string[];              // Remains merged list
  dependencies: Dependency[];         // Remains merged list

  // New fields
  detectedLanguages: LanguageProfile[];  // All detected languages
  manifestFiles: ManifestInfo[];         // Metadata about found manifests
}

interface LanguageProfile {
  language: string;                     // 'Python', 'Go', 'PHP', 'TypeScript'
  confidence: number;                   // 0-100: manifest found, files exist
  manifest: string;                     // 'pyproject.toml', 'go.mod', etc.
  manifestPath: string;                 // Relative path
  frameworks: string[];                 // Language-specific frameworks
  testFrameworks: string[];             // pytest, vitest, PHPUnit, etc.
  linters: string[];                    // ruff, golangci-lint, etc.
  typeCheckers: string[];               // mypy, pyright, staticcheck, etc.
  dependencies: Dependency[];           // Language-specific deps
  extraMetadata: {
    pythonVersion?: string;             // From pyproject.toml
    pythonPackageManager?: string;      // 'uv' | 'poetry' | 'pip'
    goVersion?: string;                 // From go.mod
    phpVersion?: string;                // From composer.json
    typedLanguage: boolean;             // Has type checking setup
  };
}

interface ManifestInfo {
  path: string;                        // Relative path
  type: string;                        // 'package.json', 'pyproject.toml', etc.
  language: string;                    // 'JavaScript', 'Python', etc.
  exists: boolean;
  readable: boolean;
  parseError?: string;                 // If parsing failed
}
```

---

## 3. Language-Specific Detection Strategy

### 3.1 Python Detection (PRIORITY)

#### 3.1.1 Manifest Parsing: `pyproject.toml`

**Parser**: Use YAML parser (already in dependencies: `yaml` package)

**Key Fields to Extract**:

```toml
# Project metadata
[project]
name = "my-project"
version = "0.1.0"
description = "My Python project"
requires-python = ">=3.10"

# Dependencies
dependencies = [
  "fastapi==0.104.0",
  "pydantic>=2.0,<3.0",
  "sqlalchemy[asyncio]>=2.0",
]

[project.optional-dependencies]
dev = [
  "pytest>=7.0",
  "pytest-cov",
  "mypy>=1.0",
  "ruff",
]

# Tool-specific configs (indicate what's used)
[tool.pytest]
testpaths = ["tests"]
addopts = "-v"

[tool.pytest.ini_options]
minversion = "7.0"

[tool.mypy]
strict = true
disallow_untyped_defs = true

[tool.ruff]
target-version = "py310"

[tool.pyright]
include = ["src"]
pythonVersion = "3.10"

[tool.pylint]
disable = ["missing-docstring"]

[tool.flake8]
# Note: flake8 uses .flake8 file typically, but may be here

[tool.black]
line-length = 100

[tool.uv]
# UV-specific (uv is package manager, not typically in pyproject.toml)
# But metadata may indicate uv usage via presence of uv.lock

[build-system]
requires = ["setuptools>=61.0", "wheel"]
build-backend = "setuptools.build_meta"
```

**Framework Detection Strategy**:

```typescript
const PYTHON_FRAMEWORKS = {
  // Web frameworks
  'fastapi': { category: 'web', name: 'FastAPI' },
  'django': { category: 'web', name: 'Django' },
  'flask': { category: 'web', name: 'Flask' },
  'starlette': { category: 'web', name: 'Starlette' },
  'pyramid': { category: 'web', name: 'Pyramid' },
  'aiohttp': { category: 'async', name: 'aiohttp' },

  // ORM/Database
  'sqlalchemy': { category: 'orm', name: 'SQLAlchemy' },
  'peewee': { category: 'orm', name: 'Peewee' },
  'tortoise-orm': { category: 'orm', name: 'Tortoise ORM' },
  'django-orm': { category: 'orm', name: 'Django ORM' },

  // Validation
  'pydantic': { category: 'validation', name: 'Pydantic' },
  'marshmallow': { category: 'validation', name: 'Marshmallow' },
  'cerberus': { category: 'validation', name: 'Cerberus' },

  // Async
  'asyncio': { category: 'async', name: 'asyncio' },
  'trio': { category: 'async', name: 'Trio' },
  'anyio': { category: 'async', name: 'anyio' },
};
```

**Test Framework Detection**:

```typescript
const PYTHON_TEST_FRAMEWORKS = {
  'pytest': { toolSection: '[tool.pytest]', configFile: 'pytest.ini' },
  'unittest': { builtin: true, configFile: null },
  'nose2': { toolSection: '[tool.nose2]', configFile: '.nose2.cfg' },
  'tox': { toolSection: '[tool.tox]', configFile: 'tox.ini' },
};
```

**Type Checker Detection**:

```typescript
const PYTHON_TYPE_CHECKERS = {
  'mypy': { toolSection: '[tool.mypy]', configFile: 'mypy.ini' },
  'pyright': { toolSection: '[tool.pyright]', configFile: 'pyrightconfig.json' },
  'pyre': { toolSection: '[tool.pyre]', configFile: '.pyre_configuration' },
  'pytype': { toolSection: '[tool.pytype]', configFile: null },
};
```

**Linter Detection**:

```typescript
const PYTHON_LINTERS = {
  'ruff': { toolSection: '[tool.ruff]', configFile: '.ruff.toml' },
  'flake8': { toolSection: '[tool.flake8]', configFile: '.flake8' },
  'pylint': { toolSection: '[tool.pylint]', configFile: '.pylintrc' },
  'black': { toolSection: '[tool.black]', configFile: 'pyproject.toml' },
};
```

#### 3.1.2 Python Package Manager Detection

```typescript
// Detect package manager from files present
function detectPythonPackageManager(rootPath: string): string {
  // Check in order of specificity
  if (existsSync(join(rootPath, 'uv.lock'))) return 'uv';        // Explicit lock file
  if (existsSync(join(rootPath, 'poetry.lock'))) return 'poetry'; // Poetry lock file
  if (existsSync(join(rootPath, 'Pipfile.lock'))) return 'pipenv'; // Pipenv lock file
  if (existsSync(join(rootPath, 'requirements.txt'))) return 'pip'; // Standard pip

  // Check build system from pyproject.toml
  const buildBackend = pyproject?.['build-system']?.['build-backend'];
  if (buildBackend?.includes('poetry')) return 'poetry';
  if (buildBackend?.includes('pdm')) return 'pdm';
  if (buildBackend?.includes('hatch')) return 'hatch';

  return 'unknown';
}
```

#### 3.1.3 Fallback: setup.py Parsing

```typescript
// For legacy projects without pyproject.toml
function readSetupPy(rootPath: string): Record<string, unknown> | null {
  const setupPath = join(rootPath, 'setup.py');
  if (!existsSync(setupPath)) return null;

  try {
    const content = readFileSync(setupPath, 'utf-8');

    // Extract setup() call arguments via simple regex patterns
    // (not full AST parsing to keep simple)

    return {
      name: extractField(content, 'name'),
      version: extractField(content, 'version'),
      install_requires: extractArray(content, 'install_requires'),
      extras_require: extractDict(content, 'extras_require'),
      python_requires: extractField(content, 'python_requires'),
    };
  } catch {
    return null;
  }
}
```

---

### 3.2 TypeScript Detection (Enhance Current)

**Current implementation is good, but add**:

```typescript
// Already works via package.json + tsconfig.json
// Enhancements:

// 1. Detect monorepo patterns
function detectTypeScriptMonorepo(rootPath: string): boolean {
  return existsSync(join(rootPath, 'packages'))    // npm workspaces
      || existsSync(join(rootPath, 'apps'))        // Turborepo
      || existsSync(join(rootPath, 'modules'));    // Custom
}

// 2. Extract tsconfig extends chain for framework hints
function extractTsconfigFramework(rootPath: string): string[] {
  const tsconfigPath = join(rootPath, 'tsconfig.json');
  if (!existsSync(tsconfigPath)) return [];

  const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf-8'));
  const extendsChain = tsconfig['extends'] || [];

  // Infer framework from extends
  if (extendsChain.includes('@nuxt/tsconfig')) return ['Nuxt'];
  if (extendsChain.includes('next/tsconfig')) return ['Next.js'];
  // ... etc

  return [];
}

// 3. Check for special TypeScript configurations
function analyzeTypeScriptConfig(rootPath: string): TypeScriptProfile {
  const tsconfig = readTsconfig(rootPath);

  return {
    version: extractTscriptVersion(rootPath),
    strictMode: tsconfig?.compilerOptions?.strict === true,
    hasDocumentation: tsconfig?.compilerOptions?.declaration === true,
    targetVersion: tsconfig?.compilerOptions?.target,
    moduleResolution: tsconfig?.compilerOptions?.moduleResolution,
  };
}
```

---

### 3.3 Go Detection

#### 3.3.1 Manifest Parsing: `go.mod`

**Parser**: Simple regex-based (not full AST)

```typescript
function readGoMod(rootPath: string): GoModInfo | null {
  const goModPath = join(rootPath, 'go.mod');
  if (!existsSync(goModPath)) return null;

  try {
    const content = readFileSync(goModPath, 'utf-8');
    const lines = content.split('\n');

    const result: GoModInfo = {
      module: '',
      goVersion: '',
      require: [],
      indirect: [],
      exclude: [],
    };

    let section = '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//')) continue;

      if (trimmed === 'require (') section = 'require';
      else if (trimmed === 'exclude (') section = 'exclude';
      else if (trimmed === 'indirect (') section = 'indirect';
      else if (trimmed === ')') section = '';
      else if (trimmed.startsWith('module '))
        result.module = trimmed.replace('module ', '').trim();
      else if (trimmed.startsWith('go '))
        result.goVersion = trimmed.replace('go ', '').trim();
      else if (section === 'require')
        result.require.push(parseDependency(trimmed));
      else if (section === 'exclude')
        result.exclude.push(parseDependency(trimmed));
    }

    return result;
  } catch {
    return null;
  }
}

interface GoModInfo {
  module: string;              // github.com/user/project
  goVersion: string;           // 1.21
  require: GoDependency[];
  indirect: GoDependency[];
  exclude: GoDependency[];
}

interface GoDependency {
  module: string;              // github.com/pkg/package
  version: string;             // v1.2.3
}
```

#### 3.3.2 Go Framework/Tool Detection

```typescript
// Common Go frameworks and tools from dependencies
const GO_FRAMEWORKS = {
  'gin': 'Gin',
  'echo': 'Echo',
  'fiber': 'Fiber',
  'chi': 'Chi',
  'gorilla': 'Gorilla',
  'beego': 'Beego',
  'revel': 'Revel',
  'grpc': 'gRPC',
  'protobuf': 'Protocol Buffers',
};

const GO_TEST_FRAMEWORKS = {
  'testing': 'built-in',      // Built-in testing package
  'testify': 'Testify',       // github.com/stretchr/testify
  'ginkgo': 'Ginkgo',         // github.com/onsi/ginkgo
};

const GO_TOOLS = {
  'golangci-lint': 'GolangCI-Lint',
  'staticcheck': 'StaticCheck',
  'revive': 'Revive',
  'goimports': 'GoImports',
};
```

#### 3.3.3 Go Test Detection

```typescript
// Simpler than Python/PHP: look for *_test.go files
function hasGoTests(rootPath: string): boolean {
  try {
    const testFiles = glob.sync('**/*_test.go', {
      cwd: rootPath,
      ignore: ['vendor/**', '.git/**'],
    });
    return testFiles.length > 0;
  } catch {
    return false;
  }
}

// Check for test config files
function detectGoTestTools(rootPath: string): string[] {
  const tools: string[] = [];

  if (existsSync(join(rootPath, '.golangci.yml')) ||
      existsSync(join(rootPath, '.golangci.yaml'))) {
    tools.push('GolangCI-Lint');
  }

  // Go modules may reference test frameworks
  return tools;
}
```

---

### 3.4 PHP Detection

#### 3.4.1 Manifest Parsing: `composer.json`

```typescript
function readComposerJson(rootPath: string): ComposerJson | null {
  const composerPath = join(rootPath, 'composer.json');
  if (!existsSync(composerPath)) return null;

  try {
    const content = readFileSync(composerPath, 'utf-8');
    return JSON.parse(content) as ComposerJson;
  } catch {
    return null;
  }
}

interface ComposerJson {
  name?: string;
  description?: string;
  version?: string;

  // Dependencies
  require?: Record<string, string>;
  'require-dev'?: Record<string, string>;

  // Autoloading
  autoload?: {
    psr4?: Record<string, string>;
    psr0?: Record<string, string>;
    files?: string[];
    classmap?: string[];
  };

  // Scripts
  scripts?: Record<string, string | string[]>;

  // Metadata
  type?: string;          // 'library', 'framework', etc.
  license?: string | string[];
  authors?: Array<{ name: string; email?: string }>;

  // PHP version constraint
  config?: {
    'platform'?: { 'php': string };
  };
}
```

#### 3.4.2 PHP Framework Detection

```typescript
const PHP_FRAMEWORKS = {
  'laravel/framework': 'Laravel',
  'symfony/framework-bundle': 'Symfony',
  'slim/slim': 'Slim',
  'yiisoft/yii2': 'Yii',
  'cakephp/cakephp': 'CakePHP',
  'zendframework/zend-framework': 'Zend Framework',
  'illuminate/framework': 'Illuminate',
};

const PHP_TEST_FRAMEWORKS = {
  'phpunit/phpunit': 'PHPUnit',
  'pestphp/pest': 'Pest',
  'codeception/codeception': 'Codeception',
  'behat/behat': 'Behat',
};

const PHP_TOOLS = {
  'phpstan/phpstan': 'PHPStan',
  'vimeo/psalm': 'Psalm',
  'php_codesniffer': 'CodeSniffer',
  'squizlabs/php_codesniffer': 'PHP_CodeSniffer',
  'friendsofphp/php-cs-fixer': 'PHP-CS-Fixer',
  'phpdocumentor/phpdocumentor': 'phpDocumentor',
};
```

#### 3.4.3 Performance Consideration for Large Repos

Large PHP monorepos (100+ packages) may have massive `composer.json` files with deeply nested dependencies.

**Optimization Strategy**:

```typescript
interface ComposerJsonOptions {
  parseDeepDependencies?: boolean;  // Default: false for large files
  maxDependencies?: number;         // Cap at 500 for analysis
  includeDevDeps?: boolean;         // Default: true
}

function readComposerJsonOptimized(
  rootPath: string,
  options: ComposerJsonOptions = {}
): ComposerJson | null {
  const composerPath = join(rootPath, 'composer.json');
  if (!existsSync(composerPath)) return null;

  try {
    const stats = statSync(composerPath);

    // If file > 500KB, use streaming/partial parsing
    if (stats.size > 500 * 1024) {
      return parseComposerJsonPartial(composerPath, options);
    }

    const content = readFileSync(composerPath, 'utf-8');
    return JSON.parse(content) as ComposerJson;
  } catch {
    return null;
  }
}

// For large files, only parse what we need
function parseComposerJsonPartial(
  path: string,
  options: ComposerJsonOptions
): ComposerJson | null {
  // Use JSON streaming parser or regex extraction
  // Extract only: name, require, require-dev, type, config
  // Skip: extra metadata, nested arrays beyond depth 2

  const content = readFileSync(path, 'utf-8');

  // Simple JSON path extraction
  return {
    name: extractJsonField(content, 'name'),
    require: extractJsonObject(content, 'require', options.maxDependencies),
    'require-dev': options.includeDevDeps
      ? extractJsonObject(content, 'require-dev', options.maxDependencies)
      : undefined,
    type: extractJsonField(content, 'type'),
  };
}
```

---

## 4. Implementation Details

### 4.1 File Organization

**New Files**:

```
src/
├── detectors/
│   ├── index.ts                  # Main detection orchestrator
│   ├── base-detector.ts          # Abstract base class
│   ├── node-detector.ts          # JavaScript/TypeScript
│   ├── python-detector.ts        # Python (PRIORITY)
│   ├── go-detector.ts            # Go
│   ├── php-detector.ts           # PHP
│   └── manifest-parsers/
│       ├── pyproject-parser.ts   # TOML parsing
│       ├── go-mod-parser.ts      # go.mod parsing
│       ├── composer-parser.ts    # composer.json parsing
│       └── package-json-parser.ts # Enhanced
├── types/
│   ├── detection.ts              # LanguageProfile, etc. (new types)
│   └── ... (existing)
└── ... (existing)
```

### 4.2 Detector Base Class

```typescript
// src/detectors/base-detector.ts

export interface DetectionResult {
  language: string;
  confidence: number;           // 0-100
  manifest: string;             // File name
  manifestPath: string;         // Relative path
  frameworks: string[];
  testFrameworks: string[];
  linters: string[];
  typeCheckers: string[];
  packageManager?: string;
  dependencies: Dependency[];
  extraMetadata: Record<string, unknown>;
}

export abstract class LanguageDetector {
  abstract language: string;
  abstract manifestNames: string[];  // e.g., ['package.json', 'package-lock.json']

  abstract detect(rootPath: string): DetectionResult | null;
  abstract parseDependencies(manifest: unknown): Dependency[];
  abstract detectFrameworks(dependencies: Record<string, string>): string[];

  protected calculateConfidence(
    manifestFound: boolean,
    filesExist: boolean
  ): number {
    if (manifestFound) return 100;
    if (filesExist) return 60;
    return 0;
  }

  protected findManifestFile(rootPath: string): string | null {
    for (const name of this.manifestNames) {
      const path = join(rootPath, name);
      if (existsSync(path)) return path;
    }
    return null;
  }
}
```

### 4.3 Main Orchestrator

```typescript
// src/detectors/index.ts

export async function detectLanguagesAndFrameworks(
  rootPath: string
): Promise<LanguageProfile[]> {
  const detectors: LanguageDetector[] = [
    new NodeDetector(),
    new PythonDetector(),
    new GoDetector(),
    new PHPDetector(),
  ];

  const results: LanguageProfile[] = [];

  for (const detector of detectors) {
    try {
      const result = await detector.detect(rootPath);
      if (result && result.confidence > 0) {
        results.push(result);
      }
    } catch (error) {
      // Log but don't fail
      logger.warn(`Detection failed for ${detector.language}:`, error);
    }
  }

  return results;
}
```

### 4.4 Integration with analyze.ts

```typescript
// src/tools/analyze.ts - Updated

export async function handleAnalyze(
  args: Record<string, unknown>,
  storage: Storage
): Promise<CodebaseContext> {
  const input = AnalyzeInputSchema.parse(args);
  const rootPath = input.path;

  // ... existing code ...

  // NEW: Multi-language detection
  const detectedLanguages = await detectLanguagesAndFrameworks(rootPath);

  // Merge results
  const allDependencies = detectedLanguages.flatMap(lang => lang.dependencies);
  const allFrameworks = detectedLanguages.flatMap(lang => lang.frameworks);
  const primaryLanguage = getPrimaryLanguage(detectedLanguages);

  // Build context with new fields
  const context: CodebaseContext = {
    // ... existing fields ...
    detectedLanguages,                    // NEW
    manifestFiles: buildManifestInfo(detectedLanguages),  // NEW
    primaryLanguage,
    frameworks: allFrameworks,
    dependencies: allDependencies,
  };

  return context;
}

function getPrimaryLanguage(profiles: LanguageProfile[]): string {
  // Sort by confidence, return top language
  const sorted = [...profiles].sort((a, b) => b.confidence - a.confidence);
  return sorted[0]?.language ?? 'Unknown';
}
```

---

## 5. Edge Cases & Handling

### 5.1 Polyglot Repositories

**Problem**: Repo has multiple languages (e.g., Python backend + TypeScript frontend)

**Solution**:
- Detect all languages, return sorted list
- Set "primary" as highest confidence
- Report all in `detectedLanguages` array
- Merge frameworks from all sources

**Example**:
```typescript
// Repo has:
// - src/backend/*.py (FastAPI)
// - src/frontend/*.ts (React)

// Result:
{
  primaryLanguage: 'TypeScript',  // More files
  detectedLanguages: [
    { language: 'TypeScript', confidence: 95, frameworks: ['React'] },
    { language: 'Python', confidence: 80, frameworks: ['FastAPI'] },
  ],
  frameworks: ['React', 'FastAPI'],
}
```

### 5.2 Monorepo Projects

**Problem**: Single repo with multiple package managers (e.g., Turborepo + Poetry subproject)

**Solution**:
- Scan all subdirectories for manifest files
- Detect independently
- Mark locations in `manifestFiles.path`

```typescript
function scanForManifests(
  rootPath: string,
  maxDepth: number = 2
): ManifestInfo[] {
  const manifests: ManifestInfo[] = [];

  const walk = (dir: string, depth: number) => {
    if (depth > maxDepth) return;

    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      if (entry.name === 'node_modules') continue;

      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
      } else if (isManifestFile(entry.name)) {
        manifests.push({
          path: relative(rootPath, fullPath),
          type: entry.name,
          exists: true,
          readable: true,
        });
      }
    }
  };

  walk(rootPath, 0);
  return manifests;
}
```

### 5.3 Missing or Invalid Manifests

**Problem**: File exists but is malformed (corrupted TOML, invalid JSON)

**Solution**:
- Try/catch parsing, don't crash
- Return null with error reason
- Fall back to alternative detection methods
- Log error for debugging

```typescript
function readPyprojectToml(rootPath: string): PyprojectToml | null {
  try {
    const path = join(rootPath, 'pyproject.toml');
    if (!existsSync(path)) return null;

    const content = readFileSync(path, 'utf-8');
    return parse(content);  // yaml.parse()
  } catch (error) {
    logger.error('Failed to parse pyproject.toml:', {
      error: error instanceof Error ? error.message : String(error),
      path: join(rootPath, 'pyproject.toml'),
    });
    return null;
  }
}
```

### 5.4 Performance Bottlenecks

**Large Repositories** (100K+ files):

1. **Don't use glob for entire tree**
   - Only glob for manifest files: `glob.sync('**/pyproject.toml', { maxDepth: 3 })`
   - Not: `glob.sync('**/*.py')`

2. **Cache parsing results**
   - Hash manifest file content
   - Reuse if unchanged

3. **Set timeouts**
   - Abort detection if taking >5 seconds
   - Fall back to basic detection

```typescript
async function detectWithTimeout(
  rootPath: string,
  timeoutMs: number = 5000
): Promise<LanguageProfile[]> {
  return Promise.race([
    detectLanguagesAndFrameworks(rootPath),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Detection timeout')), timeoutMs)
    ),
  ]).catch(() => {
    // Timeout - return empty results
    logger.warn('Language detection timed out, using fallback');
    return [];
  });
}
```

---

## 6. Testing Strategy

### 6.1 Test Fixtures

Create sample projects in `tests/fixtures/`:

```
tests/fixtures/
├── python-uv/
│   ├── pyproject.toml          # uv-managed
│   ├── uv.lock
│   └── src/main.py
├── python-poetry/
│   ├── pyproject.toml          # poetry-managed
│   ├── poetry.lock
│   └── src/main.py
├── python-legacy/
│   ├── setup.py                # Legacy setup.py
│   └── src/main.py
├── go-simple/
│   ├── go.mod
│   ├── go.sum
│   └── main.go
├── php-laravel/
│   ├── composer.json           # Laravel project
│   ├── composer.lock
│   └── app/Http/Controllers/
├── polyglot-monorepo/
│   ├── package.json            # TypeScript
│   ├── backend/
│   │   └── pyproject.toml      # Python
│   └── services/
│       └── go.mod              # Go
└── large-php-monorepo/
    └── composer.json           # Large file (test performance)
```

### 6.2 Test Cases

```typescript
describe('Language Detection', () => {
  describe('Python Detection', () => {
    it('should detect uv-managed Python project', async () => {
      const result = await detectLanguagesAndFrameworks(
        'tests/fixtures/python-uv'
      );
      expect(result).toContainEqual(
        expect.objectContaining({
          language: 'Python',
          confidence: 100,
          manifest: 'pyproject.toml',
          frameworks: ['FastAPI'],
        })
      );
    });

    it('should detect pytest framework', async () => {
      const result = await detectLanguagesAndFrameworks(
        'tests/fixtures/python-uv'
      );
      const python = result.find(r => r.language === 'Python');
      expect(python?.testFrameworks).toContain('pytest');
    });

    it('should detect mypy type checker', async () => {
      // ...
    });

    it('should handle malformed pyproject.toml gracefully', async () => {
      // Copy fixture, corrupt it, verify error handling
    });
  });

  describe('Go Detection', () => {
    it('should detect Go project from go.mod', async () => {
      // ...
    });

    it('should parse go.mod dependencies correctly', async () => {
      // ...
    });
  });

  describe('PHP Detection', () => {
    it('should detect Laravel framework', async () => {
      // ...
    });

    it('should handle large composer.json efficiently', async () => {
      // Measure parsing time, should be <100ms
    });
  });

  describe('Polyglot Detection', () => {
    it('should detect multiple languages', async () => {
      const result = await detectLanguagesAndFrameworks(
        'tests/fixtures/polyglot-monorepo'
      );
      expect(result.map(r => r.language)).toEqual(
        expect.arrayContaining(['TypeScript', 'Python', 'Go'])
      );
    });
  });
});
```

---

## 7. Implementation Priorities

### Phase 1 (MVP - Python Detection)
- [ ] Python detector with `pyproject.toml` parsing
- [ ] Framework detection (FastAPI, Django, Flask)
- [ ] Test framework detection (pytest)
- [ ] Type checker detection (mypy, pyright)
- [ ] Integration with analyze.ts
- [ ] Basic tests

**Effort**: 8-10 hours
**Risk**: Low (TOML parsing well-understood)

### Phase 2 (Go & PHP)
- [ ] Go detector with go.mod parsing
- [ ] PHP detector with composer.json parsing
- [ ] Framework detection for both
- [ ] Comprehensive tests
- [ ] Performance optimization for large repos

**Effort**: 6-8 hours
**Risk**: Medium (go.mod format, composer.json size)

### Phase 3 (Polish & Optimization)
- [ ] Cache results for repeated analysis
- [ ] Timeout handling for large repos
- [ ] Streaming JSON parser for huge composer.json
- [ ] Documentation updates
- [ ] Edge case handling (polyglot, monorepo)

**Effort**: 4-6 hours
**Risk**: Low (optimization only)

---

## 8. Success Criteria

### Phase 1 Success
- [ ] `elenchus_analyze` correctly detects Python projects
- [ ] uv-managed projects detected (same as poetry)
- [ ] FastAPI, Django, Flask detected from dependencies
- [ ] pytest, mypy, ruff detected from tool config
- [ ] Falls back gracefully if pyproject.toml missing/invalid
- [ ] No performance regression on existing JS/TS analysis
- [ ] 80%+ test coverage on new code

### Phase 2 Success
- [ ] All four languages detected in polyglot repo
- [ ] go.mod dependencies parsed correctly
- [ ] Laravel/Symfony detected in PHP projects
- [ ] Performance acceptable even for 100KB+ manifest files

### Phase 3 Success
- [ ] Analysis completes in <5 seconds for any codebase size
- [ ] No crashes on malformed manifests
- [ ] Clear error messages for unsupported scenarios
- [ ] Updated docs with examples for each language

---

## 9. API Surface Changes

### User-Facing (Minimal)

Current analyze call still works:
```typescript
const context = await elenchus_analyze({ path: '.' });
```

New fields available but optional:
```typescript
context.detectedLanguages  // Array of detected languages
context.manifestFiles      // Info about found manifest files
```

### Internal API (New)

```typescript
// New in src/detectors/index.ts
export async function detectLanguagesAndFrameworks(
  rootPath: string
): Promise<LanguageProfile[]>
```

---

## 10. Dependencies

### Current
- `yaml`: Already in package.json ✓
- `glob`: Already in package.json ✓
- `zod`: Already in package.json ✓

### To Consider
- **TOML parser**: Use `yaml` package (supports TOML via `parseToml`)
  - OR add `@iarna/toml` (3.5KB, focused TOML parser)
  - Recommendation: Use existing `yaml` package if sufficient

- **JSON streaming** (for huge files):
  - Only if Phase 3 performance optimization needed
  - `node-json-stream-parser` or `ajv` with streaming

### No new dependencies required for MVP!

---

## 11. Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| TOML parsing edge cases | Medium | Low | Comprehensive test fixtures, graceful fallback |
| Large file performance | Medium | Medium | Streaming parser, timeouts, caching |
| Breaking existing detection | Low | High | Backward-compat tests, phased rollout |
| Incomplete framework detection | High | Low | Extensible detection maps, easy to add |
| Polyglot confusion | Medium | Medium | Clear precedence rules, detailed logging |

---

## 12. Deliverables

### Code
- Detector base class and implementations
- Manifest parsers
- Integration with analyze.ts
- Comprehensive test suite

### Documentation
- Implementation guide in this file (or separate IMPLEMENTATION.md)
- Code comments explaining detection logic
- Examples for each language in README or doc

### Tests
- 50+ test cases covering:
  - Happy paths (all languages)
  - Edge cases (malformed files, missing manifests)
  - Performance (large repos)
  - Polyglot/monorepo scenarios

---

## Appendix A: Example Detection Outputs

### Python Project (uv-managed)

```json
{
  "language": "Python",
  "confidence": 100,
  "manifest": "pyproject.toml",
  "manifestPath": "./pyproject.toml",
  "frameworks": ["FastAPI", "SQLAlchemy", "Pydantic"],
  "testFrameworks": ["pytest"],
  "linters": ["ruff"],
  "typeCheckers": ["mypy"],
  "packageManager": "uv",
  "dependencies": [
    { "name": "fastapi", "version": "0.104.0", "type": "production" },
    { "name": "sqlalchemy", "version": ">=2.0,<3.0", "type": "production" }
  ],
  "extraMetadata": {
    "pythonVersion": ">=3.10",
    "pythonPackageManager": "uv",
    "typedLanguage": true
  }
}
```

### Go Project

```json
{
  "language": "Go",
  "confidence": 100,
  "manifest": "go.mod",
  "manifestPath": "./go.mod",
  "frameworks": ["Chi", "gRPC"],
  "testFrameworks": ["built-in testing"],
  "linters": ["GolangCI-Lint"],
  "typeCheckers": [],
  "packageManager": "go modules",
  "dependencies": [
    { "name": "github.com/go-chi/chi/v5", "version": "v5.0.10", "type": "production" }
  ],
  "extraMetadata": {
    "goVersion": "1.21",
    "typedLanguage": true
  }
}
```

### Polyglot Monorepo

```json
{
  "detectedLanguages": [
    { "language": "TypeScript", "confidence": 95, "manifestPath": "./package.json" },
    { "language": "Python", "confidence": 80, "manifestPath": "./backend/pyproject.toml" },
    { "language": "Go", "confidence": 85, "manifestPath": "./services/api/go.mod" }
  ],
  "primaryLanguage": "TypeScript",
  "manifestFiles": [
    { "path": "./package.json", "type": "package.json", "language": "JavaScript" },
    { "path": "./backend/pyproject.toml", "type": "pyproject.toml", "language": "Python" },
    { "path": "./services/api/go.mod", "type": "go.mod", "language": "Go" }
  ]
}
```

---

## Appendix B: Sample pyproject.toml Sections

```toml
[project]
name = "my-fastapi-app"
version = "0.1.0"
description = "REST API with FastAPI"
requires-python = ">=3.10"
dependencies = [
    "fastapi==0.104.0",
    "pydantic[email]>=2.0",
    "sqlalchemy[asyncio]>=2.0",
    "uvicorn[standard]>=0.24.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=7.4",
    "pytest-asyncio>=0.21",
    "pytest-cov>=4.1",
    "mypy>=1.5",
    "ruff>=0.1",
    "black>=23.10",
]

[build-system]
requires = ["setuptools>=68.0", "wheel"]
build-backend = "setuptools.build_meta"

[tool.pytest.ini_options]
testpaths = ["tests"]
asyncio_mode = "auto"

[tool.mypy]
strict = true
disallow_untyped_defs = true

[tool.ruff]
target-version = "py310"
select = ["E", "F", "UP"]

[tool.black]
line-length = 100
```

---

## References & Standards

- **Python Packaging**: https://peps.python.org/pep-0517/ (Build system interface)
- **pyproject.toml**: https://www.python.org/dev/peps/pep-0518/ (Build requirements)
- **Go Modules**: https://go.dev/ref/mod (Module spec)
- **Composer**: https://getcomposer.org/doc/ (PHP package manager)
- **TOML Spec**: https://toml.io/en/ (TOML format)

