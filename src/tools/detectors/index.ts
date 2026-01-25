import type { DetectedLanguage } from '../../types/index.js';
import { detectPython } from './python-detector.js';
import { detectTypeScript } from './typescript-detector.js';
import { detectGo } from './go-detector.js';
import { detectPHP } from './php-detector.js';

/**
 * Detect all programming languages used in a codebase
 *
 * @param rootPath - Root directory of the codebase to analyze
 * @returns Array of detected languages sorted by confidence (highest first)
 */
export function detectAllLanguages(rootPath: string): DetectedLanguage[] {
  const detectors = [
    detectTypeScript,
    detectPython,
    detectGo,
    detectPHP,
  ];

  const detectedLanguages: DetectedLanguage[] = [];
  let totalFiles = 0;

  // Run all detectors
  for (const detector of detectors) {
    try {
      const result = detector(rootPath);
      if (result !== null) {
        detectedLanguages.push(result);
        totalFiles += result.fileCount;
      }
    } catch (error) {
      // Ignore detector errors and continue
      console.error(`Language detector error:`, error);
    }
  }

  // Calculate percentage for each language
  if (totalFiles > 0) {
    for (const lang of detectedLanguages) {
      lang.percentage = (lang.fileCount / totalFiles) * 100;
    }
  }

  // Sort by confidence (highest first)
  detectedLanguages.sort((a, b) => b.confidence - a.confidence);

  return detectedLanguages;
}

/**
 * Get the primary language from detected languages
 *
 * @param detectedLanguages - Array of detected languages
 * @returns Primary language name or 'Unknown' if none detected
 */
export function getPrimaryLanguage(detectedLanguages: DetectedLanguage[]): string {
  if (detectedLanguages.length === 0) {
    return 'Unknown';
  }

  // Return the language with highest confidence
  return detectedLanguages[0]?.name ?? 'Unknown';
}

/**
 * Export individual detectors for direct use
 */
export { detectPython, detectTypeScript, detectGo, detectPHP };
