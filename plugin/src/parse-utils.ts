/**
 * Shared parsing utilities for denylist and allowlist files
 */

/**
 * Result of parsing a package@value line
 */
export interface PackageValuePair {
  package: string;
  value: string;
}

/**
 * Check if a value looks like a date (YYYY-MM-DD format)
 */
export function looksLikeDate(value: string): boolean {
  // ISO date: 2024-01-01 or 2024-01-01T00:00:00.000Z
  // Semver with prerelease: 1.0.0-alpha.1, 1.0.0-rc.1
  // Key difference: dates start with 4 digits then dash
  return /^\d{4}-\d{2}-\d{2}/.test(value);
}

/**
 * Parse a line in package@value format
 * Returns null if the line should be skipped (comment, blank, invalid)
 */
export function parsePackageValue(line: string): PackageValuePair | null {
  const trimmed = line.trim();

  // Skip empty lines and comments
  if (!trimmed || trimmed.startsWith('#')) {
    return null;
  }

  // Find the last @ that separates package name from value
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

  return { package: packageName, value };
}

/**
 * Generic file content parser
 */
export interface ParseResultBase<T> {
  rules: T[];
  errors: Array<{ line: number; content: string }>;
}

export function parseFileContent<T>(
  content: string,
  parseLine: (line: string) => T | null
): ParseResultBase<T> {
  const lines = content.split(/\r?\n/);
  const rules: T[] = [];
  const errors: Array<{ line: number; content: string }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines and comments silently
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const rule = parseLine(line);
    if (rule) {
      rules.push(rule);
    } else {
      errors.push({ line: i + 1, content: line });
    }
  }

  return { rules, errors };
}
