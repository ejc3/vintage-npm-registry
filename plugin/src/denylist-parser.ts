import { readFileSync, existsSync } from 'fs';
import type { DenylistRule } from './types';

/**
 * Check if a value looks like a date (contains '-' which semver versions don't have
 * except for prerelease tags, but dates have multiple dashes in specific positions)
 */
function looksLikeDate(value: string): boolean {
  // ISO date: 2024-01-01 or 2024-01-01T00:00:00.000Z
  // Semver with prerelease: 1.0.0-alpha.1, 1.0.0-rc.1
  // Key difference: dates start with 4 digits then dash
  return /^\d{4}-\d{2}-\d{2}/.test(value);
}

/**
 * Parse a single line from the denylist file
 * Returns null if the line should be skipped (comment, blank, invalid)
 */
export function parseDenylistLine(line: string): DenylistRule | null {
  const trimmed = line.trim();

  // Skip empty lines and comments
  if (!trimmed || trimmed.startsWith('#')) {
    return null;
  }

  // Find the last @ that separates package name from version/date
  // This handles scoped packages like @babel/core@2024-01-01
  const lastAtIndex = trimmed.lastIndexOf('@');

  // Must have @ and it can't be at position 0 (that would be @scope with no version)
  // For scoped packages, first @ is at position 0, so lastAtIndex must be > 0
  if (lastAtIndex <= 0) {
    return null;
  }

  const packageName = trimmed.slice(0, lastAtIndex);
  const value = trimmed.slice(lastAtIndex + 1);

  if (!packageName || !value) {
    return null;
  }

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
  const lines = content.split(/\r?\n/);
  const rules: DenylistRule[] = [];
  const errors: Array<{ line: number; content: string }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines and comments silently
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const rule = parseDenylistLine(line);
    if (rule) {
      rules.push(rule);
    } else {
      errors.push({ line: i + 1, content: line });
    }
  }

  return { rules, errors };
}

/**
 * Parse denylist file from disk
 * Returns empty rules array if file doesn't exist
 */
export function parseDenylistFile(filePath: string): ParseResult {
  if (!existsSync(filePath)) {
    return { rules: [], errors: [] };
  }

  const content = readFileSync(filePath, 'utf-8');
  return parseDenylistContent(content);
}
