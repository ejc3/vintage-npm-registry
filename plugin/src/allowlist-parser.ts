import { readFileSync, existsSync } from 'fs';
import type { AllowlistRule } from './types';
import { parsePackageValue, looksLikeDate, parseFileContent } from './parse-utils';

export class AllowlistFileNotFoundError extends Error {
  constructor(filePath: string) {
    super(`Allowlist file not found at configured path: ${filePath}`);
    this.name = 'AllowlistFileNotFoundError';
  }
}

/**
 * Parse a single line from the allowlist file
 * Format: package@version (e.g., lodash@4.17.21, @babel/core@7.24.0)
 * Returns null if the line should be skipped (comment, blank, invalid)
 */
export function parseAllowlistLine(line: string): AllowlistRule | null {
  const parsed = parsePackageValue(line);
  if (!parsed) {
    return null;
  }

  const { package: packageName, value } = parsed;

  // Reject date-like values (allowlist should only be specific versions)
  if (looksLikeDate(value)) {
    return null;
  }

  return {
    package: packageName,
    version: value,
  };
}

export interface AllowlistParseResult {
  rules: AllowlistRule[];
  errors: Array<{ line: number; content: string }>;
}

/**
 * Parse allowlist file content into rules
 */
export function parseAllowlistContent(content: string): AllowlistParseResult {
  return parseFileContent(content, parseAllowlistLine);
}

/**
 * Parse allowlist file from disk.
 * Throws if the configured file is missing.
 */
export function parseAllowlistFile(filePath: string): AllowlistParseResult {
  if (!existsSync(filePath)) {
    throw new AllowlistFileNotFoundError(filePath);
  }

  const content = readFileSync(filePath, 'utf-8');
  return parseAllowlistContent(content);
}
