# Multi-Language Detection - Quick Reference

**Purpose**: Quick lookup for detection patterns, manifest fields, and framework identifiers
**Status**: Reference Document
**Last Updated**: 2026-01-24

---

## Language Detection Priority & Confidence

| Language | Manifest (Priority 1) | Fallback (Priority 2) | Confidence if Found |
|----------|----------------------|----------------------|-------------------|
| **TypeScript** | `tsconfig.json` | `*.ts` files | 100% (manifest), 70% (files) |
| **JavaScript** | `package.json` | `*.js` files | 100% (manifest), 65% (files) |
| **Python** | `pyproject.toml` | `*.py` files | 100% (manifest), 60% (files) |
| **Go** | `go.mod` | `*.go` files | 100% (manifest), 75% (files) |
| **PHP** | `composer.json` | `*.php` files | 100% (manifest), 55% (files) |

---

## Manifest Files by Language

### Python

| File | Purpose | Priority | Parsing |
|------|---------|----------|---------|
| `pyproject.toml` | Modern Python project config (PEP 517/518) | 1 | TOML → YAML parser |
| `setup.py` | Legacy Python project (setuptools) | 2 | Regex extraction |
| `setup.cfg` | Legacy config file | 3 | INI format |
| `Pipfile` | Pipenv lock file | 4 | TOML format |
| `poetry.lock` | Poetry dependency lock (read-only) | 2* | Check existence only |
| `uv.lock` | uv dependency lock (read-only) | 2* | Check existence only |

*Indicates package manager, not project definition

**Key Fields in pyproject.toml**:
```
[project]
  - dependencies: list of production deps
  - optional-dependencies: dict of groups (dev, docs, test)
  - requires-python: version constraint

[tool.pytest], [tool.mypy], [tool.ruff]: Tool configs
[build-system]: Build backend (poetry, pdm, setuptools, hatch)
```

---

### TypeScript/JavaScript

| File | Purpose | Priority | Parsing |
|------|---------|----------|---------|
| `package.json` | Node.js project manifest | 1 | JSON |
| `package-lock.json` | npm dependency lock | 2* | (reference only) |
| `yarn.lock` | Yarn dependency lock | 2* | (reference only) |
| `pnpm-lock.yaml` | pnpm dependency lock | 2* | (reference only) |
| `tsconfig.json` | TypeScript config | 1** | JSON |
| `eslint.config.js` | ESLint config (flat) | 3 | (reference only) |

*Indicates package manager version
**TypeScript confirmation, not project definition

---

### Go

| File | Purpose | Priority | Parsing |
|------|---------|----------|---------|
| `go.mod` | Go module manifest | 1 | Custom parser |
| `go.sum` | Go dependency checksums | 2* | (reference only) |
| `.golangci.yml/.yaml` | Linter config | 2 | YAML format |

---

### PHP

| File | Purpose | Priority | Parsing |
|------|---------|----------|---------|
| `composer.json` | Composer package manifest | 1 | JSON |
| `composer.lock` | Composer dependency lock | 2* | (reference only) |

*Indicates locked versions, not project definition

---

## Framework Detection Maps

### Python Frameworks

```typescript
// Web Frameworks
FastAPI       → 'fastapi'
Django        → 'django'
Flask         → 'flask'
Starlette     → 'starlette'
Pyramid       → 'pyramid'
aiohttp       → 'aiohttp'
Bottle        → 'bottle'

// ORM/Database
SQLAlchemy    → 'sqlalchemy'
Peewee        → 'peewee'
Tortoise ORM  → 'tortoise-orm'
Django ORM    → (in 'django')

// Data Validation
Pydantic      → 'pydantic'
Marshmallow   → 'marshmallow'
Cerberus      → 'cerberus'

// Async
asyncio       → 'asyncio'  (built-in)
Trio          → 'trio'
anyio         → 'anyio'
```

### TypeScript/JavaScript Frameworks

```typescript
// Frontend
React         → 'react'
Vue           → 'vue'
Angular       → '@angular/core'
Svelte        → 'svelte'
Next.js       → 'next'
Nuxt          → 'nuxt'

// Backend
Express       → 'express'
Fastify       → 'fastify'
NestJS        → '@nestjs/core'
Hono          → 'hono'
Koa           → 'koa'

// Testing
Jest          → 'jest'
Vitest        → 'vitest'
Mocha         → 'mocha'
```

### Go Frameworks

```typescript
// Web Frameworks
Gin           → 'github.com/gin-gonic/gin'
Echo          → 'github.com/labstack/echo'
Chi           → 'github.com/go-chi/chi'
Fiber         → 'github.com/gofiber/fiber'
Gorilla Mux   → 'github.com/gorilla/mux'

// RPC
gRPC          → 'google.golang.org/grpc'
Protocol Buf  → 'google.golang.org/protobuf'

// Testing
Testify       → 'github.com/stretchr/testify'
Ginkgo        → 'github.com/onsi/ginkgo'
```

### PHP Frameworks

