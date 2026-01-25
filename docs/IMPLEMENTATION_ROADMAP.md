# Multi-Language Detection - Implementation Roadmap

**Target**: Enable Python, TypeScript, PHP, and Go project detection in Elenchus
**Status**: Planning Phase
**Created**: 2026-01-24

---

## Overview

This roadmap breaks down the implementation of multi-language project detection into concrete, implementable phases. It complements the detailed analysis in `MULTI_LANGUAGE_DETECTION_ANALYSIS.md`.

---

## Quick Reference: Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Parser Library** | Use existing `yaml` package | No new dependencies, already included |
| **Detection Strategy** | Manifest-first with fallback | Efficient, scales to large repos |
| **Python Priority** | Phase 1 | Currently broken, highest impact |
| **Performance Target** | <5s analysis | Acceptable for MVP |
| **File Glob Scope** | Limited (manifest search only) | Avoid O(n) scan of large trees |
| **Backward Compatibility** | Maintain current API | `detectedLanguages` optional field |

---

## Phase 1: Python Detection (MVP)

**Duration**: 2-3 weeks
**Goal**: Fix broken Python detection, add framework/tool detection
**Deliverable**: Working `pyproject.toml` parser with framework detection

### 1.1 Create Detector Infrastructure

#### Task 1.1.1: Base Detector Class
**File**: `src/detectors/base-detector.ts`

```typescript
// Define abstract class and interfaces
export interface DetectionResult {
  language: string;
  confidence: number;
  manifest: string;
  manifestPath: string;
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
  abstract manifestNames: string[];

  abstract detect(rootPath: string): Promise<DetectionResult | null>;
  abstract parseDependencies(manifest: unknown): Dependency[];
  abstract detectFrameworks(deps: Record<string, string>): string[];

  // Helper methods for subclasses
  protected calculateConfidence(manifestFound: boolean, filesExist: boolean): number
  protected findManifestFile(rootPath: string): string | null
}
```

**Checklist**:
- [ ] Define `DetectionResult` interface with all needed fields
- [ ] Create abstract `LanguageDetector` class
- [ ] Add helper methods (`calculateConfidence`, `findManifestFile`)
- [ ] Export from `/src/detectors/index.ts`
- [ ] Create unit tests (jest/vitest setup)

---

#### Task 1.1.2: Python Detector Implementation
**File**: `src/detectors/python-detector.ts`

```typescript
export class PythonDetector extends LanguageDetector {
  language = 'Python';
  manifestNames = ['pyproject.toml', 'setup.py', 'setup.cfg', 'Pipfile'];

  async detect(rootPath: string): Promise<DetectionResult | null> {
    // Step 1: Find manifest
    // Step 2: Parse dependencies
    // Step 3: Detect frameworks
    // Step 4: Detect tools
    // Step 5: Return result
  }

  parseDependencies(pyproject: unknown): Dependency[] {
    // Extract from project.dependencies + project.optional-dependencies
  }

  detectFrameworks(deps: Record<string, string>): string[] {
    // Check for FastAPI, Django, Flask, etc.
  }
}
```

**Checklist**:
- [ ] Implement `detect()` - orchestrate detection steps
- [ ] Implement `parseDependencies()` - handle uv/poetry/pip formats
- [ ] Implement `detectFrameworks()` - check known frameworks
- [ ] Add helper: `detectTestFrameworks()`
- [ ] Add helper: `detectTypeCheckers()`
- [ ] Add helper: `detectLinters()`
- [ ] Add helper: `detectPackageManager()`
- [ ] Add error handling for malformed files
- [ ] Export from `/src/detectors/index.ts`

