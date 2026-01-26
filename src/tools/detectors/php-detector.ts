import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { glob } from 'glob';
import type { DetectedLanguage } from '../../types/index.js';

/**
 * Detect PHP language usage in a codebase
 */
export function detectPHP(rootPath: string): DetectedLanguage | null {
  const manifestFiles: string[] = [];
  const configFiles: string[] = [];
  let detectionMethod: 'manifest' | 'config' | 'glob' = 'glob';
  let confidence = 0;

  // Check for PHP manifest files
  const composerJsonPath = join(rootPath, 'composer.json');
  const composerLockPath = join(rootPath, 'composer.lock');

  if (existsSync(composerJsonPath)) {
    manifestFiles.push('composer.json');
    confidence += 50;
    detectionMethod = 'manifest';
  }

  if (existsSync(composerLockPath)) {
    manifestFiles.push('composer.lock');
    confidence += 10;
    if (detectionMethod === 'glob') detectionMethod = 'manifest';
  }

  // Check for PHP config files
  const phpUnitPaths = ['phpunit.xml', 'phpunit.xml.dist'];
  for (const phpUnitFile of phpUnitPaths) {
    if (existsSync(join(rootPath, phpUnitFile))) {
      configFiles.push(phpUnitFile);
      confidence += 10;
      if (detectionMethod === 'glob') detectionMethod = 'config';
      break;
    }
  }

  const phpStanPath = join(rootPath, 'phpstan.neon');
  if (existsSync(phpStanPath)) {
    configFiles.push('phpstan.neon');
    confidence += 5;
    if (detectionMethod === 'glob') detectionMethod = 'config';
  }

  const phpCsPath = join(rootPath, '.php-cs-fixer.php');
  if (existsSync(phpCsPath)) {
    configFiles.push('.php-cs-fixer.php');
    confidence += 5;
    if (detectionMethod === 'glob') detectionMethod = 'config';
  }

  // Count PHP files
  let phpFiles: string[] = [];
  try {
    phpFiles = glob.sync('**/*.php', {
      cwd: rootPath,
      ignore: ['node_modules/**', 'vendor/**', 'dist/**', 'build/**', '.git/**'],
    });
  } catch {
    // Ignore glob errors
  }

  const fileCount = phpFiles.length;
  if (fileCount === 0 && manifestFiles.length === 0) {
    return null;
  }

  // Add confidence based on file count
  if (fileCount > 50) confidence += 30;
  else if (fileCount > 20) confidence += 20;
  else if (fileCount > 5) confidence += 10;
  else if (fileCount > 0) confidence += 5;

  // Cap confidence at 100
  confidence = Math.min(confidence, 100);

  // Detect frameworks
  const frameworks = detectPHPFrameworks(rootPath, composerJsonPath);

  // Check for testing
  const hasTests =
    phpFiles.some((f) => f.includes('Test.php') || f.includes('/tests/')) ||
    configFiles.some((f) => f.includes('phpunit'));

  // Check for linting
  const hasLinting = configFiles.some(
    (f) => f.includes('phpstan') || f.includes('php-cs-fixer')
  );

  // Check for type checking (PHP 7.4+ has type declarations)
  const hasTypeChecking = hasLinting; // PHPStan/Psalm provide type checking

  return {
    name: 'PHP',
    confidence,
    fileCount,
    percentage: 0, // Will be calculated later when all languages are detected
    detectionMethod,
    frameworks,
    hasTests,
    hasLinting,
    hasTypeChecking,
    manifestFiles: manifestFiles.length > 0 ? manifestFiles : undefined,
    configFiles: configFiles.length > 0 ? configFiles : undefined,
  };
}

/**
 * Detect PHP frameworks from composer.json
 */
function detectPHPFrameworks(
  _rootPath: string,
  composerJsonPath: string
): string[] {
  const frameworks: string[] = [];

  if (!existsSync(composerJsonPath)) {
    return frameworks;
  }

  try {
    const content = readFileSync(composerJsonPath, 'utf-8');
    let composer: {
      require?: Record<string, string>;
      'require-dev'?: Record<string, string>;
    };

    try {
      composer = JSON.parse(content) as typeof composer;
    } catch {
      // Malformed composer.json - return empty frameworks
      return frameworks;
    }

    const allDeps = {
      ...(composer.require ?? {}),
      ...(composer['require-dev'] ?? {}),
    };

    // Web frameworks
    if ('laravel/framework' in allDeps) frameworks.push('Laravel');
    if (
      'symfony/symfony' in allDeps ||
      'symfony/framework-bundle' in allDeps
    )
      frameworks.push('Symfony');
    if ('cakephp/cakephp' in allDeps) frameworks.push('CakePHP');
    if ('yiisoft/yii2' in allDeps) frameworks.push('Yii');
    if ('codeigniter4/framework' in allDeps) frameworks.push('CodeIgniter');
    if ('slim/slim' in allDeps) frameworks.push('Slim');

    // CMS
    if ('roots/wordpress' in allDeps || 'wordpress/wordpress' in allDeps)
      frameworks.push('WordPress');
    if ('drupal/core' in allDeps) frameworks.push('Drupal');

    // Testing frameworks
    if ('phpunit/phpunit' in allDeps) frameworks.push('PHPUnit');
    if ('pestphp/pest' in allDeps) frameworks.push('Pest');
    if ('codeception/codeception' in allDeps) frameworks.push('Codeception');

    // ORM
    if ('doctrine/orm' in allDeps) frameworks.push('Doctrine');
    if ('illuminate/database' in allDeps) frameworks.push('Eloquent');
  } catch {
    // Ignore parse errors
  }

  return [...new Set(frameworks)];
}
