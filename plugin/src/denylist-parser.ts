import { readFileSync, existsSync } from 'fs';
import type { DenylistRule } from './types';
import { parsePackageValue, looksLikeDate, parseFileContent } from './parse-utils';

export class DenylistFileNotFoundError extends Error {
  constructor(filePath: string) {
    super(`Denylist file not found at configured path: ${filePath}`);
    this.name = 'DenylistFileNotFoundError';
  }
}

/**
 * Parse a single line from the denylist file
 * Returns null if the line should be skipped (comment, blank, invalid)
 */
export function parseDenylistLine(line: string): DenylistRule | null {
  const parsed = parsePackageValue(line);
  if (!parsed) {
    return null;
  }

  const { package: packageName, value } = parsed;

  // Determine if this is a date or version rule
  if (looksLikeDate(value)) {
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      return null;
    }
    return {
      package: packageName,
      type: 'date',
      cutoffDate: date,
    };
  } else {
    return {
      package: packageName,
      type: 'version',
      version: value,
    };
  }
}

export interface ParseResult {
  rules: DenylistRule[];
  errors: Array<{ line: number; content: string }>;
}

/**
 * Parse denylist file content into rules
 */
export function parseDenylistContent(content: string): ParseResult {
  return parseFileContent(content, parseDenylistLine);
}

/**
 * Parse denylist file from disk.
 * Throws if the configured file is missing.
 */
export function parseDenylistFile(filePath: string): ParseResult {
  if (!existsSync(filePath)) {
    throw new DenylistFileNotFoundError(filePath);
  }

  const content = readFileSync(filePath, 'utf-8');
  return parseDenylistContent(content);
}
