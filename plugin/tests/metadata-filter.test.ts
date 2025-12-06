import { describe, it, expect } from 'vitest';
import {
  getEarliestCutoff,
  filterVersionsByDate,
  removeBlockedVersions,
  addAllowedVersions,
  findLatestVersion,
  findLatestStableVersion,
  fixDistTags,
  filterPackageMetadata,
} from '../src/metadata-filter';
import type { PackageMetadata, VersionManifest } from '../src/types';

const makeManifest = (version: string): VersionManifest => ({
  name: 'test-package',
  version,
});

describe('getEarliestCutoff', () => {
  it('returns undefined when both are undefined', () => {
    expect(getEarliestCutoff(undefined, undefined)).toBeUndefined();
  });

  it('returns global when package is undefined', () => {
    const global = new Date('2024-01-01');
    expect(getEarliestCutoff(global, undefined)).toEqual(global);
  });

  it('returns package when global is undefined', () => {
    const pkg = new Date('2024-06-01');
    expect(getEarliestCutoff(undefined, pkg)).toEqual(pkg);
  });

  it('returns earlier date when both defined', () => {
    const earlier = new Date('2024-01-01');
    const later = new Date('2024-06-01');
    expect(getEarliestCutoff(earlier, later)).toEqual(earlier);
    expect(getEarliestCutoff(later, earlier)).toEqual(earlier);
  });
});

describe('filterVersionsByDate', () => {
  const versions = {
    '1.0.0': makeManifest('1.0.0'),
    '2.0.0': makeManifest('2.0.0'),
    '3.0.0': makeManifest('3.0.0'),
  };

  const time = {
    '1.0.0': '2023-01-01T00:00:00.000Z',
    '2.0.0': '2024-01-15T00:00:00.000Z',
    '3.0.0': '2024-06-01T00:00:00.000Z',
  };

  it('keeps versions before cutoff', () => {
    const cutoff = new Date('2024-01-01');
    const result = filterVersionsByDate(versions, time, cutoff);
    expect(Object.keys(result)).toEqual(['1.0.0']);
  });

  it('keeps versions on cutoff date', () => {
    const cutoff = new Date('2024-01-15T00:00:00.000Z');
    const result = filterVersionsByDate(versions, time, cutoff);
    expect(Object.keys(result).sort()).toEqual(['1.0.0', '2.0.0']);
  });

  it('keeps all versions when cutoff is in future', () => {
    const cutoff = new Date('2025-01-01');
    const result = filterVersionsByDate(versions, time, cutoff);
    expect(Object.keys(result).sort()).toEqual(['1.0.0', '2.0.0', '3.0.0']);
  });

  it('keeps versions with missing time data (fail-open)', () => {
    const partialTime = { '1.0.0': '2023-01-01T00:00:00.000Z' };
    const cutoff = new Date('2023-06-01');
    const result = filterVersionsByDate(versions, partialTime, cutoff);
    expect(Object.keys(result).sort()).toEqual(['1.0.0', '2.0.0', '3.0.0']);
  });

  it('handles undefined time object', () => {
    const cutoff = new Date('2024-01-01');
    const result = filterVersionsByDate(versions, undefined, cutoff);
    expect(Object.keys(result).sort()).toEqual(['1.0.0', '2.0.0', '3.0.0']);
  });
});

