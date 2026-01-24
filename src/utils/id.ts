/**
 * Generate a unique ID with a prefix
 */
export function generateId(prefix: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 9);
  return `${prefix}-${timestamp}-${random}`;
}

/**
 * Generate a short random ID
 */
export function shortId(): string {
  return Math.random().toString(36).slice(2, 11);
}
