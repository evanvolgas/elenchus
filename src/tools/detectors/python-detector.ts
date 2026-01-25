import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { glob } from 'glob';
import type { DetectedLanguage } from '../../types/index.js';

export interface PythonAnalysis {
  detected: boolean;
  confidence: number;
  packageManager: 'uv' | 'pip' | 'poetry' | 'pipenv' | 'unknown';
  dependencies: string[];
  devDependencies: string[];
  frameworks: string[];
  hasTests: boolean;
  testFramework: string | null;
  hasLinting: boolean;
  linter: string | null;
  hasTypeChecking: boolean;
  typeChecker: string | null;
  pythonVersion: string | null;
  hasFormatting: boolean;
  formatter: string | null;
}

interface PyProjectTOML {
  project?: {
    name?: string;
    version?: string;
    dependencies?: string[];
    'requires-python'?: string;
    'optional-dependencies'?: Record<string, string[]>;
  };
  tool?: {
    uv?: Record<string, unknown>;
    poetry?: {
      name?: string;
      version?: string;
      dependencies?: Record<string, string>;
      'dev-dependencies'?: Record<string, string>;
      group?: Record<string, { dependencies?: Record<string, string> }>;
    };
    pytest?: Record<string, unknown>;
    'pytest.ini_options'?: Record<string, unknown>;
    ruff?: Record<string, unknown>;
    mypy?: Record<string, unknown>;
    black?: Record<string, unknown>;
    isort?: Record<string, unknown>;
    pylint?: Record<string, unknown>;
    flake8?: Record<string, unknown>;
    pyright?: Record<string, unknown>;
  };
  'build-system'?: {
    requires?: string[];
    'build-backend'?: string;
  };
}

/**
 * Detect Python language usage in a codebase (returns DetectedLanguage for compatibility)
 */
export function detectPython(rootPath: string): DetectedLanguage | null {
  const analysis = detectPythonFull(rootPath);

  if (!analysis.detected) {
    return null;
  }

  const manifestFiles: string[] = [];
  const configFiles: string[] = [];

  // Determine what files exist
  if (existsSync(join(rootPath, 'pyproject.toml'))) manifestFiles.push('pyproject.toml');
  if (existsSync(join(rootPath, 'setup.py'))) manifestFiles.push('setup.py');
  if (existsSync(join(rootPath, 'requirements.txt'))) manifestFiles.push('requirements.txt');
  if (existsSync(join(rootPath, 'Pipfile'))) manifestFiles.push('Pipfile');

  if (analysis.testFramework === 'pytest' && existsSync(join(rootPath, 'pytest.ini'))) {
    configFiles.push('pytest.ini');
  }
  if (analysis.linter && existsSync(join(rootPath, `.${analysis.linter}rc`))) {
    configFiles.push(`.${analysis.linter}rc`);
  }
  if (analysis.typeChecker && existsSync(join(rootPath, `${analysis.typeChecker}.ini`))) {
    configFiles.push(`${analysis.typeChecker}.ini`);
  }

  // Count Python files
  let fileCount = 0;
  try {
    const pyFiles = glob.sync('**/*.py', {
      cwd: rootPath,
      ignore: ['node_modules/**', 'venv/**', '.venv/**', 'env/**', '__pycache__/**', 'dist/**', 'build/**', '.git/**'],
    });
    fileCount = pyFiles.length;
  } catch {
    // Ignore glob errors
  }

  return {
    name: 'Python',
    confidence: analysis.confidence,
    fileCount,
    percentage: 0, // Will be calculated later
    detectionMethod: manifestFiles.length > 0 ? 'manifest' : 'glob',
    frameworks: analysis.frameworks,
    hasTests: analysis.hasTests,
    hasLinting: analysis.hasLinting,
    hasTypeChecking: analysis.hasTypeChecking,
    manifestFiles: manifestFiles.length > 0 ? manifestFiles : undefined,
    configFiles: configFiles.length > 0 ? configFiles : undefined,
  };
}