describe('removeBlockedVersions', () => {
  const versions = {
    '1.0.0': makeManifest('1.0.0'),
    '2.0.0': makeManifest('2.0.0'),
    '2.1.0': makeManifest('2.1.0'),
    '3.0.0': makeManifest('3.0.0'),
  };

  it('removes exact blocked version', () => {
    const blocked = ['2.0.0'];
    const result = removeBlockedVersions(versions, blocked);
    expect(Object.keys(result).sort()).toEqual(['1.0.0', '2.1.0', '3.0.0']);
  });

  it('removes multiple blocked versions', () => {
    const blocked = ['1.0.0', '3.0.0'];
    const result = removeBlockedVersions(versions, blocked);
    expect(Object.keys(result).sort()).toEqual(['2.0.0', '2.1.0']);
  });

  it('handles empty blocked array', () => {
    const blocked: string[] = [];
    const result = removeBlockedVersions(versions, blocked);
    expect(Object.keys(result).sort()).toEqual(['1.0.0', '2.0.0', '2.1.0', '3.0.0']);
  });

  it('handles non-existent blocked version', () => {
    const blocked = ['4.0.0'];
    const result = removeBlockedVersions(versions, blocked);
    expect(Object.keys(result).sort()).toEqual(['1.0.0', '2.0.0', '2.1.0', '3.0.0']);
  });

  it('blocks versions matching caret range', () => {
    // ^2.0.0 matches 2.0.0 and 2.1.0 (same major)
    const blocked = ['^2.0.0'];
    const result = removeBlockedVersions(versions, blocked);
    expect(Object.keys(result).sort()).toEqual(['1.0.0', '3.0.0']);
  });

  it('blocks versions matching tilde range', () => {
    // ~2.0.0 matches only 2.0.x
    const blocked = ['~2.0.0'];
    const result = removeBlockedVersions(versions, blocked);
    expect(Object.keys(result).sort()).toEqual(['1.0.0', '2.1.0', '3.0.0']);
  });

  it('blocks versions matching comparison range', () => {
    // >=2.0.0 matches 2.0.0, 2.1.0, 3.0.0
    const blocked = ['>=2.0.0'];
    const result = removeBlockedVersions(versions, blocked);
    expect(Object.keys(result)).toEqual(['1.0.0']);
  });

  it('blocks versions matching x-range', () => {
    // 2.x matches all 2.x versions
    const blocked = ['2.x'];
    const result = removeBlockedVersions(versions, blocked);
    expect(Object.keys(result).sort()).toEqual(['1.0.0', '3.0.0']);
  });

  it('blocks versions matching hyphen range', () => {
    // 2.0.0 - 2.1.0 matches 2.0.0 and 2.1.0
    const blocked = ['2.0.0 - 2.1.0'];
    const result = removeBlockedVersions(versions, blocked);
    expect(Object.keys(result).sort()).toEqual(['1.0.0', '3.0.0']);
  });

  it('blocks versions matching less than range', () => {
    // <2.1.0 matches 1.0.0 and 2.0.0
    const blocked = ['<2.1.0'];
    const result = removeBlockedVersions(versions, blocked);
    expect(Object.keys(result).sort()).toEqual(['2.1.0', '3.0.0']);
  });

  it('blocks versions matching less than or equal range', () => {
    // <=2.0.0 matches 1.0.0 and 2.0.0
    const blocked = ['<=2.0.0'];
    const result = removeBlockedVersions(versions, blocked);
    expect(Object.keys(result).sort()).toEqual(['2.1.0', '3.0.0']);
  });
});

