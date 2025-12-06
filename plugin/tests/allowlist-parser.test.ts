import { describe, it, expect } from 'vitest';
import {
  parseAllowlistLine,
  parseAllowlistContent,
  parseAllowlistFile,
  AllowlistFileNotFoundError,
} from '../src/allowlist-parser';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'fs';

describe('parseAllowlistLine', () => {
  it('parses simple package@version', () => {
    const result = parseAllowlistLine('lodash@4.17.21');
    expect(result).toEqual({
      package: 'lodash',
      range: '4.17.21',
    });
  });

  it('parses scoped package@version', () => {
    const result = parseAllowlistLine('@babel/core@7.24.0');
    expect(result).toEqual({
      package: '@babel/core',
      range: '7.24.0',
    });
  });

  it('parses prerelease versions', () => {
    const result = parseAllowlistLine('react@19.0.0-rc.1');
    expect(result).toEqual({
      package: 'react',
      range: '19.0.0-rc.1',
    });
  });

  it('parses caret range', () => {
    const result = parseAllowlistLine('lodash@^4.17.0');
    expect(result).toEqual({
      package: 'lodash',
      range: '^4.17.0',
    });
  });

  it('parses tilde range', () => {
    const result = parseAllowlistLine('lodash@~4.17.0');
    expect(result).toEqual({
      package: 'lodash',
      range: '~4.17.0',
    });
  });

  it('parses comparison range', () => {
    const result = parseAllowlistLine('lodash@>=4.17.20');
    expect(result).toEqual({
      package: 'lodash',
      range: '>=4.17.20',
    });
  });

  it('parses x-range', () => {
    const result = parseAllowlistLine('lodash@4.17.x');
    expect(result).toEqual({
      package: 'lodash',
      range: '4.17.x',
    });
  });

  it('parses hyphen range', () => {
    const result = parseAllowlistLine('lodash@4.17.0 - 4.17.21');
    expect(result).toEqual({
      package: 'lodash',
      range: '4.17.0 - 4.17.21',
    });
  });

  it('handles whitespace', () => {
    const result = parseAllowlistLine('  lodash@^4.17.0  ');
    expect(result).toEqual({
      package: 'lodash',
      range: '^4.17.0',
    });
  });

  it('rejects date values (allowlist should only be versions)', () => {
    expect(parseAllowlistLine('lodash@2024-01-01')).toBeNull();
    expect(parseAllowlistLine('react@2024-06-15T12:30:00.000Z')).toBeNull();
  });

  it('returns null for empty line', () => {
    expect(parseAllowlistLine('')).toBeNull();
    expect(parseAllowlistLine('   ')).toBeNull();
  });

  it('returns null for comments', () => {
    expect(parseAllowlistLine('# this is a comment')).toBeNull();
    expect(parseAllowlistLine('  # indented comment')).toBeNull();
  });

  it('returns null for line without @', () => {
    expect(parseAllowlistLine('lodash')).toBeNull();
  });

  it('returns null for @ at start only (scoped package without version)', () => {
    expect(parseAllowlistLine('@babel/core')).toBeNull();
  });

  it('returns null for invalid semver range', () => {
    expect(parseAllowlistLine('lodash@not-a-version')).toBeNull();
    expect(parseAllowlistLine('lodash@abc.def.ghi')).toBeNull();
  });
});

describe('parseAllowlistContent', () => {
  it('parses multiple valid lines', () => {
    const content = `
lodash@4.17.21
react@18.3.0
@babel/core@7.24.0
`;
    const result = parseAllowlistContent(content);
    expect(result.rules).toHaveLength(3);
    expect(result.errors).toHaveLength(0);
    expect(result.rules[0]).toEqual({ package: 'lodash', range: '4.17.21' });
  });

  it('parses semver ranges', () => {
    const content = `
lodash@^4.17.0
react@~18.0.0
@babel/core@>=7.20.0
`;
    const result = parseAllowlistContent(content);
    expect(result.rules).toHaveLength(3);
    expect(result.errors).toHaveLength(0);
    expect(result.rules[0]).toEqual({ package: 'lodash', range: '^4.17.0' });
    expect(result.rules[1]).toEqual({ package: 'react', range: '~18.0.0' });
    expect(result.rules[2]).toEqual({ package: '@babel/core', range: '>=7.20.0' });
  });

  it('handles comments and blank lines', () => {
    const content = `
# Allow specific newer versions
lodash@4.17.21

# Also allow React 18.3
react@18.3.0
`;
    const result = parseAllowlistContent(content);
    expect(result.rules).toHaveLength(2);
    expect(result.errors).toHaveLength(0);
  });

  it('collects errors for invalid lines', () => {
    const content = `
lodash@4.17.21
invalid-line-no-at
react@2024-01-01
@babel/core@7.24.0
`;
    const result = parseAllowlistContent(content);
    expect(result.rules).toHaveLength(2);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0].line).toBe(3); // invalid-line-no-at
    expect(result.errors[1].line).toBe(4); // react@2024-01-01 (date is invalid for allowlist)
  });

  it('handles empty content', () => {
    const result = parseAllowlistContent('');
    expect(result.rules).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });
});

describe('parseAllowlistFile', () => {
  it('throws when allowlist file is missing', () => {
    const missingPath = join(tmpdir(), `vintage-allowlist-missing-${Date.now()}.txt`);
    expect(() => parseAllowlistFile(missingPath)).toThrow(
      AllowlistFileNotFoundError
    );
  });

  it('parses existing file from disk', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'vintage-allowlist-'));
    const filePath = join(tempDir, 'allowlist.txt');

    try {
      writeFileSync(filePath, 'lodash@4.17.21\nreact@^18.0.0\n');
      const result = parseAllowlistFile(filePath);
      expect(result.rules).toEqual([
        { package: 'lodash', range: '4.17.21' },
        { package: 'react', range: '^18.0.0' },
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
