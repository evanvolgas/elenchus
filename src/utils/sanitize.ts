/**
 * Input sanitization utilities for defense in depth.
 *
 * These utilities provide additional security layers beyond Zod validation,
 * handling edge cases like Unicode tricks, invisible characters, and
 * potential injection vectors.
 */

/**
 * Pattern for invisible/control characters that could be used for obfuscation
 */
const INVISIBLE_CHARS_PATTERN = /[\u0000-\u001F\u007F-\u009F\u00AD\u200B-\u200F\u2028-\u202F\u2060-\u206F\uFEFF]/g;

// Homoglyph replacement is handled in replaceHomoglyphsWithAscii function

/**
 * Maximum reasonable string length for most inputs
 */
const DEFAULT_MAX_STRING_LENGTH = 10000;

/**
 * Maximum reasonable array length for most inputs
 */
const DEFAULT_MAX_ARRAY_LENGTH = 1000;

/**
 * Maximum reasonable object depth for recursion protection
 */
const DEFAULT_MAX_DEPTH = 20;

/**
 * Options for string sanitization
 */
export interface SanitizeStringOptions {
  /** Maximum length (default: 10000) */
  maxLength?: number;
  /** Remove invisible characters (default: true) */
  removeInvisible?: boolean;
  /** Normalize Unicode to NFC form (default: true) */
  normalizeUnicode?: boolean;
  /** Trim whitespace (default: true) */
  trim?: boolean;
  /** Replace homoglyphs with ASCII equivalents (default: false) */
  replaceHomoglyphs?: boolean;
}

/**
 * Sanitize a string input, removing potentially dangerous characters
 * and normalizing format.
 */
export function sanitizeString(
  input: string,
  options: SanitizeStringOptions = {}
): string {
  const {
    maxLength = DEFAULT_MAX_STRING_LENGTH,
    removeInvisible = true,
    normalizeUnicode = true,
    trim = true,
    replaceHomoglyphs = false,
  } = options;

  let result = input;

  // Enforce maximum length
  if (result.length > maxLength) {
    result = result.slice(0, maxLength);
  }

  // Normalize Unicode (NFC form - canonical decomposition then composition)
  if (normalizeUnicode) {
    result = result.normalize('NFC');
  }

  // Remove invisible/control characters
  if (removeInvisible) {
    result = result.replace(INVISIBLE_CHARS_PATTERN, '');
  }

  // Replace homoglyphs with ASCII equivalents
  if (replaceHomoglyphs) {
    result = replaceHomoglyphsWithAscii(result);
  }

  // Trim whitespace
  if (trim) {
    result = result.trim();
  }

  return result;
}

/**
 * Replace common Unicode homoglyphs with their ASCII equivalents.
 * This prevents attacks where visually similar characters are used
 * to bypass string matching.
 */
function replaceHomoglyphsWithAscii(input: string): string {
  const homoglyphMap: Record<string, string> = {
    // Cyrillic that looks like Latin
    '\u0430': 'a', // Cyrillic a
    '\u0435': 'e', // Cyrillic e
    '\u043E': 'o', // Cyrillic o
    '\u0440': 'p', // Cyrillic p (looks like)
    '\u0441': 'c', // Cyrillic c
    '\u0443': 'y', // Cyrillic y
    '\u0445': 'x', // Cyrillic x
    // Full-width characters
    '\uFF01': '!',
    '\uFF0F': '/',
    '\uFF3C': '\\',
  };

  let result = input;
  for (const [homoglyph, ascii] of Object.entries(homoglyphMap)) {
    result = result.split(homoglyph).join(ascii);
  }
  return result;
}

/**
 * Sanitize an array, enforcing length limits and optionally sanitizing elements
 */
export function sanitizeArray<T>(
  input: T[],
  options: {
    maxLength?: number;
    sanitizeElement?: (element: T) => T;
  } = {}
): T[] {
  const { maxLength = DEFAULT_MAX_ARRAY_LENGTH, sanitizeElement } = options;

  let result = input;

  // Enforce maximum length
  if (result.length > maxLength) {
    result = result.slice(0, maxLength);
  }

  // Optionally sanitize each element
  if (sanitizeElement) {
    result = result.map(sanitizeElement);
  }

  return result;
}

/**
 * Deep sanitize an object, handling nested structures
 */
export function sanitizeObject<T extends Record<string, unknown>>(
  input: T,
  options: {
    maxDepth?: number;
    maxStringLength?: number;
    maxArrayLength?: number;
  } = {},
  currentDepth = 0
): T {
  const {
    maxDepth = DEFAULT_MAX_DEPTH,
    maxStringLength = DEFAULT_MAX_STRING_LENGTH,
    maxArrayLength = DEFAULT_MAX_ARRAY_LENGTH,
  } = options;

  // Prevent infinite recursion
  if (currentDepth >= maxDepth) {
    return {} as T;
  }

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    // Sanitize the key itself
    const sanitizedKey = sanitizeString(key, {
      maxLength: 256,
      removeInvisible: true,
    });

    // Recursively sanitize based on type
    if (typeof value === 'string') {
      result[sanitizedKey] = sanitizeString(value, { maxLength: maxStringLength });
    } else if (Array.isArray(value)) {
      result[sanitizedKey] = sanitizeArray(value, {
        maxLength: maxArrayLength,
        sanitizeElement: (el) => {
          if (typeof el === 'string') {
            return sanitizeString(el, { maxLength: maxStringLength });
          }
          if (typeof el === 'object' && el !== null) {
            return sanitizeObject(el as Record<string, unknown>, options, currentDepth + 1);
          }
          return el;
        },
      });
    } else if (typeof value === 'object' && value !== null) {
      result[sanitizedKey] = sanitizeObject(
        value as Record<string, unknown>,
        options,
        currentDepth + 1
      );
    } else {
      // Primitives (number, boolean, null) pass through
      result[sanitizedKey] = value;
    }
  }

  return result as T;
}

/**
 * Check if a string contains suspicious patterns that might indicate
 * an injection attempt.
 */
export function hasSuspiciousPatterns(input: string): boolean {
  const suspiciousPatterns = [
    // SQL injection patterns
    /['";]\s*(OR|AND|UNION|SELECT|INSERT|UPDATE|DELETE|DROP)\s/i,
    // Command injection patterns
    /[;&|`$]\s*(rm|cat|curl|wget|bash|sh|nc|netcat)\s/i,
    // Path traversal
    /\.\.[\\/]/,
    // Null bytes
    /\x00/,
    // Script injection
    /<script[\s>]/i,
    // Template injection
    /\{\{\s*[^}]*\s*\}\}/,
    // LDAP injection
    /[()\\*]/,
  ];

  return suspiciousPatterns.some((pattern) => pattern.test(input));
}

/**
 * Sanitize a potential file path, removing dangerous components
 */
export function sanitizeFilePath(input: string): string {
  let result = sanitizeString(input, {
    maxLength: 1024,
    removeInvisible: true,
    trim: true,
  });

  // Remove path traversal attempts
  result = result.replace(/\.\.+[\\/]/g, '');

  // Remove multiple consecutive slashes
  result = result.replace(/[\\/]+/g, '/');

  // Remove leading slashes (make relative)
  result = result.replace(/^[\\/]+/, '');

  return result;
}

/**
 * Sanitize an identifier (ID, key, etc.)
 */
export function sanitizeIdentifier(input: string): string {
  // Allow only alphanumeric, hyphens, and underscores
  return sanitizeString(input, {
    maxLength: 256,
    removeInvisible: true,
    trim: true,
  }).replace(/[^a-zA-Z0-9_-]/g, '');
}