/**
 * Detect Python project configuration and dependencies (full analysis)
 */
export function detectPythonFull(rootPath: string): PythonAnalysis {
  // Try pyproject.toml first (modern standard)
  const pyprojectPath = join(rootPath, 'pyproject.toml');
  if (existsSync(pyprojectPath)) {
    return analyzePyproject(rootPath, pyprojectPath);
  }

  // Fall back to setup.py
  const setupPyPath = join(rootPath, 'setup.py');
  if (existsSync(setupPyPath)) {
    return analyzeSetupPy(rootPath, setupPyPath);
  }

  // Fall back to requirements.txt
  const requirementsPath = join(rootPath, 'requirements.txt');
  if (existsSync(requirementsPath)) {
    return analyzeRequirementsTxt(rootPath, requirementsPath);
  }

  // Fall back to Pipfile
  const pipfilePath = join(rootPath, 'Pipfile');
  if (existsSync(pipfilePath)) {
    return analyzePipfile(rootPath, pipfilePath);
  }

  // Fall back to .py file detection
  const pyFiles = glob.sync('**/*.py', {
    cwd: rootPath,
    ignore: ['node_modules/**', 'venv/**', '.venv/**', 'env/**', '__pycache__/**'],
  });

  if (pyFiles.length > 0) {
    return {
      detected: true,
      confidence: 50,
      packageManager: 'unknown',
      dependencies: [],
      devDependencies: [],
      frameworks: [],
      hasTests: detectTestFiles(rootPath),
      testFramework: null,
      hasLinting: false,
      linter: null,
      hasTypeChecking: false,
      typeChecker: null,
      pythonVersion: null,
      hasFormatting: false,
      formatter: null,
    };
  }

  return {
    detected: false,
    confidence: 0,
    packageManager: 'unknown',
    dependencies: [],
    devDependencies: [],
    frameworks: [],
    hasTests: false,
    testFramework: null,
    hasLinting: false,
    linter: null,
    hasTypeChecking: false,
    typeChecker: null,
    pythonVersion: null,
    hasFormatting: false,
    formatter: null,
  };
}

/**
 * Parse pyproject.toml using simple TOML parser
 */
function parseTOML(content: string): PyProjectTOML {
  const result: Record<string, unknown> = {};
  const lines = content.split('\n');
  let currentSection: string[] = [];
  let currentObject: Record<string, unknown> = result;
  let currentArray: string[] = [];
  let currentArrayKey: string | null = null;
  let inArray = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) continue;

    // If we're in a multi-line array
    if (inArray) {
      if (trimmed.endsWith(']')) {
        // End of array
        currentArray.push(trimmed.slice(0, -1).trim());
        const arrayItems = currentArray
          .join(' ')
          .split(',')
          .map(item => parseValue(item.trim()))
          .filter(item => item !== '');
        if (currentArrayKey) {
          currentObject[currentArrayKey] = arrayItems;
        }
        inArray = false;
        currentArray = [];
        currentArrayKey = null;
        continue;
      } else {
        // Continue collecting array items
        currentArray.push(trimmed);
        continue;
      }
    }

    // Section header [section.subsection]
    const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
    if (sectionMatch && sectionMatch[1]) {
      currentSection = sectionMatch[1].split('.');
      currentObject = result;

      // Navigate/create nested structure
      for (const part of currentSection) {
        if (!(part in currentObject)) {
          currentObject[part] = {};
        }
        const next = currentObject[part];
        if (typeof next === 'object' && next !== null) {
          currentObject = next as Record<string, unknown>;
        }
      }
      continue;
    }

    // Key-value pair
    const kvMatch = trimmed.match(/^([a-zA-Z0-9_-]+)\s*=\s*(.+)$/);
    if (kvMatch && kvMatch[1] && kvMatch[2]) {
      const key = kvMatch[1];
      const value = kvMatch[2];

      // Check if this is the start of a multi-line array
      if (value.startsWith('[') && !value.endsWith(']')) {
        inArray = true;
        currentArrayKey = key;
        currentArray = [value.slice(1).trim()];
        continue;
      }

      currentObject[key] = parseValue(value.trim());
    }
  }

  return result as PyProjectTOML;
}