**Implementation Detail - parseDependencies**:
```typescript
private parseDependencies(pyproject: any): Dependency[] {
  const deps: Dependency[] = [];

  // Extract from project.dependencies (list of strings)
  const mainDeps = pyproject?.project?.dependencies ?? [];
  for (const dep of mainDeps) {
    const parsed = this.parsePythonDependencyString(dep);
    if (parsed) {
      deps.push({ ...parsed, type: 'production' });
    }
  }

  // Extract from project.optional-dependencies
  const optionalDeps = pyproject?.project?.['optional-dependencies'] ?? {};
  for (const [group, depList] of Object.entries(optionalDeps)) {
    const devOrOpt = group === 'dev' ? 'development' : 'optional';
    for (const dep of depList as string[]) {
      const parsed = this.parsePythonDependencyString(dep);
      if (parsed) {
        deps.push({ ...parsed, type: devOrOpt });
      }
    }
  }

  return deps;
}

private parsePythonDependencyString(depStr: string): any {
  // "fastapi==0.104.0" → { name: 'fastapi', version: '0.104.0' }
  // "sqlalchemy[asyncio]>=2.0" → { name: 'sqlalchemy', version: '>=2.0' }
  const match = depStr.match(/^([a-zA-Z0-9-_.]+)(.*)$/);
  if (!match) return null;
  return { name: match[1], version: match[2].trim() || '*' };
}
```

---

#### Task 1.1.3: TOML Parsing Utility
**File**: `src/detectors/manifest-parsers/toml-parser.ts`

```typescript
import { parse } from 'yaml'; // yaml package supports TOML

export function parsePyprojectToml(content: string): Record<string, any> | null {
  try {
    // Use yaml package - it can parse TOML
    // OR use regex extraction if yaml doesn't support TOML well
    return parse(content);
  } catch (error) {
    return null;
  }
}

// Fallback: simple regex-based extraction for basic fields
export function extractPyprojectTomlFields(content: string): {
  dependencies?: string[];
  'require-python'?: string;
  testTools?: Record<string, boolean>;
} {
  const result: any = {};

  // Extract dependencies array
  const depsMatch = content.match(
    /dependencies\s*=\s*\[([\s\S]*?)\]/
  );
  if (depsMatch) {
    result.dependencies = parseStringArray(depsMatch[1]);
  }

  // Extract requires-python
  const pythonMatch = content.match(
    /requires-python\s*=\s*"([^"]+)"/
  );
  if (pythonMatch) {
    result['require-python'] = pythonMatch[1];
  }

  // Extract tool configs
  result.testTools = {
    pytest: /\[tool\.pytest\]/.test(content),
    mypy: /\[tool\.mypy\]/.test(content),
    ruff: /\[tool\.ruff\]/.test(content),
  };

  return result;
}
```

**Checklist**:
- [ ] Test TOML parsing with `yaml` package
- [ ] If insufficient, implement regex-based extraction
- [ ] Handle edge cases (multiline strings, comments)
- [ ] Add error handling
- [ ] Export from module

---

### 1.2 Detector Orchestration

#### Task 1.2.1: Main Detector Orchestrator
**File**: `src/detectors/index.ts`

```typescript
export async function detectLanguagesAndFrameworks(
  rootPath: string,
  options?: { timeout?: number; shallow?: boolean }
): Promise<LanguageProfile[]> {
  const detectors: LanguageDetector[] = [
    new NodeDetector(),
    new PythonDetector(),
  ];

  const results: LanguageProfile[] = [];
  const timeout = options?.timeout ?? 5000;

  try {
    const detectionPromises = detectors.map(detector =>
      withTimeout(detector.detect(rootPath), timeout)
    );

    const detectionResults = await Promise.all(detectionPromises);

    for (const result of detectionResults) {
      if (result && result.confidence > 0) {
        results.push(result);
      }
    }
  } catch (error) {
    logger.error('Language detection failed:', error);
  }

  // Sort by confidence (highest first)
  return results.sort((a, b) => b.confidence - a.confidence);
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Timeout')), ms)
    ),
  ]);
}
```

