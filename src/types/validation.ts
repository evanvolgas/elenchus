/**
 * Validation types used across the Elenchus system.
 */

/**
 * Severity levels for validation issues.
 */
export type ValidationSeverity = 'error' | 'warning' | 'info';

/**
 * A single validation issue found during spec validation.
 */
export interface ValidationIssue {
  /** Severity of the issue */
  severity: ValidationSeverity;
  /** The field or area where the issue was found */
  field: string;
  /** Human-readable description of the issue */
  message: string;
}

/**
 * Result of validating a specification.
 */
export interface ValidationResult {
  /** Whether the specification is valid (no error-level issues) */
  valid: boolean;
  /** Overall quality score (0-100) */
  score: number;
  /** List of validation issues found */
  issues: ValidationIssue[];
  /** Recommendations for improving the specification */
  recommendations: string[];
}
