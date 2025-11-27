import { describe, it, expect } from 'vitest';
import {
  getEarliestCutoff,
  filterVersionsByDate,
  removeBlockedVersions,
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
    '3.0.0': makeManifest('3.0.0'),
  };

  it('removes blocked versions', () => {
    const blocked = new Set(['2.0.0']);
    const result = removeBlockedVersions(versions, blocked);
    expect(Object.keys(result).sort()).toEqual(['1.0.0', '3.0.0']);
  });

  it('removes multiple blocked versions', () => {
    const blocked = new Set(['1.0.0', '3.0.0']);
    const result = removeBlockedVersions(versions, blocked);
    expect(Object.keys(result)).toEqual(['2.0.0']);
  });

  it('handles empty blocked set', () => {
    const blocked = new Set<string>();
    const result = removeBlockedVersions(versions, blocked);
    expect(Object.keys(result).sort()).toEqual(['1.0.0', '2.0.0', '3.0.0']);
  });

  it('handles non-existent blocked version', () => {
    const blocked = new Set(['4.0.0']);
    const result = removeBlockedVersions(versions, blocked);
    expect(Object.keys(result).sort()).toEqual(['1.0.0', '2.0.0', '3.0.0']);
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
    });
    expect(Object.keys(result.versions)).toEqual(['1.0.0']);
    expect(result['dist-tags'].latest).toBe('1.0.0');
  });

  it('applies version denylist', () => {
    const metadata = createMetadata();
    const result = filterPackageMetadata(metadata, {
      denylistRules: [
        { package: 'test-package', type: 'version', version: '2.0.0' },
      ],
    });
    expect(Object.keys(result.versions).sort()).toEqual(['1.0.0', '3.0.0']);
  });

  it('applies per-package date cutoff', () => {
    const metadata = createMetadata();
    const result = filterPackageMetadata(metadata, {
      denylistRules: [
        { package: 'test-package', type: 'date', cutoffDate: new Date('2024-02-01') },
      ],
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
    });
    expect(Object.keys(result.versions)).toEqual(['1.0.0']);
  });

  it('ignores rules for other packages', () => {
    const metadata = createMetadata();
    const result = filterPackageMetadata(metadata, {
      denylistRules: [
        { package: 'other-package', type: 'version', version: '2.0.0' },
      ],
    });
    expect(Object.keys(result.versions).sort()).toEqual(['1.0.0', '2.0.0', '3.0.0']);
  });

  it('preserves time metadata for remaining versions', () => {
    const metadata = createMetadata();
    const result = filterPackageMetadata(metadata, {
      globalCutoff: new Date('2024-02-01'),
      denylistRules: [],
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
        { package: 'test-package', type: 'version', version: '2.0.0' },
      ],
    });
    expect(Object.keys(result.versions).sort()).toEqual(['1.0.0', '3.0.0']);
  });
});