**Checklist**:
- [ ] Implement orchestrator function
- [ ] Add timeout handling
- [ ] Implement result sorting
- [ ] Add error handling (don't crash on individual detector failures)
- [ ] Export from module

---

### 1.3 Integration with Existing Analysis

#### Task 1.3.1: Update analyze.ts
**File**: `src/tools/analyze.ts`

```typescript
// In handleAnalyze():

// NEW: Add multi-language detection
const detectedLanguages = await detectLanguagesAndFrameworks(rootPath);

// Merge dependencies and frameworks
const allDependencies: Dependency[] = [];
const allFrameworks: string[] = [];

for (const langProfile of detectedLanguages) {
  allDependencies.push(...langProfile.dependencies);
  allFrameworks.push(...langProfile.frameworks);
}

// Determine primary language (highest confidence)
const primaryLanguage = detectedLanguages[0]?.language ?? 'JavaScript';

// Build context
const context: CodebaseContext = {
  analyzedAt: now,
  rootPath,
  analysisDepth: input.depth,
  maturity,
  architecture,
  primaryLanguage,          // Updated logic
  frameworks: allFrameworks, // Merged from all languages
  conventions,
  suggestedPatterns: [],
  dependencies: allDependencies,  // Merged from all languages
  testCoverage,
  hasTypeScript: existsSync(join(rootPath, 'tsconfig.json')),
  hasLinting,
  hasCICD,
  riskAreas,
  relevantFiles,
  contextFiles,

  // NEW FIELDS
  detectedLanguages,
  manifestFiles: detectedLanguages.map(lang => ({
    path: lang.manifestPath,
    type: lang.manifest,
    language: lang.language,
    exists: true,
    readable: true,
  })),
};
```

**Checklist**:
- [ ] Import `detectLanguagesAndFrameworks`
- [ ] Call detection function in `handleAnalyze()`
- [ ] Merge results into context
- [ ] Update type definitions to include new fields
- [ ] Test with existing JavaScript/TypeScript projects (ensure no regression)
- [ ] Test with Python projects

---

#### Task 1.3.2: Update Type Definitions
**File**: `src/types/context.ts`

```typescript
// Add new types for language detection results

export const LanguageProfileSchema = z.object({
  language: z.string(),
  confidence: z.number().min(0).max(100),
  manifest: z.string(),
  manifestPath: z.string(),
  frameworks: z.array(z.string()),
  testFrameworks: z.array(z.string()),
  linters: z.array(z.string()),
  typeCheckers: z.array(z.string()),
  packageManager: z.string().optional(),
  dependencies: z.array(DependencySchema),
  extraMetadata: z.record(z.unknown()),
});

export const ManifestInfoSchema = z.object({
  path: z.string(),
  type: z.string(),
  language: z.string(),
  exists: z.boolean(),
  readable: z.boolean(),
  parseError: z.string().optional(),
});

// Update existing CodebaseContextSchema
export const CodebaseContextSchema = z.object({
  // ... existing fields ...
  detectedLanguages: z.array(LanguageProfileSchema).optional(),
  manifestFiles: z.array(ManifestInfoSchema).optional(),
});
```

**Checklist**:
- [ ] Add `LanguageProfileSchema` with all fields
- [ ] Add `ManifestInfoSchema`
- [ ] Update `CodebaseContextSchema` with optional new fields
- [ ] Export from index
- [ ] Update validation in analyze.ts

---

### 1.4 Testing

#### Task 1.4.1: Create Test Fixtures
**Directory**: `tests/fixtures/python-*`

```
tests/fixtures/
├── python-uv/
│   ├── pyproject.toml
│   ├── uv.lock
│   └── src/main.py
├── python-poetry/
│   ├── pyproject.toml
│   ├── poetry.lock
│   └── src/main.py
└── python-legacy/
    ├── setup.py
    └── src/main.py
```

**pyproject.toml Content** (for python-uv fixture):
```toml
[project]
name = "test-app"
version = "0.1.0"
requires-python = ">=3.10"
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

[tool.pytest.ini_options]
testpaths = ["tests"]

[tool.mypy]
strict = true

[tool.ruff]
target-version = "py310"

[build-system]
requires = ["setuptools>=61.0", "wheel"]
build-backend = "setuptools.build_meta"
```

**Checklist**:
- [ ] Create 3 Python fixture directories
- [ ] Add appropriate manifest files
- [ ] Add dummy source files (can be empty)
- [ ] Document fixture purpose in README

---

#### Task 1.4.2: Unit Tests for Python Detector
**File**: `src/detectors/python-detector.test.ts`

```typescript
describe('PythonDetector', () => {
  const detector = new PythonDetector();

  describe('detect()', () => {
    it('should detect pyproject.toml-based project', async () => {
      const result = await detector.detect('tests/fixtures/python-uv');
      expect(result).toMatchObject({
        language: 'Python',
        confidence: 100,
        manifest: 'pyproject.toml',
      });
    });

    it('should return null for non-Python directory', async () => {
      const result = await detector.detect('tests/fixtures/node-app');
      expect(result).toBeNull();
    });
  });

  describe('detectFrameworks()', () => {
    it('should detect FastAPI', () => {
      const deps = { 'fastapi': '0.104.0', 'pydantic': '2.0' };
      const frameworks = detector.detectFrameworks(deps);
      expect(frameworks).toContain('FastAPI');
    });

    it('should detect Django', () => {
      const deps = { 'django': '4.2' };
      const frameworks = detector.detectFrameworks(deps);
      expect(frameworks).toContain('Django');
    });
  });

  describe('parseDependencies()', () => {
    it('should parse production dependencies', () => {
      const pyproject = {
        project: {
          dependencies: ['fastapi==0.104.0', 'sqlalchemy>=2.0'],
        },
      };
      const deps = detector.parseDependencies(pyproject);
      expect(deps).toHaveLength(2);
      expect(deps[0]).toMatchObject({ name: 'fastapi', type: 'production' });
    });

    it('should parse dev dependencies', () => {
      const pyproject = {
        project: {
          'optional-dependencies': {
            dev: ['pytest>=7.0'],
          },
        },
      };
      const deps = detector.parseDependencies(pyproject);
      expect(deps[0]).toMatchObject({ name: 'pytest', type: 'development' });
    });
  });

  describe('error handling', () => {
    it('should return null on malformed pyproject.toml', async () => {
      // Create temporary invalid file
      const result = await detector.detect('tests/fixtures/python-invalid');
      expect(result).toBeNull();
    });
  });
});
```

**Checklist**:
- [ ] Test successful Python detection
- [ ] Test framework detection (FastAPI, Django, Flask)
- [ ] Test dependency parsing
- [ ] Test error handling (malformed files)
- [ ] Test edge cases (empty dependencies, missing fields)
- [ ] Run tests: `npm test`
- [ ] Verify coverage >80%

---

#### Task 1.4.3: Integration Tests
**File**: `src/tools/analyze.test.ts` (extend existing)

```typescript
describe('handleAnalyze with Python', () => {
  it('should detect Python as primary language', async () => {
    const result = await handleAnalyze(
      { path: 'tests/fixtures/python-uv' },
      storage
    );

    expect(result.primaryLanguage).toBe('Python');
    expect(result.detectedLanguages).toHaveLength(1);
    expect(result.detectedLanguages[0].language).toBe('Python');
  });

  it('should include frameworks in merged list', async () => {
    const result = await handleAnalyze(
      { path: 'tests/fixtures/python-uv' },
      storage
    );

    expect(result.frameworks).toContain('FastAPI');
  });

  it('should not break existing JS/TS detection', async () => {
    const result = await handleAnalyze(
      { path: 'tests/fixtures/ts-project' },
      storage
    );

    expect(result.primaryLanguage).toBe('TypeScript');
  });
});
```

**Checklist**:
- [ ] Test Python detection in handleAnalyze
- [ ] Test backward compatibility with JS/TS
- [ ] Test framework merging
- [ ] Test missing/optional fields

---

### 1.5 Documentation

#### Task 1.5.1: Code Comments
**Throughout**: Add JSDoc comments to new functions

```typescript
/**
 * Detects Python project and extracts framework/tool information
 *
 * @param rootPath - Path to project root
 * @returns Detection result or null if not a Python project
 *
 * @remarks
 * - Checks for pyproject.toml, setup.py, setup.cfg, Pipfile
 * - Parses dependencies and detects frameworks (FastAPI, Django, Flask)
 * - Detects test frameworks (pytest, unittest) from tool config
 * - Handles uv-managed projects (same format as poetry)
 *
 * @example
 * ```ts
 * const detector = new PythonDetector();
 * const result = await detector.detect('/path/to/project');
 * console.log(result.frameworks); // ['FastAPI', 'SQLAlchemy']
 * ```
 */
async detect(rootPath: string): Promise<DetectionResult | null> {
  // implementation
}
```

**Checklist**:
- [ ] Add JSDoc to all public methods
- [ ] Document parameters, return types, and examples
- [ ] Add inline comments for complex logic
- [ ] Document edge cases in remarks

---

#### Task 1.5.2: Update README
**File**: `README.md`

Add section:

```markdown
## Multi-Language Support

Elenchus can analyze projects in multiple languages:

- **Python**: Detects `pyproject.toml` (uv, poetry, setuptools), frameworks (FastAPI, Django, Flask), test tools (pytest)
- **TypeScript/JavaScript**: Full support via `package.json`, `tsconfig.json`
- **Go** (Phase 2): Detects `go.mod`, frameworks (Chi, Echo, Gin)
- **PHP** (Phase 2): Detects `composer.json`, frameworks (Laravel, Symfony)

### Example: Python Analysis

```typescript
const context = await elenchus_analyze({ path: '/path/to/python-project' });
// Returns:
// {
//   primaryLanguage: 'Python',
//   detectedLanguages: [{
//     language: 'Python',
//     frameworks: ['FastAPI'],
//     testFrameworks: ['pytest'],
//     ...
//   }],
//   ...
// }
```
```

**Checklist**:
- [ ] Add multi-language overview
- [ ] Add Python section with examples
- [ ] Link to implementation details

---

### 1.6 Phase 1 Checklist

- [ ] Base detector class implemented
- [ ] Python detector implemented
- [ ] TOML parser implemented
- [ ] Framework/tool detection working
- [ ] Integration with analyze.ts complete
- [ ] Type definitions updated
- [ ] All tests passing (>80% coverage)
- [ ] No regression on existing features
- [ ] README updated
- [ ] Code comments complete

---

## Phase 2: Go & PHP Detection (Weeks 4-5)

**Duration**: 2 weeks
**Depends on**: Phase 1 complete and tested
**Parallel work**: Can run alongside Phase 1 for Go if needed

### 2.1 Go Detector
- [ ] Create `src/detectors/go-detector.ts`
- [ ] Implement `go.mod` parser
- [ ] Framework detection (Chi, Echo, Gin, gRPC)
- [ ] Test framework detection
- [ ] 10+ test cases
- [ ] Fixture: `tests/fixtures/go-chi-api/`

### 2.2 PHP Detector
- [ ] Create `src/detectors/php-detector.ts`
- [ ] Implement `composer.json` parser
- [ ] Framework detection (Laravel, Symfony)
- [ ] Performance optimization for large files
- [ ] 10+ test cases
- [ ] Fixtures: `tests/fixtures/php-laravel/`, `tests/fixtures/php-large-monorepo/`

### 2.3 Polyglot & Monorepo Support
- [ ] Test multi-language repository detection
- [ ] Update orchestrator to handle multiple manifests
- [ ] Fixture: `tests/fixtures/polyglot-monorepo/`
- [ ] Documentation: examples of polyglot detection

---

## Phase 3: Optimization & Polish (Week 6)

**Duration**: 1 week
**Depends on**: Phase 1 & 2 complete

### 3.1 Performance Optimization
- [ ] Implement caching for manifest parsing
- [ ] Add streaming parser for large `composer.json`
- [ ] Benchmarks: all detectors <100ms on normal repos
- [ ] Timeout handling for edge cases

### 3.2 Edge Cases
- [ ] Circular dependencies
- [ ] Malformed manifests
- [ ] Missing optional files
- [ ] Encoding issues (UTF-8 vs others)

### 3.3 Documentation
- [ ] Implementation guide
- [ ] Architecture diagrams
- [ ] Performance benchmarks
- [ ] Troubleshooting guide

---

## Success Metrics

### Phase 1
- **Python detection**: Works for pyproject.toml, setup.py
- **Framework detection**: FastAPI, Django, Flask identified
- **Test coverage**: >80% on new code
- **Performance**: <500ms for Python project analysis
- **Tests**: 15+ passing

### Phase 2
- **All languages**: Detected in polyglot repo
- **Framework coverage**: 20+ frameworks across all languages
- **Test coverage**: >80% on new code
- **Performance**: <5s total analysis time even for large repos

### Phase 3
- **Zero crashes**: All edge cases handled
- **Performance**: Caching reduces repeat analysis to <100ms
- **Documentation**: Complete with examples

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| TOML parsing breaks | Fallback to regex extraction for core fields |
| Large file performance | Implement streaming, set 5s timeout |
| Breaking JS/TS analysis | Keep existing logic, add new detection on top |
| Incomplete framework maps | Extensible detection maps, easy to add new |
| Polyglot confusion | Clear precedence rules, detailed logging |

---

## Review Checkpoints

### After Phase 1
- Code review: Detector architecture, error handling
- Test review: Coverage, edge cases
- Integration review: No regression in existing analysis

### After Phase 2
- Performance review: Timing on large repos
- Polyglot testing: Complex monorepo scenarios
- Documentation review: Examples for each language

### After Phase 3
- Final performance benchmarks
- Edge case validation
- Documentation completeness

---

## Rollout Plan

1. **Merge Phase 1**: Enable Python detection in MVP
2. **Beta Phase 2**: Add Go & PHP, gather feedback
3. **Release Phase 3**: Optimize, release to users
4. **Monitor**: Track usage, gather improvement requests

---

## File Manifest

### New Files
```
src/
├── detectors/
│   ├── index.ts
│   ├── base-detector.ts
│   ├── python-detector.ts
│   ├── go-detector.ts               (Phase 2)
│   ├── php-detector.ts              (Phase 2)
│   └── manifest-parsers/
│       ├── toml-parser.ts
│       ├── go-mod-parser.ts         (Phase 2)
│       ├── composer-parser.ts       (Phase 2)
│       └── package-json-parser.ts
└── types/
    └── detection.ts                 (new types)

tests/
└── fixtures/
    ├── python-uv/
    ├── python-poetry/
    ├── python-legacy/
    ├── go-chi-api/                  (Phase 2)
    ├── php-laravel/                 (Phase 2)
    ├── php-large-monorepo/          (Phase 2)
    └── polyglot-monorepo/           (Phase 2)

docs/
├── MULTI_LANGUAGE_DETECTION_ANALYSIS.md
└── IMPLEMENTATION_ROADMAP.md        (this file)
```

### Modified Files
```
src/
├── tools/analyze.ts                 (integrate detection)
├── types/context.ts                 (add new types)
└── types/index.ts                   (export new types)

src/types/index.ts                   (export Detection types)

tests/
└── tools/analyze.test.ts            (add Python tests)

README.md                            (document multi-language support)
package.json                         (may add toml parser if needed)
```

---

## Estimated Timeline

| Phase | Duration | Start | End | Team |
|-------|----------|-------|-----|------|
| Phase 1 | 2-3 weeks | Week 1 | Week 3 | 1 dev |
| Phase 2 | 2 weeks | Week 4 | Week 5 | 1 dev |
| Phase 3 | 1 week | Week 6 | Week 6 | 1 dev |
| **Total** | **5-6 weeks** | **Week 1** | **Week 6** | |

---

## Next Steps

1. **Approve this roadmap**
2. **Create GitHub issues** for each task
3. **Start Phase 1** with base detector class
4. **Weekly reviews** to assess progress
5. **Adjust timeline** based on findings