describe('addAllowedVersions', () => {
  const originalVersions = {
    '1.0.0': makeManifest('1.0.0'),
    '2.0.0': makeManifest('2.0.0'),
    '3.0.0': makeManifest('3.0.0'),
    '3.1.0': makeManifest('3.1.0'),
    '4.0.0-beta.1': makeManifest('4.0.0-beta.1'),
  };

  it('adds allowed version back to filtered set (exact version)', () => {
    const filteredVersions = {
      '1.0.0': makeManifest('1.0.0'),
    };
    const rules = [{ package: 'test-package', range: '3.0.0' }];
    const result = addAllowedVersions(filteredVersions, originalVersions, rules);
    expect(Object.keys(result).sort()).toEqual(['1.0.0', '3.0.0']);
  });

  it('adds multiple allowed versions with exact matches', () => {
    const filteredVersions = {
      '1.0.0': makeManifest('1.0.0'),
    };
    const rules = [
      { package: 'test-package', range: '2.0.0' },
      { package: 'test-package', range: '3.0.0' },
    ];
    const result = addAllowedVersions(filteredVersions, originalVersions, rules);
    expect(Object.keys(result).sort()).toEqual(['1.0.0', '2.0.0', '3.0.0']);
  });

  it('supports caret range (^)', () => {
    const filteredVersions = {
      '1.0.0': makeManifest('1.0.0'),
    };
    // ^3.0.0 matches 3.0.0 and 3.1.0 (same major)
    const rules = [{ package: 'test-package', range: '^3.0.0' }];
    const result = addAllowedVersions(filteredVersions, originalVersions, rules);
    expect(Object.keys(result).sort()).toEqual(['1.0.0', '3.0.0', '3.1.0']);
  });

  it('supports tilde range (~)', () => {
    const filteredVersions = {
      '1.0.0': makeManifest('1.0.0'),
    };
    // ~3.0.0 matches 3.0.x only
    const rules = [{ package: 'test-package', range: '~3.0.0' }];
    const result = addAllowedVersions(filteredVersions, originalVersions, rules);
    expect(Object.keys(result).sort()).toEqual(['1.0.0', '3.0.0']);
  });

  it('supports comparison range (>=)', () => {
    const filteredVersions = {
      '1.0.0': makeManifest('1.0.0'),
    };
    // >=3.0.0 matches 3.0.0, 3.1.0 (but not prerelease by default)
    const rules = [{ package: 'test-package', range: '>=3.0.0' }];
    const result = addAllowedVersions(filteredVersions, originalVersions, rules);
    expect(Object.keys(result).sort()).toEqual(['1.0.0', '3.0.0', '3.1.0']);
  });

  it('supports x-range', () => {
    const filteredVersions = {
      '1.0.0': makeManifest('1.0.0'),
    };
    // 3.x matches all 3.x versions
    const rules = [{ package: 'test-package', range: '3.x' }];
    const result = addAllowedVersions(filteredVersions, originalVersions, rules);
    expect(Object.keys(result).sort()).toEqual(['1.0.0', '3.0.0', '3.1.0']);
  });

  it('does not add version that does not exist in original', () => {
    const filteredVersions = {
      '1.0.0': makeManifest('1.0.0'),
    };
    const rules = [{ package: 'test-package', range: '5.0.0' }];
    const result = addAllowedVersions(filteredVersions, originalVersions, rules);
    expect(Object.keys(result)).toEqual(['1.0.0']);
  });

  it('does not duplicate already existing version', () => {
    const filteredVersions = {
      '1.0.0': makeManifest('1.0.0'),
      '2.0.0': makeManifest('2.0.0'),
    };
    const rules = [{ package: 'test-package', range: '2.0.0' }];
    const result = addAllowedVersions(filteredVersions, originalVersions, rules);
    expect(Object.keys(result).sort()).toEqual(['1.0.0', '2.0.0']);
  });

  it('handles empty rules array', () => {
    const filteredVersions = {
      '1.0.0': makeManifest('1.0.0'),
    };
    const rules: Array<{ package: string; range: string }> = [];
    const result = addAllowedVersions(filteredVersions, originalVersions, rules);
    expect(Object.keys(result)).toEqual(['1.0.0']);
  });
});

describe('findLatestVersion', () => {
  it('finds latest semver version', () => {
    expect(findLatestVersion(['1.0.0', '2.0.0', '1.5.0'])).toBe('2.0.0');
  });

  it('handles prerelease versions', () => {
    expect(findLatestVersion(['1.0.0', '2.0.0-alpha.1', '1.9.0'])).toBe('2.0.0-alpha.1');
  });

  it('returns undefined for empty array', () => {
    expect(findLatestVersion([])).toBeUndefined();
  });

  it('handles single version', () => {
    expect(findLatestVersion(['1.0.0'])).toBe('1.0.0');
  });
});

describe('findLatestStableVersion', () => {
  it('prefers stable over prerelease', () => {
    expect(findLatestStableVersion(['1.0.0', '2.0.0-alpha.1', '1.9.0'])).toBe('1.9.0');
  });

  it('returns prerelease if no stable exists', () => {
    expect(findLatestStableVersion(['1.0.0-alpha', '2.0.0-beta'])).toBe('2.0.0-beta');
  });

  it('returns latest stable', () => {
    expect(findLatestStableVersion(['1.0.0', '2.0.0', '1.5.0'])).toBe('2.0.0');
  });
});

describe('fixDistTags', () => {
  const versions = {
    '1.0.0': makeManifest('1.0.0'),
    '2.0.0': makeManifest('2.0.0'),
  };

  it('keeps valid tags', () => {
    const tags = { latest: '2.0.0', stable: '1.0.0' };
    const result = fixDistTags(tags, versions);
    expect(result).toEqual({ latest: '2.0.0', stable: '1.0.0' });
  });

  it('removes tags pointing to filtered versions', () => {
    const tags = { latest: '3.0.0', stable: '1.0.0' };
    const result = fixDistTags(tags, versions);
    expect(result.stable).toBe('1.0.0');
    expect(result.latest).toBe('2.0.0'); // Reassigned to latest available
  });

  it('ensures latest tag exists', () => {
    const tags = { beta: '2.0.0' };
    const result = fixDistTags(tags, versions);
    expect(result.latest).toBe('2.0.0');
    expect(result.beta).toBe('2.0.0');
  });

  it('handles empty versions', () => {
    const tags = { latest: '1.0.0' };
    const result = fixDistTags(tags, {});
    expect(result).toEqual({});
  });
});

