import { randomBytes } from 'node:crypto';

/**
 * Maximum allowed length for ID prefixes.
 * Prevents excessively long IDs that could cause storage or display issues.
 */
const MAX_PREFIX_LENGTH = 50;

/**
 * Pattern for valid prefix characters.
 * Only allows alphanumeric characters and hyphens to prevent injection attacks.
 */
const SAFE_PREFIX_PATTERN = /^[a-z0-9-]+$/i;

/**
 * Generate a cryptographically secure unique ID with a prefix.
 *
 * Format: `{prefix}-{timestamp}-{random}`
 * - timestamp: Base36 encoded milliseconds since epoch
 * - random: 12 characters of base64url encoded random bytes
 *
 * @param prefix - A short, descriptive prefix (e.g., 'epic', 'session', 'spec')
 * @throws {Error} If prefix is invalid (empty, too long, or contains unsafe characters)
 * @returns A unique ID string suitable for database keys and API references
 *
 * @example
 * generateId('epic') // => 'epic-m5x8z7k-A3bC9dE2fG1h'
 */
export function generateId(prefix: string): string {
  if (!prefix || typeof prefix !== 'string') {
    throw new Error('Prefix must be a non-empty string');
  }

  if (prefix.length > MAX_PREFIX_LENGTH) {
    throw new Error(`Prefix must be ${MAX_PREFIX_LENGTH} characters or less`);
  }

  if (!SAFE_PREFIX_PATTERN.test(prefix)) {
    throw new Error('Prefix must contain only alphanumeric characters and hyphens');
  }

  const timestamp = Date.now().toString(36);
  // Use cryptographically secure random bytes instead of Math.random()
  const random = randomBytes(9).toString('base64url').slice(0, 12);

  return `${prefix}-${timestamp}-${random}`;
}

/**
 * Generate a cryptographically secure short random ID.
 *
 * Produces an 11-character base64url string suitable for temporary identifiers
 * where uniqueness is needed but no semantic prefix is required.
 *
 * @returns An 11-character random string using base64url alphabet
 *
 * @example
 * shortId() // => 'A3bC9dE2fG1'
 */
export function shortId(): string {
  // Use cryptographically secure random bytes instead of Math.random()
  return randomBytes(8).toString('base64url').slice(0, 11);
}

/**
 * Validate that a string matches the expected ID format.
 *
 * Useful for input validation before database lookups.
 *
 * @param id - The ID string to validate
 * @param expectedPrefix - Optional prefix the ID should start with
 * @returns true if the ID appears to be a valid generated ID
 *
 * @example
 * isValidId('epic-m5x8z7k-A3bC9dE2fG1h') // => true
 * isValidId('epic-m5x8z7k-A3bC9dE2fG1h', 'epic') // => true
 * isValidId('epic-m5x8z7k-A3bC9dE2fG1h', 'session') // => false
 */
export function isValidId(id: string, expectedPrefix?: string): boolean {
  if (!id || typeof id !== 'string') {
    return false;
  }

  // Check format: prefix-timestamp-random
  const parts = id.split('-');
  if (parts.length < 3) {
    return false;
  }

  // Validate prefix if expected
  if (expectedPrefix && parts[0] !== expectedPrefix) {
    return false;
  }

  // Basic sanity checks
  const prefix = parts[0];
  if (!prefix || !SAFE_PREFIX_PATTERN.test(prefix)) {
    return false;
  }

  return true;
}
