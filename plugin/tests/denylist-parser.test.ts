import { describe, it, expect } from 'vitest';
import {
  parseDenylistLine,
  parseDenylistContent,
  parseDenylistFile,
  DenylistFileNotFoundError,
} from '../src/denylist-parser';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'fs';

describe('parseDenylistLine', () => {
  describe('version rules', () => {
    it('parses simple package@version', () => {
      const result = parseDenylistLine('lodash@4.17.20');
      expect(result).toEqual({
        package: 'lodash',
        type: 'version',
        version: '4.17.20',
      });
    });

    it('parses scoped package@version', () => {
      const result = parseDenylistLine('@babel/core@7.23.0');
      expect(result).toEqual({
        package: '@babel/core',
        type: 'version',
        version: '7.23.0',
      });
    });

    it('parses prerelease versions', () => {
      const result = parseDenylistLine('react@18.0.0-rc.1');
      expect(result).toEqual({
        package: 'react',
        type: 'version',
        version: '18.0.0-rc.1',
      });
    });
  });

  describe('date rules', () => {
    it('parses ISO date format', () => {
      const result = parseDenylistLine('lodash@2024-01-01');
      expect(result).toEqual({
        package: 'lodash',
        type: 'date',
        cutoffDate: new Date('2024-01-01'),
      });
    });

    it('parses full ISO timestamp', () => {
      const result = parseDenylistLine('react@2024-06-15T12:30:00.000Z');
      expect(result).toEqual({
        package: 'react',
        type: 'date',
        cutoffDate: new Date('2024-06-15T12:30:00.000Z'),
      });
    });

    it('parses scoped package with date', () => {
      const result = parseDenylistLine('@types/node@2024-03-01');
      expect(result).toEqual({
        package: '@types/node',
        type: 'date',
        cutoffDate: new Date('2024-03-01'),
      });
    });
  });

  describe('allowlist rules', () => {
    it('parses simple +package@version', () => {
      const result = parseDenylistLine('+lodash@4.17.21');
      expect(result).toEqual({
        package: 'lodash',
        type: 'allowlist',
        version: '4.17.21',
      });
    });

    it('parses scoped +package@version', () => {
      const result = parseDenylistLine('+@babel/core@7.24.0');
      expect(result).toEqual({
        package: '@babel/core',
        type: 'allowlist',
        version: '7.24.0',
      });
    });

    it('parses prerelease allowlist versions', () => {
      const result = parseDenylistLine('+react@19.0.0-rc.1');
      expect(result).toEqual({
        package: 'react',
        type: 'allowlist',
        version: '19.0.0-rc.1',
      });
    });

    it('rejects allowlist with date (invalid)', () => {
      // Allowlist with date doesn't make sense
      expect(parseDenylistLine('+lodash@2024-01-01')).toBeNull();
    });

    it('handles whitespace with allowlist prefix', () => {
      const result = parseDenylistLine('  +lodash@4.17.21  ');
      expect(result).toEqual({
        package: 'lodash',
        type: 'allowlist',
        version: '4.17.21',
      });
    });
  });

  describe('invalid lines', () => {
    it('returns null for empty line', () => {
      expect(parseDenylistLine('')).toBeNull();
      expect(parseDenylistLine('   ')).toBeNull();
    });

    it('returns null for comments', () => {
      expect(parseDenylistLine('# this is a comment')).toBeNull();
      expect(parseDenylistLine('  # indented comment')).toBeNull();
    });

    it('returns null for line without @', () => {
      expect(parseDenylistLine('lodash')).toBeNull();
    });

    it('treats non-date strings as version numbers', () => {
      // "not-a-date" doesn't match YYYY-MM-DD pattern, so it's a version
      const result = parseDenylistLine('lodash@not-a-date');
      expect(result).toEqual({
        package: 'lodash',
        type: 'version',
        version: 'not-a-date',
      });
    });

    it('returns null for date-like string that parses to invalid date', () => {
      // This looks like a date but isn't valid
      expect(parseDenylistLine('lodash@2024-99-99')).toBeNull();
    });

    it('returns null for @ at start only (scoped package without version)', () => {
      expect(parseDenylistLine('@babel/core')).toBeNull();
    });
  });
});

describe('parseDenylistContent', () => {
  it('parses multiple valid lines', () => {
    const content = `
lodash@4.17.20
react@2024-01-01
@babel/core@7.23.0
`;
    const result = parseDenylistContent(content);
    expect(result.rules).toHaveLength(3);
    expect(result.errors).toHaveLength(0);
  });

  it('parses mix of denylist and allowlist entries', () => {
    const content = `
# Block old versions
lodash@4.17.20
react@2024-01-01

# Allow specific newer versions
+lodash@4.17.21
+@babel/core@7.24.0
`;
    const result = parseDenylistContent(content);
    expect(result.rules).toHaveLength(4);
    expect(result.errors).toHaveLength(0);

    // Check rule types
    const allowlistRules = result.rules.filter(r => r.type === 'allowlist');
    expect(allowlistRules).toHaveLength(2);
    expect(allowlistRules[0]).toEqual({
      package: 'lodash',
      type: 'allowlist',
      version: '4.17.21',
    });
  });

  it('handles comments and blank lines', () => {
    const content = `
# This is a denylist file
lodash@4.17.20

# Block React after Jan 2024
react@2024-01-01
`;
    const result = parseDenylistContent(content);
    expect(result.rules).toHaveLength(2);
    expect(result.errors).toHaveLength(0);
  });

  it('collects errors for invalid lines', () => {
    const content = `
lodash@4.17.20
invalid-line-no-at
react@2024-01-01
another bad line
`;
    const result = parseDenylistContent(content);
    expect(result.rules).toHaveLength(2);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0].line).toBe(3);
    expect(result.errors[1].line).toBe(5);
  });

  it('handles Windows line endings', () => {
    const content = 'lodash@4.17.20\r\nreact@2024-01-01\r\n';
    const result = parseDenylistContent(content);
    expect(result.rules).toHaveLength(2);
    expect(result.errors).toHaveLength(0);
  });

  it('handles empty content', () => {
    const result = parseDenylistContent('');
    expect(result.rules).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('handles only comments', () => {
    const content = `
# Comment 1
# Comment 2
`;
    const result = parseDenylistContent(content);
    expect(result.rules).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });
});

describe('parseDenylistFile', () => {
  it('throws when denylist file is missing', () => {
    const missingPath = join(tmpdir(), `vintage-missing-${Date.now()}.txt`);
    expect(() => parseDenylistFile(missingPath)).toThrow(
      DenylistFileNotFoundError
    );
  });

  it('parses existing file from disk', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'vintage-denylist-'));
    const filePath = join(tempDir, 'denylist.txt');

    try {
      writeFileSync(filePath, 'lodash@4.17.20\n');
      const result = parseDenylistFile(filePath);
      expect(result.rules).toEqual([
        { package: 'lodash', type: 'version', version: '4.17.20' },
      ]);
      expect(result.errors).toHaveLength(0);
    } finally {
      try {
        unlinkSync(filePath);
      } catch {
        // ignore
      }
      try {
        rmdirSync(tempDir);
      } catch {
        // ignore
      }
    }
  });
});
