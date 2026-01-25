import { describe, it, expect } from 'vitest';
import { detectPythonFull } from './python-detector.js';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('Python Detector', () => {
  it('should detect pyproject.toml with PEP 621 format', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'elenchus-test-'));

    try {
      const pyprojectContent = `
[project]
name = "myproject"
version = "0.1.0"
requires-python = ">=3.9"
dependencies = [
    "fastapi>=0.100.0",
    "pydantic>=2.0.0",
    "sqlalchemy>=2.0.0"
]

[project.optional-dependencies]
dev = [
    "pytest>=7.0.0",
    "mypy>=1.0.0",
    "ruff>=0.1.0"
]

[tool.pytest.ini_options]
testpaths = ["tests"]

[tool.mypy]
strict = true

[tool.ruff]
line-length = 100
`;

      writeFileSync(join(tempDir, 'pyproject.toml'), pyprojectContent);

      const result = detectPythonFull(tempDir);

      expect(result.detected).toBe(true);
      expect(result.confidence).toBe(95);
      expect(result.packageManager).toBe('pip');
      expect(result.dependencies).toContain('fastapi');
      expect(result.dependencies).toContain('pydantic');
      expect(result.dependencies).toContain('sqlalchemy');
      expect(result.devDependencies).toContain('pytest');
      expect(result.devDependencies).toContain('mypy');
      expect(result.devDependencies).toContain('ruff');
      expect(result.frameworks).toContain('FastAPI');
      expect(result.frameworks).toContain('Pydantic');
      expect(result.frameworks).toContain('SQLAlchemy');
      expect(result.testFramework).toBe('pytest');
      expect(result.hasTypeChecking).toBe(true);
      expect(result.typeChecker).toBe('mypy');
      expect(result.hasLinting).toBe(true);
      expect(result.linter).toBe('ruff');
      expect(result.pythonVersion).toBe('>=3.9');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should detect Poetry projects', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'elenchus-test-'));

    try {
      const pyprojectContent = `
[tool.poetry]
name = "mypoetryproject"
version = "0.1.0"

[tool.poetry.dependencies]
python = "^3.9"
django = "^4.2.0"
celery = "^5.3.0"

[tool.poetry.dev-dependencies]
pytest = "^7.0.0"
black = "^23.0.0"

[tool.black]
line-length = 88
`;

      writeFileSync(join(tempDir, 'pyproject.toml'), pyprojectContent);

      const result = detectPythonFull(tempDir);

      expect(result.detected).toBe(true);
      expect(result.confidence).toBe(90);
      expect(result.packageManager).toBe('poetry');
      expect(result.dependencies).toContain('django');
      expect(result.dependencies).toContain('celery');
      expect(result.devDependencies).toContain('pytest');
      expect(result.devDependencies).toContain('black');
      expect(result.frameworks).toContain('Django');
      expect(result.frameworks).toContain('Celery');
      expect(result.hasFormatting).toBe(true);
      expect(result.formatter).toBe('black');
      expect(result.pythonVersion).toBe('^3.9');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should detect requirements.txt projects', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'elenchus-test-'));

    try {
      const requirementsContent = `flask>=2.0.0
sqlalchemy>=2.0.0
pytest>=7.0.0
# Comment line
numpy>=1.24.0
`;

      writeFileSync(join(tempDir, 'requirements.txt'), requirementsContent);

      const result = detectPythonFull(tempDir);

      expect(result.detected).toBe(true);
      expect(result.confidence).toBe(70);
      expect(result.packageManager).toBe('pip');
      expect(result.dependencies).toContain('flask');
      expect(result.dependencies).toContain('sqlalchemy');
      expect(result.dependencies).toContain('pytest');
      expect(result.dependencies).toContain('numpy');
      expect(result.frameworks).toContain('Flask');
      expect(result.frameworks).toContain('SQLAlchemy');
      expect(result.frameworks).toContain('NumPy');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should detect uv projects', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'elenchus-test-'));

    try {
      const pyprojectContent = `
[project]
name = "myuvproject"
version = "0.1.0"
dependencies = ["fastapi", "torch"]

[tool.uv]
dev-dependencies = ["pytest", "pyright"]

[tool.pyright]
strict = ["src"]
`;

      writeFileSync(join(tempDir, 'pyproject.toml'), pyprojectContent);

      const result = detectPythonFull(tempDir);

      expect(result.detected).toBe(true);
      expect(result.packageManager).toBe('uv');
      expect(result.frameworks).toContain('FastAPI');
      expect(result.frameworks).toContain('PyTorch');
      expect(result.hasTypeChecking).toBe(true);
      expect(result.typeChecker).toBe('pyright');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should detect Pipfile projects', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'elenchus-test-'));

    try {
      const pipfileContent = `
[packages]
django = "*"
pandas = ">=1.5.0"

[dev-packages]
pytest = "*"
pylint = "*"

[requires]
python_version = "3.10"
`;

      writeFileSync(join(tempDir, 'Pipfile'), pipfileContent);

      const result = detectPythonFull(tempDir);

      expect(result.detected).toBe(true);
      expect(result.confidence).toBe(85);
      expect(result.packageManager).toBe('pipenv');
      expect(result.dependencies).toContain('django');
      expect(result.dependencies).toContain('pandas');
      expect(result.devDependencies).toContain('pytest');
      expect(result.devDependencies).toContain('pylint');
      expect(result.frameworks).toContain('Django');
      expect(result.frameworks).toContain('Pandas');
      expect(result.hasLinting).toBe(true);
      expect(result.linter).toBe('pylint');
      expect(result.pythonVersion).toBe('3.10');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should return not detected for non-Python projects', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'elenchus-test-'));

    try {
      writeFileSync(join(tempDir, 'package.json'), '{"name": "test"}');

      const result = detectPythonFull(tempDir);

      expect(result.detected).toBe(false);
      expect(result.confidence).toBe(0);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