```typescript
// Web Frameworks
Laravel       → 'laravel/framework'
Symfony       → 'symfony/framework-bundle'
Slim          → 'slim/slim'
Yii           → 'yiisoft/yii2'
CakePHP       → 'cakephp/cakephp'

// Testing
PHPUnit       → 'phpunit/phpunit'
Pest          → 'pestphp/pest'
Codeception   → 'codeception/codeception'
Behat         → 'behat/behat'
```

---

## Tool Detection Maps

### Python Tools

#### Test Frameworks
```
pytest        → [tool.pytest] or pytest.ini
unittest      → Built-in (no detection needed)
nose2         → [tool.nose2] or .nose2.cfg
tox           → [tool.tox] or tox.ini
```

#### Type Checkers
```
mypy          → [tool.mypy] or mypy.ini
pyright       → [tool.pyright] or pyrightconfig.json
pyre          → [tool.pyre] or .pyre_configuration
pytype        → [tool.pytype] (no external config)
```

#### Linters
```
ruff          → [tool.ruff] or .ruff.toml
flake8        → [tool.flake8] or .flake8
pylint        → [tool.pylint] or .pylintrc
black         → [tool.black] or pyproject.toml
```

#### Package Managers
```
uv            → uv.lock (modern, fastest)
poetry        → poetry.lock + [build-system] = "poetry.core"
pipenv        → Pipfile.lock
pip           → requirements.txt or setup.py
pdm           → pdm.lock + [build-system] = "pdm.backend"
hatch         → [build-system] = "hatchling.build"
```

---

### TypeScript/JavaScript Tools

#### Test Frameworks
```
Jest          → 'jest' in dependencies
Vitest        → 'vitest' in dependencies
Mocha         → 'mocha' in dependencies
Jasmine       → 'jasmine' in dependencies
```

#### Linters
```
ESLint        → .eslintrc.* or eslint.config.js
Biome         → biome.json
TSLint        → tslint.json (deprecated)
```

#### Formatters
```
Prettier      → .prettierrc or prettier.config.js
Biome         → biome.json (does both)
```

---

### Go Tools

#### Test Tools
```
testing       → Built-in package (*.test.go files)
Testify       → 'github.com/stretchr/testify'
Ginkgo        → 'github.com/onsi/ginkgo'
```

#### Linters
```
golangci-lint → .golangci.yml/.yaml
staticcheck   → 'honnef.co/go/tools/cmd/staticcheck'
revive        → 'github.com/mgechev/revive'
```

---

### PHP Tools

#### Test Frameworks
```
PHPUnit       → 'phpunit/phpunit'
Pest          → 'pestphp/pest'
Codeception   → 'codeception/codeception'
Behat         → 'behat/behat'
```

#### Linters/Formatters
```
PHPStan       → 'phpstan/phpstan'
Psalm         → 'vimeo/psalm'
PHP_CodeSniffer → 'squizlabs/php_codesniffer'
PHP-CS-Fixer  → 'friendsofphp/php-cs-fixer'
```

---

## Dependency Parsing Examples

### Python (pyproject.toml)

```toml
[project]
dependencies = [
  "fastapi==0.104.0",
  "pydantic[email]>=2.0,<3.0",
  "sqlalchemy[asyncio]>=2.0",
]

[project.optional-dependencies]
dev = [
  "pytest>=7.4",
  "mypy>=1.5",
  "ruff>=0.1",
]
```

**Parsing**:
- Extract string "fastapi==0.104.0" → `{ name: 'fastapi', version: '0.104.0' }`
- Extras in brackets: "sqlalchemy[asyncio]" → `{ name: 'sqlalchemy', version: '>=2.0', extras: 'asyncio' }`
- Groups: `[project.optional-dependencies]` → type = 'development'

### Go (go.mod)

```
module github.com/myuser/myproject
go 1.21

require (
  github.com/gin-gonic/gin v1.9.1
  github.com/lib/pq v1.10.9
)

require (
  github.com/google/uuid v1.3.0 // indirect
)
```

**Parsing**:
- Module line: "module X" → project name
- Go version: "go 1.21" → version requirement
- require blocks: "name version" → each is a dependency

### PHP (composer.json)

```json
{
  "name": "myuser/myproject",
  "require": {
    "laravel/framework": "^10.0",
    "illuminate/database": "^10.0"
  },
  "require-dev": {
    "phpunit/phpunit": "^10.0",
    "laravel/dusk": "^7.0"
  }
}
```

**Parsing**:
- Keys are package names: "laravel/framework"
- Values are version constraints: "^10.0"
- Groups: require = production, require-dev = development

---

## Python Package Manager Detection

**Decision Tree**:

```
┌─ Check for lock files ──┐
│  uv.lock?          ──→  uv
│  poetry.lock?      ──→  poetry
│  Pipfile.lock?     ──→  pipenv
│  requirements.txt? ──→  pip
└─────────────────────┘
         │
         ▼
    ┌─ Check build-system ──┐
    │  poetry.core?    ──→  poetry
    │  pdm.backend?    ──→  pdm
    │  hatchling?      ──→  hatch
    │  setuptools?     ──→  setuptools
    └────────────────────┘
         │
         ▼
    unknown/pip (default)
```

