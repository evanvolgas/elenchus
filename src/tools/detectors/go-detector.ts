import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { glob } from 'glob';
import type { DetectedLanguage } from '../../types/index.js';

/**
 * Detect Go language usage in a codebase
 */
export function detectGo(rootPath: string): DetectedLanguage | null {
  const manifestFiles: string[] = [];
  const configFiles: string[] = [];
  let detectionMethod: 'manifest' | 'config' | 'glob' = 'glob';
  let confidence = 0;

  // Check for Go manifest files
  const goModPath = join(rootPath, 'go.mod');
  const goSumPath = join(rootPath, 'go.sum');

  if (existsSync(goModPath)) {
    manifestFiles.push('go.mod');
    confidence += 50;
    detectionMethod = 'manifest';
  }

  if (existsSync(goSumPath)) {
    manifestFiles.push('go.sum');
    confidence += 10;
    if (detectionMethod === 'glob') detectionMethod = 'manifest';
  }

  // Check for Go config files
  const golangciPath = join(rootPath, '.golangci.yml');
  const makefilePath = join(rootPath, 'Makefile');

  if (existsSync(golangciPath)) {
    configFiles.push('.golangci.yml');
    confidence += 10;
    if (detectionMethod === 'glob') detectionMethod = 'config';
  }

  if (existsSync(makefilePath)) {
    try {
      const content = readFileSync(makefilePath, 'utf-8');
      if (content.includes('go build') || content.includes('go test')) {
        configFiles.push('Makefile');
        confidence += 5;
        if (detectionMethod === 'glob') detectionMethod = 'config';
      }
    } catch {
      // Ignore read errors
    }
  }

  // Count Go files
  let goFiles: string[] = [];
  try {
    goFiles = glob.sync('**/*.go', {
      cwd: rootPath,
      ignore: ['node_modules/**', 'vendor/**', 'dist/**', 'build/**', '.git/**'],
    });
  } catch {
    // Ignore glob errors
  }

  const fileCount = goFiles.length;
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

  // Detect frameworks and libraries
  const frameworks = detectGoFrameworks(rootPath, goModPath);

  // Check for testing (Go test files end with _test.go)
  const hasTests = goFiles.some((f) => f.endsWith('_test.go'));

  // Check for linting
  const hasLinting = configFiles.includes('.golangci.yml');

  // Go doesn't have traditional type checking (it's statically typed)
  // But we can check for strict compilation flags
  const hasTypeChecking = true; // Go is always type-checked

  return {
    name: 'Go',
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
 * Detect Go frameworks from go.mod
 */
function detectGoFrameworks(_rootPath: string, goModPath: string): string[] {
  const frameworks: string[] = [];

  if (!existsSync(goModPath)) {
    return frameworks;
  }

  try {
    const content = readFileSync(goModPath, 'utf-8');

    // Web frameworks
    if (content.includes('github.com/gin-gonic/gin')) frameworks.push('Gin');
    if (content.includes('github.com/gofiber/fiber')) frameworks.push('Fiber');
    if (content.includes('github.com/labstack/echo')) frameworks.push('Echo');
    if (content.includes('github.com/gorilla/mux')) frameworks.push('Gorilla Mux');
    if (content.includes('github.com/go-chi/chi')) frameworks.push('Chi');

    // Testing frameworks
    if (content.includes('github.com/stretchr/testify'))
      frameworks.push('Testify');
    if (content.includes('github.com/onsi/ginkgo')) frameworks.push('Ginkgo');
    if (content.includes('github.com/onsi/gomega')) frameworks.push('Gomega');

    // ORM and databases
    if (content.includes('gorm.io/gorm')) frameworks.push('GORM');
    if (content.includes('github.com/jmoiron/sqlx')) frameworks.push('sqlx');

    // Popular libraries
    if (content.includes('google.golang.org/grpc')) frameworks.push('gRPC');
    if (content.includes('github.com/spf13/cobra')) frameworks.push('Cobra');
    if (content.includes('github.com/spf13/viper')) frameworks.push('Viper');
  } catch {
    // Ignore read errors
  }

  return [...new Set(frameworks)];
}