/**
 * Parse TOML value (simple implementation)
 */
function parseValue(value: string): unknown {
  // String
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1);
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }

  // Array
  if (value.startsWith('[') && value.endsWith(']')) {
    const items = value
      .slice(1, -1)
      .split(',')
      .map(item => parseValue(item.trim()))
      .filter(item => item !== '');
    return items;
  }

  // Boolean
  if (value === 'true') return true;
  if (value === 'false') return false;

  // Number
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return Number.parseFloat(value);
  }

  // Default to string
  return value;
}

/**
 * Analyze pyproject.toml
 */
function analyzePyproject(rootPath: string, pyprojectPath: string): PythonAnalysis {
  const content = readFileSync(pyprojectPath, 'utf-8');
  const pyproject = parseTOML(content);

  // Determine package manager
  let packageManager: PythonAnalysis['packageManager'] = 'unknown';
  let confidence = 95;

  if (pyproject.tool?.uv) {
    packageManager = 'uv';
  } else if (pyproject.tool?.poetry) {
    packageManager = 'poetry';
    confidence = 90;
  } else if (pyproject.project) {
    // Standard PEP 621 format
    packageManager = 'pip';
  }

  // Extract dependencies
  const dependencies: string[] = [];
  const devDependencies: string[] = [];

  // PEP 621 format (project.dependencies)
  if (pyproject.project?.dependencies) {
    const deps = pyproject.project.dependencies;
    if (Array.isArray(deps)) {
      dependencies.push(...deps.map(extractPackageName));
    }
  }

  // PEP 621 optional dependencies (often used for dev deps)
  if (pyproject.project?.['optional-dependencies']) {
    const optDeps = pyproject.project['optional-dependencies'];
    for (const [_groupName, group] of Object.entries(optDeps)) {
      if (Array.isArray(group)) {
        devDependencies.push(...group.map(extractPackageName));
      }
    }
  }

  // Poetry format
  if (pyproject.tool?.poetry) {
    const poetryDeps = pyproject.tool.poetry.dependencies ?? {};
    dependencies.push(
      ...Object.keys(poetryDeps).filter(name => name !== 'python')
    );

    const poetryDevDeps = pyproject.tool.poetry['dev-dependencies'] ?? {};
    devDependencies.push(...Object.keys(poetryDevDeps));

    // Poetry groups (modern format)
    if (pyproject.tool.poetry.group) {
      for (const [groupName, groupData] of Object.entries(pyproject.tool.poetry.group)) {
        const groupDeps = groupData.dependencies ?? {};
        if (groupName === 'dev' || groupName === 'test') {
          devDependencies.push(...Object.keys(groupDeps));
        } else {
          dependencies.push(...Object.keys(groupDeps));
        }
      }
    }
  }

  // Detect frameworks
  const frameworks = detectPythonFrameworks([...dependencies, ...devDependencies]);

  // Detect test framework
  const { hasTests, testFramework } = detectTestingSetup(
    rootPath,
    [...dependencies, ...devDependencies],
    pyproject
  );

  // Detect linter
  const { hasLinting, linter } = detectLinter(
    rootPath,
    [...dependencies, ...devDependencies],
    pyproject
  );

  // Detect type checker
  const { hasTypeChecking, typeChecker } = detectTypeChecker(
    rootPath,
    [...dependencies, ...devDependencies],
    pyproject
  );

  // Detect formatter
  const { hasFormatting, formatter } = detectFormatter(
    rootPath,
    [...dependencies, ...devDependencies],
    pyproject
  );

  // Python version
  let pythonVersion: string | null = null;
  if (pyproject.project?.['requires-python']) {
    pythonVersion = pyproject.project['requires-python'];
  } else if (pyproject.tool?.poetry?.dependencies?.python) {
    const poetryPythonVersion = pyproject.tool.poetry.dependencies.python;
    pythonVersion = poetryPythonVersion !== undefined ? String(poetryPythonVersion) : null;
  }

  return {
    detected: true,
    confidence,
    packageManager,
    dependencies: Array.from(new Set(dependencies)),
    devDependencies: Array.from(new Set(devDependencies)),
    frameworks,
    hasTests,
    testFramework,
    hasLinting,
    linter,
    hasTypeChecking,
    typeChecker,
    pythonVersion,
    hasFormatting,
    formatter,
  };
}