---

## Confidence Scoring

### Python Confidence Algorithm

```
Base: 0

If pyproject.toml exists:           +100  → Confidence = 100%
Else if setup.py exists:            +90   → Confidence = 90%
Else if setup.cfg exists:           +80   → Confidence = 80%
Else if Pipfile exists:             +70   → Confidence = 70%
Else if *.py files detected:        +50-70 (based on count)
Else if poetry.lock/uv.lock:        +40   → Confidence = 40%
```

### Multi-Language Primary Language Selection

```
1. Sort all detected languages by confidence (descending)
2. If tie, use this order:
   - TypeScript (most information)
   - Python
   - Go
   - PHP
   - JavaScript
3. Return first in sorted list
```

---

## Large Repository Handling

### File Size Thresholds

| Manifest | Normal | Large | XLarge |
|----------|--------|-------|--------|
| `pyproject.toml` | <10 KB | 10-100 KB | >100 KB |
| `composer.json` | <50 KB | 50-500 KB | >500 KB |
| `package.json` | <50 KB | 50-500 KB | >500 KB |
| `go.mod` | <10 KB | 10-100 KB | >100 KB |

### Handling Strategy

```
Normal Size (<threshold):
  → Parse full file, extract all data

Large Size (threshold ≤ x < 5MB):
  → Parse full file but cache results
  → Skip optional metadata

XLarge Size (>5MB):
  → Use streaming/partial parser
  → Extract only required fields
  → Set strict timeout (1s)
```

---

## Error Handling Decision Matrix

| Scenario | Action | Log Level |
|----------|--------|-----------|
| Manifest missing | Return confidence=0 | DEBUG |
| Malformed JSON/TOML | Skip file, try next manifest | WARN |
| File unreadable (perms) | Skip file, continue | INFO |
| Parsing timeout (>1s) | Stop parsing, use partial | WARN |
| All manifests failed | Return empty result | INFO |
| Dependency parse fails | Skip dependency | DEBUG |
| Unknown framework | Ignore (extensible) | DEBUG |

---

## Performance Targets

| Operation | Target | Accept | Fail |
|-----------|--------|--------|------|
| Manifest detection | <100ms | <500ms | >5s |
| Dependency parsing | <200ms | <1s | >5s |
| Framework detection | <50ms | <200ms | >1s |
| Total analysis | <1s | <5s | >10s |

### Optimization Techniques

```
1. Manifest-first (no globbing entire tree)
2. Parallel detection (Promise.all for multiple detectors)
3. Caching (hash-based, file mtime)
4. Streaming parsing (large files >1MB)
5. Early exit (stop at first matching manifest)
6. Field extraction (regex for core fields)
```

---

## Common Mistake Prevention

### Anti-Pattern 1: Full Tree Globbing
```typescript
// WRONG - scans entire repo
const pyFiles = glob.sync('**/*.py', { cwd: rootPath });

// RIGHT - scans only root and 1 level deep for manifest
const manifest = glob.sync('{pyproject.toml,setup.py,setup.cfg}', { cwd: rootPath });
```

### Anti-Pattern 2: Assuming Single Language
```typescript
// WRONG
const language = detectPrimaryLanguage(path);

// RIGHT
const languages = detectLanguagesAndFrameworks(path);
const primary = languages[0]?.language;
```

### Anti-Pattern 3: Ignoring Parse Errors
```typescript
// WRONG
const data = JSON.parse(content); // Can throw

// RIGHT
try {
  const data = JSON.parse(content);
} catch (error) {
  logger.warn('Parse failed', { error, path });
  return null;
}
```

### Anti-Pattern 4: No Timeout
```typescript
// WRONG
const result = await detectLanguages(path);

// RIGHT
const result = await Promise.race([
  detectLanguages(path),
  new Promise((_, r) => setTimeout(() => r(null), 5000))
]);
```

---

## Testing Checklist

### For Each Language Detector

- [ ] Happy path (valid manifest, normal project)
- [ ] Missing manifest (fallback detection)
- [ ] Malformed manifest (error handling)
- [ ] Empty manifest (edge case)
- [ ] Large manifest (performance)
- [ ] Mixed dependencies (production + dev)
- [ ] Multiple frameworks (detection coverage)
- [ ] Unknown frameworks (graceful ignore)
- [ ] Version constraint parsing (all formats)
- [ ] Package manager detection (auto-detect)

### Integration Tests

- [ ] Single language project → correct language
- [ ] Polyglot project → all languages detected
- [ ] No regression in existing JS/TS detection
- [ ] Framework merging (all frameworks in list)
- [ ] Dependency merging (all deps in list)

---

## Documentation Links

- **Full Analysis**: `MULTI_LANGUAGE_DETECTION_ANALYSIS.md`
- **Implementation Roadmap**: `IMPLEMENTATION_ROADMAP.md`
- **Python Packaging**: https://peps.python.org/pep-0517/
- **Go Modules**: https://go.dev/ref/mod
- **Composer**: https://getcomposer.org/doc/
- **TOML Format**: https://toml.io/