describe('filterPackageMetadata', () => {
  const createMetadata = (): PackageMetadata => ({
    name: 'test-package',
    versions: {
      '1.0.0': makeManifest('1.0.0'),
      '2.0.0': makeManifest('2.0.0'),
      '3.0.0': makeManifest('3.0.0'),
    },
    'dist-tags': { latest: '3.0.0' },
    time: {
      created: '2023-01-01T00:00:00.000Z',
      modified: '2024-06-01T00:00:00.000Z',
      '1.0.0': '2023-01-01T00:00:00.000Z',
      '2.0.0': '2024-01-15T00:00:00.000Z',
      '3.0.0': '2024-06-01T00:00:00.000Z',
    },
  });

  it('applies global cutoff', () => {
    const metadata = createMetadata();
    const result = filterPackageMetadata(metadata, {
      globalCutoff: new Date('2024-01-01'),
      denylistRules: [],
      allowlistRules: [],
    });
    expect(Object.keys(result.versions)).toEqual(['1.0.0']);
    expect(result['dist-tags'].latest).toBe('1.0.0');
  });

  it('applies version denylist', () => {
    const metadata = createMetadata();
    const result = filterPackageMetadata(metadata, {
      denylistRules: [
        { package: 'test-package', type: 'version', range: '2.0.0' },
      ],
      allowlistRules: [],
    });
    expect(Object.keys(result.versions).sort()).toEqual(['1.0.0', '3.0.0']);
  });

  it('applies per-package date cutoff', () => {
    const metadata = createMetadata();
    const result = filterPackageMetadata(metadata, {
      denylistRules: [
        { package: 'test-package', type: 'date', cutoffDate: new Date('2024-02-01') },
      ],
      allowlistRules: [],
    });
    expect(Object.keys(result.versions).sort()).toEqual(['1.0.0', '2.0.0']);
  });

  it('uses earlier of global and per-package cutoff', () => {
    const metadata = createMetadata();
    const result = filterPackageMetadata(metadata, {
      globalCutoff: new Date('2024-03-01'),
      denylistRules: [
        { package: 'test-package', type: 'date', cutoffDate: new Date('2024-01-01') },
      ],
      allowlistRules: [],
    });
    expect(Object.keys(result.versions)).toEqual(['1.0.0']);
  });

  it('ignores rules for other packages', () => {
    const metadata = createMetadata();
    const result = filterPackageMetadata(metadata, {
      denylistRules: [
        { package: 'other-package', type: 'version', range: '2.0.0' },
      ],
      allowlistRules: [],
    });
    expect(Object.keys(result.versions).sort()).toEqual(['1.0.0', '2.0.0', '3.0.0']);
  });

  it('preserves time metadata for remaining versions', () => {
    const metadata = createMetadata();
    const result = filterPackageMetadata(metadata, {
      globalCutoff: new Date('2024-02-01'),
      denylistRules: [],
      allowlistRules: [],
    });
    expect(result.time).toEqual({
      created: '2023-01-01T00:00:00.000Z',
      modified: '2024-06-01T00:00:00.000Z',
      '1.0.0': '2023-01-01T00:00:00.000Z',
      '2.0.0': '2024-01-15T00:00:00.000Z',
    });
  });

  it('combines date cutoff and version blocking', () => {
    const metadata = createMetadata();
    const result = filterPackageMetadata(metadata, {
      globalCutoff: new Date('2024-06-15'),
      denylistRules: [
        { package: 'test-package', type: 'version', range: '2.0.0' },
      ],
      allowlistRules: [],
    });
    expect(Object.keys(result.versions).sort()).toEqual(['1.0.0', '3.0.0']);
  });

  it('applies version allowlist to bypass date filtering', () => {
    const metadata = createMetadata();
    const result = filterPackageMetadata(metadata, {
      globalCutoff: new Date('2024-01-01'),
      denylistRules: [],
      allowlistRules: [
        { package: 'test-package', range: '3.0.0' },
      ],
    });
    // 1.0.0 is before cutoff, 3.0.0 is explicitly allowed
    expect(Object.keys(result.versions).sort()).toEqual(['1.0.0', '3.0.0']);
  });

  it('allowlist works with per-package date cutoff', () => {
    const metadata = createMetadata();
    const result = filterPackageMetadata(metadata, {
      denylistRules: [
        { package: 'test-package', type: 'date', cutoffDate: new Date('2024-01-01') },
      ],
      allowlistRules: [
        { package: 'test-package', range: '2.0.0' },
      ],
    });
    // 1.0.0 is before cutoff, 2.0.0 is explicitly allowed
    expect(Object.keys(result.versions).sort()).toEqual(['1.0.0', '2.0.0']);
  });

  it('allowlist supports semver caret range', () => {
    const metadata: PackageMetadata = {
      name: 'test-package',
      versions: {
        '1.0.0': makeManifest('1.0.0'),
        '2.0.0': makeManifest('2.0.0'),
        '2.1.0': makeManifest('2.1.0'),
        '3.0.0': makeManifest('3.0.0'),
      },
      'dist-tags': { latest: '3.0.0' },
      time: {
        '1.0.0': '2023-01-01T00:00:00.000Z',
        '2.0.0': '2024-01-15T00:00:00.000Z',
        '2.1.0': '2024-02-15T00:00:00.000Z',
        '3.0.0': '2024-06-01T00:00:00.000Z',
      },
    };
    const result = filterPackageMetadata(metadata, {
      globalCutoff: new Date('2024-01-01'),
      denylistRules: [],
      allowlistRules: [
        { package: 'test-package', range: '^2.0.0' },
      ],
    });
    // 1.0.0 is before cutoff, ^2.0.0 matches 2.0.0 and 2.1.0
    expect(Object.keys(result.versions).sort()).toEqual(['1.0.0', '2.0.0', '2.1.0']);
  });

  it('allowlist supports semver tilde range', () => {
    const metadata: PackageMetadata = {
      name: 'test-package',
      versions: {
        '1.0.0': makeManifest('1.0.0'),
        '2.0.0': makeManifest('2.0.0'),
        '2.0.1': makeManifest('2.0.1'),
        '2.1.0': makeManifest('2.1.0'),
      },
      'dist-tags': { latest: '2.1.0' },
      time: {
        '1.0.0': '2023-01-01T00:00:00.000Z',
        '2.0.0': '2024-01-15T00:00:00.000Z',
        '2.0.1': '2024-02-01T00:00:00.000Z',
        '2.1.0': '2024-06-01T00:00:00.000Z',
      },
    };
    const result = filterPackageMetadata(metadata, {
      globalCutoff: new Date('2024-01-01'),
      denylistRules: [],
      allowlistRules: [
        { package: 'test-package', range: '~2.0.0' },
      ],
    });
    // 1.0.0 is before cutoff, ~2.0.0 matches 2.0.0 and 2.0.1 (same minor)
    expect(Object.keys(result.versions).sort()).toEqual(['1.0.0', '2.0.0', '2.0.1']);
  });

  it('allowlist supports comparison range (>=)', () => {
    const metadata = createMetadata();
    const result = filterPackageMetadata(metadata, {
      globalCutoff: new Date('2024-01-01'),
      denylistRules: [],
      allowlistRules: [
        { package: 'test-package', range: '>=2.0.0' },
      ],
    });
    // 1.0.0 is before cutoff, >=2.0.0 matches 2.0.0 and 3.0.0
    expect(Object.keys(result.versions).sort()).toEqual(['1.0.0', '2.0.0', '3.0.0']);
  });

  it('denylist takes precedence over allowlist', () => {
    const metadata = createMetadata();
    const result = filterPackageMetadata(metadata, {
      globalCutoff: new Date('2024-01-01'),
      denylistRules: [
        { package: 'test-package', type: 'version', range: '3.0.0' },
      ],
      allowlistRules: [
        { package: 'test-package', range: '3.0.0' },
      ],
    });
    // 3.0.0 is allowed but also blocked - block wins
    expect(Object.keys(result.versions)).toEqual(['1.0.0']);
  });

  it('denylist takes precedence over allowlist range', () => {
    const metadata = createMetadata();
    const result = filterPackageMetadata(metadata, {
      globalCutoff: new Date('2024-01-01'),
      denylistRules: [
        { package: 'test-package', type: 'version', range: '3.0.0' },
      ],
      allowlistRules: [
        { package: 'test-package', range: '^2.0.0' },
      ],
    });
    // ^2.0.0 would match 2.0.0 and 3.0.0, but 3.0.0 is blocked
    expect(Object.keys(result.versions).sort()).toEqual(['1.0.0', '2.0.0']);
  });

  it('denylist semver range blocks multiple versions', () => {
    const metadata: PackageMetadata = {
      name: 'test-package',
      versions: {
        '1.0.0': makeManifest('1.0.0'),
        '2.0.0': makeManifest('2.0.0'),
        '2.1.0': makeManifest('2.1.0'),
        '3.0.0': makeManifest('3.0.0'),
      },
      'dist-tags': { latest: '3.0.0' },
      time: {
        '1.0.0': '2023-01-01T00:00:00.000Z',
        '2.0.0': '2023-06-01T00:00:00.000Z',
        '2.1.0': '2023-09-01T00:00:00.000Z',
        '3.0.0': '2024-01-01T00:00:00.000Z',
      },
    };
    const result = filterPackageMetadata(metadata, {
      denylistRules: [
        { package: 'test-package', type: 'version', range: '^2.0.0' },
      ],
      allowlistRules: [],
    });
    // ^2.0.0 blocks 2.0.0 and 2.1.0
    expect(Object.keys(result.versions).sort()).toEqual(['1.0.0', '3.0.0']);
  });

  it('denylist semver range combined with date cutoff', () => {
    const metadata: PackageMetadata = {
      name: 'test-package',
      versions: {
        '1.0.0': makeManifest('1.0.0'),
        '2.0.0': makeManifest('2.0.0'),
        '2.1.0': makeManifest('2.1.0'),
        '3.0.0': makeManifest('3.0.0'),
      },
      'dist-tags': { latest: '3.0.0' },
      time: {
        '1.0.0': '2023-01-01T00:00:00.000Z',
        '2.0.0': '2023-06-01T00:00:00.000Z',
        '2.1.0': '2024-02-01T00:00:00.000Z',
        '3.0.0': '2024-06-01T00:00:00.000Z',
      },
    };
    const result = filterPackageMetadata(metadata, {
      globalCutoff: new Date('2024-01-01'),
      denylistRules: [
        { package: 'test-package', type: 'version', range: '~2.0.0' },
      ],
      allowlistRules: [],
    });
    // Date cutoff removes 2.1.0 and 3.0.0, ~2.0.0 removes 2.0.0
    expect(Object.keys(result.versions)).toEqual(['1.0.0']);
  });

  it('allowlist does not add non-existent versions', () => {
    const metadata = createMetadata();
    const result = filterPackageMetadata(metadata, {
      globalCutoff: new Date('2024-01-01'),
      denylistRules: [],
      allowlistRules: [
        { package: 'test-package', range: '99.0.0' },
      ],
    });
    // Only 1.0.0 remains, 99.0.0 doesn't exist in original
    expect(Object.keys(result.versions)).toEqual(['1.0.0']);
  });

  it('allowlist for other package is ignored', () => {
    const metadata = createMetadata();
    const result = filterPackageMetadata(metadata, {
      globalCutoff: new Date('2024-01-01'),
      denylistRules: [],
      allowlistRules: [
        { package: 'other-package', range: '3.0.0' },
      ],
    });
    // Allowlist is for different package, should not affect test-package
    expect(Object.keys(result.versions)).toEqual(['1.0.0']);
  });

  it('preserves time metadata for allowlisted versions', () => {
    const metadata = createMetadata();
    const result = filterPackageMetadata(metadata, {
      globalCutoff: new Date('2024-01-01'),
      denylistRules: [],
      allowlistRules: [
        { package: 'test-package', range: '3.0.0' },
      ],
    });
    expect(result.time).toEqual({
      created: '2023-01-01T00:00:00.000Z',
      modified: '2024-06-01T00:00:00.000Z',
      '1.0.0': '2023-01-01T00:00:00.000Z',
      '3.0.0': '2024-06-01T00:00:00.000Z',
    });
  });

  it('fixes dist-tags when allowlisted version is latest', () => {
    const metadata = createMetadata();
    const result = filterPackageMetadata(metadata, {
      globalCutoff: new Date('2024-01-01'),
      denylistRules: [],
      allowlistRules: [
        { package: 'test-package', range: '3.0.0' },
      ],
    });
    // Original dist-tags.latest was 3.0.0, which is now allowed
    expect(result['dist-tags'].latest).toBe('3.0.0');
  });
});
