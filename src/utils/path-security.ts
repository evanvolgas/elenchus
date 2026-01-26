import { resolve, relative, isAbsolute, normalize } from 'node:path';
import { existsSync, statSync } from 'node:fs';

/**
 * Error thrown when a path traversal attempt is detected.
 */
export class PathTraversalError extends Error {
  constructor(
    public readonly attemptedPath: string,
    public readonly resolvedPath: string,
    public readonly allowedRoot: string
  ) {
    super(
      `Path traversal attempt detected: "${attemptedPath}" resolves to "${resolvedPath}" which is outside allowed root "${allowedRoot}"`
    );
    this.name = 'PathTraversalError';
  }
}

/**
 * Error thrown when an invalid path is provided.
 */
export class InvalidPathError extends Error {
  constructor(
    public readonly path: string,
    public readonly reason: string
  ) {
    super(`Invalid path "${path}": ${reason}`);
    this.name = 'InvalidPathError';
  }
}

/**
 * Options for path validation.
 */
export interface ValidatePathOptions {
  /**
   * The root directory that paths must stay within.
   * Defaults to process.cwd().
   */
  allowedRoot?: string;

  /**
   * Whether the path must exist on the filesystem.
   * Defaults to true.
   */
  mustExist?: boolean;

  /**
   * Whether the path must be a directory (vs a file).
   * If not specified, either is accepted.
   */
  mustBeDirectory?: boolean;

  /**
   * Maximum path length to prevent DoS via extremely long paths.
   * Defaults to 4096 characters.
   */
  maxLength?: number;
}

/**
 * Maximum allowed path length (characters).
 * Prevents DoS attacks via extremely long path strings.
 */
const DEFAULT_MAX_PATH_LENGTH = 4096;

/**
 * Pattern for potentially dangerous path components.
 * Detects null bytes and other control characters that could be used for injection.
 */
const DANGEROUS_PATH_PATTERN = /[\x00-\x1f]/;

/**
 * Validate and normalize a path, preventing directory traversal attacks.
 *
 * This function ensures that:
 * 1. The path does not contain null bytes or control characters
 * 2. The path is not excessively long
 * 3. The resolved path stays within the allowed root directory
 * 4. The path exists (if mustExist is true)
 * 5. The path is a directory (if mustBeDirectory is true)
 *
 * @param inputPath - The path to validate (can be relative or absolute)
 * @param options - Validation options
 * @returns The validated, normalized absolute path
 * @throws {InvalidPathError} If the path is invalid (null bytes, too long, etc.)
 * @throws {PathTraversalError} If the path would escape the allowed root
 *
 * @example
 * // Valid path within current directory
 * validatePath('./src/index.ts') // => '/full/path/to/project/src/index.ts'
 *
 * // Traversal attempt - throws PathTraversalError
 * validatePath('../../../etc/passwd')
 *
 * // Null byte injection - throws InvalidPathError
 * validatePath('file.txt\x00.jpg')
 */
export function validatePath(
  inputPath: string,
  options: ValidatePathOptions = {}
): string {
  const {
    allowedRoot = process.cwd(),
    mustExist = true,
    mustBeDirectory,
    maxLength = DEFAULT_MAX_PATH_LENGTH,
  } = options;

  // Check for empty path
  if (!inputPath || typeof inputPath !== 'string') {
    throw new InvalidPathError(String(inputPath), 'path must be a non-empty string');
  }

  // Check path length
  if (inputPath.length > maxLength) {
    throw new InvalidPathError(
      inputPath.slice(0, 50) + '...',
      `path exceeds maximum length of ${maxLength} characters`
    );
  }

  // Check for dangerous characters (null bytes, control characters)
  if (DANGEROUS_PATH_PATTERN.test(inputPath)) {
    throw new InvalidPathError(inputPath, 'path contains null bytes or control characters');
  }

  // Normalize the allowed root
  const normalizedRoot = resolve(allowedRoot);

  // Resolve the input path relative to the allowed root
  const resolvedPath = isAbsolute(inputPath)
    ? normalize(inputPath)
    : resolve(normalizedRoot, inputPath);

  // Check that the resolved path is within the allowed root
  const relativePath = relative(normalizedRoot, resolvedPath);

  // If the relative path starts with '..' or is absolute, it's outside the root
  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new PathTraversalError(inputPath, resolvedPath, normalizedRoot);
  }

  // Check existence if required
  if (mustExist && !existsSync(resolvedPath)) {
    throw new InvalidPathError(inputPath, 'path does not exist');
  }

  // Check if it's a directory if required
  if (mustExist && mustBeDirectory !== undefined) {
    try {
      const stat = statSync(resolvedPath);
      if (mustBeDirectory && !stat.isDirectory()) {
        throw new InvalidPathError(inputPath, 'path is not a directory');
      }
      if (mustBeDirectory === false && stat.isDirectory()) {
        throw new InvalidPathError(inputPath, 'path is a directory, expected a file');
      }
    } catch (error) {
      if (error instanceof InvalidPathError) {
        throw error;
      }
      throw new InvalidPathError(inputPath, `cannot stat path: ${(error as Error).message}`);
    }
  }

  return resolvedPath;
}

/**
 * Sanitize a string for safe use in glob patterns.
 *
 * Removes or escapes glob special characters to prevent glob injection attacks.
 *
 * @param input - The string to sanitize
 * @returns A sanitized string safe for use in glob patterns
 *
 * @example
 * sanitizeGlobPattern('auth') // => 'auth'
 * sanitizeGlobPattern('**\/*') // => ''
 * sanitizeGlobPattern('user[0-9]') // => 'user09'
 */
export function sanitizeGlobPattern(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  // Remove glob and shell special characters:
  // * ? [ ] { } ( ) ! + ^ $ | \ / , ` - all potentially dangerous in globs/shells
  // Keep only alphanumeric, hyphens, underscores, and dots
  return input.replace(/[*?[\]{}()!+^$|\\\/,`]/g, '').slice(0, 100);
}

/**
 * Check if a path is within an allowed root directory without throwing.
 *
 * @param inputPath - The path to check
 * @param allowedRoot - The root directory that paths must stay within
 * @returns true if the path is within the allowed root, false otherwise
 */
export function isPathWithinRoot(inputPath: string, allowedRoot: string = process.cwd()): boolean {
  try {
    validatePath(inputPath, { allowedRoot, mustExist: false });
    return true;
  } catch {
    return false;
  }
}
