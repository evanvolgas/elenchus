import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { glob } from 'glob';
import type { DetectedLanguage } from '../../types/index.js';

/**
 * Detect TypeScript/JavaScript language usage in a codebase
 */
export function detectTypeScript(rootPath: string): DetectedLanguage | null {
  const manifestFiles: string[] = [];
  const configFiles: string[] = [];
  let detectionMethod: 'manifest' | 'config' | 'glob' = 'glob';
  let confidence = 0;
  let isTypeScript = false;

  // Check for package.json
  const packageJsonPath = join(rootPath, 'package.json');
  if (existsSync(packageJsonPath)) {
    manifestFiles.push('package.json');
    confidence += 30;
    detectionMethod = 'manifest';
  }

  // Check for TypeScript config
  const tsconfigPath = join(rootPath, 'tsconfig.json');
  if (existsSync(tsconfigPath)) {
    configFiles.push('tsconfig.json');
    confidence += 40;
    detectionMethod = 'config';
    isTypeScript = true;
  }

  // Check for other config files
  const eslintPaths = [
    '.eslintrc.json',
    '.eslintrc.js',
    '.eslintrc.cjs',
    'eslint.config.js',
  ];
  for (const eslintFile of eslintPaths) {
    if (existsSync(join(rootPath, eslintFile))) {
      configFiles.push(eslintFile);
      confidence += 5;
      if (detectionMethod === 'glob') detectionMethod = 'config';
      break;
    }
  }

  const prettierPaths = ['.prettierrc', '.prettierrc.json', 'prettier.config.js'];
  for (const prettierFile of prettierPaths) {
    if (existsSync(join(rootPath, prettierFile))) {
      configFiles.push(prettierFile);
      confidence += 5;
      if (detectionMethod === 'glob') detectionMethod = 'config';
      break;
    }
  }

  // Count TypeScript/JavaScript files
  let tsFiles: string[] = [];
  let jsFiles: string[] = [];
  try {
    tsFiles = glob.sync('**/*.{ts,tsx}', {
      cwd: rootPath,
      ignore: ['node_modules/**', 'dist/**', 'build/**', '.git/**'],
    });

    jsFiles = glob.sync('**/*.{js,jsx,mjs,cjs}', {
      cwd: rootPath,
      ignore: ['node_modules/**', 'dist/**', 'build/**', '.git/**'],
    });
  } catch {
    // Ignore glob errors
  }

  const tsFileCount = tsFiles.length;
  const jsFileCount = jsFiles.length;
  const totalFileCount = tsFileCount + jsFileCount;

  if (totalFileCount === 0 && manifestFiles.length === 0) {
    return null;
  }

  // Determine if this is TypeScript or JavaScript
  if (tsFileCount > jsFileCount || isTypeScript) {
    isTypeScript = true;
    if (tsFileCount > 50) confidence += 30;
    else if (tsFileCount > 20) confidence += 20;
    else if (tsFileCount > 5) confidence += 10;
    else if (tsFileCount > 0) confidence += 5;
  } else {
    if (jsFileCount > 50) confidence += 30;
    else if (jsFileCount > 20) confidence += 20;
    else if (jsFileCount > 5) confidence += 10;
    else if (jsFileCount > 0) confidence += 5;
  }

  // Cap confidence at 100
  confidence = Math.min(confidence, 100);

  // Detect frameworks
  const frameworks = detectJavaScriptFrameworks(rootPath, packageJsonPath);

  // Check for testing
  const hasTests =
    tsFiles.some(
      (f) =>
        f.includes('.test.') ||
        f.includes('.spec.') ||
        f.includes('__tests__/')
    ) ||
    jsFiles.some(
      (f) =>
        f.includes('.test.') ||
        f.includes('.spec.') ||
        f.includes('__tests__/')
    );

  // Check for linting
  const hasLinting = configFiles.some((f) => f.includes('eslint'));

  // Check for type checking
  const hasTypeChecking = isTypeScript && configFiles.includes('tsconfig.json');

  return {
    name: isTypeScript ? 'TypeScript' : 'JavaScript',
    confidence,
    fileCount: totalFileCount,
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
 * Detect JavaScript/TypeScript frameworks from package.json
 */
function detectJavaScriptFrameworks(
  _rootPath: string,
  packageJsonPath: string
): string[] {
  const frameworks: string[] = [];

  if (!existsSync(packageJsonPath)) {
    return frameworks;
  }

  try {
    const content = readFileSync(packageJsonPath, 'utf-8');
    const pkg = JSON.parse(content) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    const allDeps = {
      ...(pkg.dependencies ?? {}),
      ...(pkg.devDependencies ?? {}),
    };

    // Frontend frameworks
    if ('react' in allDeps) frameworks.push('React');
    if ('vue' in allDeps) frameworks.push('Vue');
    if ('svelte' in allDeps) frameworks.push('Svelte');
    if ('angular' in allDeps || '@angular/core' in allDeps)
      frameworks.push('Angular');
    if ('next' in allDeps) frameworks.push('Next.js');
    if ('nuxt' in allDeps) frameworks.push('Nuxt');
    if ('gatsby' in allDeps) frameworks.push('Gatsby');

    // Backend frameworks
    if ('express' in allDeps) frameworks.push('Express');
    if ('fastify' in allDeps) frameworks.push('Fastify');
    if ('hono' in allDeps) frameworks.push('Hono');
    if ('nestjs' in allDeps || '@nestjs/core' in allDeps)
      frameworks.push('NestJS');
    if ('koa' in allDeps) frameworks.push('Koa');

    // Testing frameworks
    if ('jest' in allDeps) frameworks.push('Jest');
    if ('vitest' in allDeps) frameworks.push('Vitest');
    if ('mocha' in allDeps) frameworks.push('Mocha');
    if ('cypress' in allDeps) frameworks.push('Cypress');
    if ('playwright' in allDeps) frameworks.push('Playwright');

    // Build tools
    if ('vite' in allDeps) frameworks.push('Vite');
    if ('webpack' in allDeps) frameworks.push('Webpack');
    if ('rollup' in allDeps) frameworks.push('Rollup');
    if ('esbuild' in allDeps) frameworks.push('esbuild');

    // State management
    if ('redux' in allDeps || '@reduxjs/toolkit' in allDeps)
      frameworks.push('Redux');
    if ('zustand' in allDeps) frameworks.push('Zustand');
    if ('mobx' in allDeps) frameworks.push('MobX');
  } catch {
    // Ignore parse errors
  }

  return [...new Set(frameworks)];
}