/**
 * Extract package name from dependency string (e.g., "requests>=2.0.0" -> "requests")
 */
function extractPackageName(dep: string): string {
  const parts = dep.split(/[>=<~!]/);
  return parts[0] ? parts[0].trim() : dep.trim();
}

/**
 * Analyze setup.py
 */
function analyzeSetupPy(rootPath: string, setupPyPath: string): PythonAnalysis {
  const content = readFileSync(setupPyPath, 'utf-8');

  // Extract dependencies using regex (simple approach)
  const dependencies: string[] = [];
  const devDependencies: string[] = [];

  // Match install_requires=['package1', 'package2']
  const installRequiresMatch = content.match(/install_requires\s*=\s*\[([\s\S]*?)\]/);
  if (installRequiresMatch && installRequiresMatch[1]) {
    const deps = installRequiresMatch[1]
      .split(',')
      .map(d => d.trim().replace(/['"]/g, ''))
      .filter(d => d.length > 0)
      .map(extractPackageName);
    dependencies.push(...deps);
  }

  // Match extras_require={'dev': ['package1']}
  const extrasMatch = content.match(/extras_require\s*=\s*{([\s\S]*?)}/);
  if (extrasMatch && extrasMatch[1]) {
    const extrasContent = extrasMatch[1];
    const devMatch = extrasContent.match(/['"]dev['"]\s*:\s*\[([\s\S]*?)\]/);
    if (devMatch && devMatch[1]) {
      const deps = devMatch[1]
        .split(',')
        .map(d => d.trim().replace(/['"]/g, ''))
        .filter(d => d.length > 0)
        .map(extractPackageName);
      devDependencies.push(...deps);
    }
  }

  const frameworks = detectPythonFrameworks([...dependencies, ...devDependencies]);
  const { hasTests, testFramework } = detectTestingSetup(rootPath, [...dependencies, ...devDependencies]);
  const { hasLinting, linter } = detectLinter(rootPath, [...dependencies, ...devDependencies]);
  const { hasTypeChecking, typeChecker } = detectTypeChecker(rootPath, [...dependencies, ...devDependencies]);
  const { hasFormatting, formatter } = detectFormatter(rootPath, [...dependencies, ...devDependencies]);

  // Extract Python version
  let pythonVersion: string | null = null;
  const pythonVersionMatch = content.match(/python_requires\s*=\s*['"]([^'"]+)['"]/);
  if (pythonVersionMatch && pythonVersionMatch[1]) {
    pythonVersion = pythonVersionMatch[1];
  }

  return {
    detected: true,
    confidence: 80,
    packageManager: 'pip',
    dependencies: Array.from(new Set(dependencies)),
    devDependencies: Array.from(new Set(devDependencies)),
    frameworks,
    hasTests,
    testFramework,
    hasLinting,
    linter,
    hasTypeChecking,
    typeChecker,
    pythonVersion,
    hasFormatting,
    formatter,
  };
}

/**
 * Analyze requirements.txt
 */
function analyzeRequirementsTxt(rootPath: string, requirementsPath: string): PythonAnalysis {
  const content = readFileSync(requirementsPath, 'utf-8');
  const dependencies = content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .map(extractPackageName);

  // Check for requirements-dev.txt
  const devDependencies: string[] = [];
  const devReqPath = join(rootPath, 'requirements-dev.txt');
  if (existsSync(devReqPath)) {
    const devContent = readFileSync(devReqPath, 'utf-8');
    const devDeps = devContent
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'))
      .map(extractPackageName);
    devDependencies.push(...devDeps);
  }

  const frameworks = detectPythonFrameworks([...dependencies, ...devDependencies]);
  const { hasTests, testFramework } = detectTestingSetup(rootPath, [...dependencies, ...devDependencies]);
  const { hasLinting, linter } = detectLinter(rootPath, [...dependencies, ...devDependencies]);
  const { hasTypeChecking, typeChecker } = detectTypeChecker(rootPath, [...dependencies, ...devDependencies]);
  const { hasFormatting, formatter } = detectFormatter(rootPath, [...dependencies, ...devDependencies]);

  return {
    detected: true,
    confidence: 70,
    packageManager: 'pip',
    dependencies: Array.from(new Set(dependencies)),
    devDependencies: Array.from(new Set(devDependencies)),
    frameworks,
    hasTests,
    testFramework,
    hasLinting,
    linter,
    hasTypeChecking,
    typeChecker,
    pythonVersion: null,
    hasFormatting,
    formatter,
  };
}

/**
 * Analyze Pipfile
 */
function analyzePipfile(rootPath: string, pipfilePath: string): PythonAnalysis {
  const content = readFileSync(pipfilePath, 'utf-8');

  // Parse TOML-like Pipfile format
  const dependencies: string[] = [];
  const devDependencies: string[] = [];

  // Extract [packages] section
  const packagesMatch = content.match(/\[packages\]([\s\S]*?)(?=\[|$)/);
  if (packagesMatch && packagesMatch[1]) {
    const packages = packagesMatch[1]
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'))
      .map(line => {
        const parts = line.split('=');
        return parts[0] ? parts[0].trim() : '';
      })
      .filter(pkg => pkg.length > 0);
    dependencies.push(...packages);
  }

  // Extract [dev-packages] section
  const devPackagesMatch = content.match(/\[dev-packages\]([\s\S]*?)(?=\[|$)/);
  if (devPackagesMatch && devPackagesMatch[1]) {
    const packages = devPackagesMatch[1]
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'))
      .map(line => {
        const parts = line.split('=');
        return parts[0] ? parts[0].trim() : '';
      })
      .filter(pkg => pkg.length > 0);
    devDependencies.push(...packages);
  }

  const frameworks = detectPythonFrameworks([...dependencies, ...devDependencies]);
  const { hasTests, testFramework } = detectTestingSetup(rootPath, [...dependencies, ...devDependencies]);
  const { hasLinting, linter } = detectLinter(rootPath, [...dependencies, ...devDependencies]);
  const { hasTypeChecking, typeChecker } = detectTypeChecker(rootPath, [...dependencies, ...devDependencies]);
  const { hasFormatting, formatter } = detectFormatter(rootPath, [...dependencies, ...devDependencies]);

  // Extract Python version
  let pythonVersion: string | null = null;
  const pythonVersionMatch = content.match(/python_version\s*=\s*['"]([^'"]+)['"]/);
  if (pythonVersionMatch && pythonVersionMatch[1]) {
    pythonVersion = pythonVersionMatch[1];
  }

  return {
    detected: true,
    confidence: 85,
    packageManager: 'pipenv',
    dependencies: Array.from(new Set(dependencies)),
    devDependencies: Array.from(new Set(devDependencies)),
    frameworks,
    hasTests,
    testFramework,
    hasLinting,
    linter,
    hasTypeChecking,
    typeChecker,
    pythonVersion,
    hasFormatting,
    formatter,
  };
}

/**
 * Detect Python frameworks from dependencies
 */
function detectPythonFrameworks(dependencies: string[]): string[] {
  const frameworks: string[] = [];
  const depSet = new Set(dependencies.map(d => d.toLowerCase()));

  // Web frameworks
  if (depSet.has('fastapi')) frameworks.push('FastAPI');
  if (depSet.has('django')) frameworks.push('Django');
  if (depSet.has('flask')) frameworks.push('Flask');
  if (depSet.has('starlette')) frameworks.push('Starlette');
  if (depSet.has('sanic')) frameworks.push('Sanic');
  if (depSet.has('tornado')) frameworks.push('Tornado');

  // Data & validation
  if (depSet.has('pydantic')) frameworks.push('Pydantic');
  if (depSet.has('sqlalchemy')) frameworks.push('SQLAlchemy');
  if (depSet.has('alembic')) frameworks.push('Alembic');
  if (depSet.has('marshmallow')) frameworks.push('Marshmallow');

  // Async & task queues
  if (depSet.has('celery')) frameworks.push('Celery');
  if (depSet.has('dramatiq')) frameworks.push('Dramatiq');
  if (depSet.has('rq')) frameworks.push('RQ');

  // ML/AI frameworks
  if (depSet.has('pytorch') || depSet.has('torch')) frameworks.push('PyTorch');
  if (depSet.has('tensorflow')) frameworks.push('TensorFlow');
  if (depSet.has('transformers')) frameworks.push('Transformers');
  if (depSet.has('scikit-learn') || depSet.has('sklearn')) frameworks.push('scikit-learn');
  if (depSet.has('numpy')) frameworks.push('NumPy');
  if (depSet.has('pandas')) frameworks.push('Pandas');

  // Testing frameworks
  if (depSet.has('pytest')) frameworks.push('pytest');
  if (depSet.has('unittest')) frameworks.push('unittest');

  return Array.from(new Set(frameworks));
}

/**
 * Detect testing setup
 */
function detectTestingSetup(
  rootPath: string,
  dependencies: string[],
  pyproject?: PyProjectTOML
): { hasTests: boolean; testFramework: string | null } {
  const depSet = new Set(dependencies.map(d => d.toLowerCase()));

  // Check for test frameworks in dependencies
  let testFramework: string | null = null;
  if (depSet.has('pytest')) {
    testFramework = 'pytest';
  } else if (depSet.has('unittest')) {
    testFramework = 'unittest';
  } else if (depSet.has('nose2') || depSet.has('nose')) {
    testFramework = 'nose';
  }

  // Check for pytest config in pyproject.toml
  if (!testFramework && pyproject) {
    if (pyproject.tool?.pytest || pyproject.tool?.['pytest.ini_options']) {
      testFramework = 'pytest';
    }
  }

  // Check for test files
  const hasTests = detectTestFiles(rootPath);

  // Check for pytest.ini or setup.cfg
  if (!testFramework) {
    if (existsSync(join(rootPath, 'pytest.ini'))) {
      testFramework = 'pytest';
    } else if (existsSync(join(rootPath, 'setup.cfg'))) {
      const setupCfg = readFileSync(join(rootPath, 'setup.cfg'), 'utf-8');
      if (setupCfg.includes('[tool:pytest]')) {
        testFramework = 'pytest';
      }
    }
  }

  return { hasTests, testFramework };
}

/**
 * Detect test files
 */
function detectTestFiles(rootPath: string): boolean {
  // Check for tests/ directory
  if (existsSync(join(rootPath, 'tests'))) return true;

  // Check for test_*.py files
  const testFiles = glob.sync('**/test_*.py', {
    cwd: rootPath,
    ignore: ['node_modules/**', 'venv/**', '.venv/**', 'env/**'],
  });

  return testFiles.length > 0;
}

/**
 * Detect linter
 */
function detectLinter(
  rootPath: string,
  dependencies: string[],
  pyproject?: PyProjectTOML
): { hasLinting: boolean; linter: string | null } {
  const depSet = new Set(dependencies.map(d => d.toLowerCase()));

  // Check dependencies
  if (depSet.has('ruff')) {
    return { hasLinting: true, linter: 'ruff' };
  }
  if (depSet.has('pylint')) {
    return { hasLinting: true, linter: 'pylint' };
  }
  if (depSet.has('flake8')) {
    return { hasLinting: true, linter: 'flake8' };
  }

  // Check pyproject.toml
  if (pyproject?.tool) {
    if (pyproject.tool.ruff) {
      return { hasLinting: true, linter: 'ruff' };
    }
    if (pyproject.tool.pylint) {
      return { hasLinting: true, linter: 'pylint' };
    }
    if (pyproject.tool.flake8) {
      return { hasLinting: true, linter: 'flake8' };
    }
  }

  // Check for config files
  if (existsSync(join(rootPath, '.pylintrc'))) {
    return { hasLinting: true, linter: 'pylint' };
  }
  if (existsSync(join(rootPath, '.flake8'))) {
    return { hasLinting: true, linter: 'flake8' };
  }
  if (existsSync(join(rootPath, 'ruff.toml'))) {
    return { hasLinting: true, linter: 'ruff' };
  }

  return { hasLinting: false, linter: null };
}

/**
 * Detect type checker
 */
function detectTypeChecker(
  rootPath: string,
  dependencies: string[],
  pyproject?: PyProjectTOML
): { hasTypeChecking: boolean; typeChecker: string | null } {
  const depSet = new Set(dependencies.map(d => d.toLowerCase()));

  // Check dependencies
  if (depSet.has('mypy')) {
    return { hasTypeChecking: true, typeChecker: 'mypy' };
  }
  if (depSet.has('pyright')) {
    return { hasTypeChecking: true, typeChecker: 'pyright' };
  }
  if (depSet.has('pyre-check')) {
    return { hasTypeChecking: true, typeChecker: 'pyre' };
  }

  // Check pyproject.toml
  if (pyproject?.tool) {
    if (pyproject.tool.mypy) {
      return { hasTypeChecking: true, typeChecker: 'mypy' };
    }
    if (pyproject.tool.pyright) {
      return { hasTypeChecking: true, typeChecker: 'pyright' };
    }
  }

  // Check for config files
  if (existsSync(join(rootPath, 'mypy.ini'))) {
    return { hasTypeChecking: true, typeChecker: 'mypy' };
  }
  if (existsSync(join(rootPath, 'pyrightconfig.json'))) {
    return { hasTypeChecking: true, typeChecker: 'pyright' };
  }

  return { hasTypeChecking: false, typeChecker: null };
}

/**
 * Detect formatter
 */
function detectFormatter(
  rootPath: string,
  dependencies: string[],
  pyproject?: PyProjectTOML
): { hasFormatting: boolean; formatter: string | null } {
  const depSet = new Set(dependencies.map(d => d.toLowerCase()));

  // Check dependencies
  if (depSet.has('ruff')) {
    // Ruff can also format
    if (pyproject?.tool?.ruff && 'format' in (pyproject.tool.ruff as Record<string, unknown>)) {
      return { hasFormatting: true, formatter: 'ruff' };
    }
  }
  if (depSet.has('black')) {
    return { hasFormatting: true, formatter: 'black' };
  }
  if (depSet.has('autopep8')) {
    return { hasFormatting: true, formatter: 'autopep8' };
  }
  if (depSet.has('yapf')) {
    return { hasFormatting: true, formatter: 'yapf' };
  }

  // Check pyproject.toml
  if (pyproject?.tool) {
    if (pyproject.tool.black) {
      return { hasFormatting: true, formatter: 'black' };
    }
  }

  // Check for config files
  if (existsSync(join(rootPath, '.black'))) {
    return { hasFormatting: true, formatter: 'black' };
  }

  return { hasFormatting: false, formatter: null };
}
