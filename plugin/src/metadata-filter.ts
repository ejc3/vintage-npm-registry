import semver from 'semver';
import type { DenylistRule, AllowlistRule, PackageMetadata, VersionManifest } from './types';

/**
 * Get the earliest (most restrictive) cutoff date from two optional dates
 */
export function getEarliestCutoff(
  globalCutoff: Date | undefined,
  packageCutoff: Date | undefined
): Date | undefined {
  if (!globalCutoff && !packageCutoff) {
    return undefined;
  }
  if (!globalCutoff) {
    return packageCutoff;
  }
  if (!packageCutoff) {
    return globalCutoff;
  }
  return globalCutoff < packageCutoff ? globalCutoff : packageCutoff;
}

/**
 * Filter versions by cutoff date
 * Returns versions published on or before the cutoff
 */
export function filterVersionsByDate(
  versions: Record<string, VersionManifest>,
  time: Record<string, string> | undefined,
  cutoff: Date
): Record<string, VersionManifest> {
  const filtered: Record<string, VersionManifest> = {};

  for (const [version, manifest] of Object.entries(versions)) {
    const publishDateStr = time?.[version];

    // If no publish date available, keep the version (fail-open)
    if (!publishDateStr) {
      filtered[version] = manifest;
      continue;
    }

    const publishDate = new Date(publishDateStr);

    // If date is invalid, keep the version (fail-open)
    if (isNaN(publishDate.getTime())) {
      filtered[version] = manifest;
      continue;
    }

    // Keep versions published on or before the cutoff
    if (publishDate <= cutoff) {
      filtered[version] = manifest;
    }
  }

  return filtered;
}

/**
 * Remove blocked versions matching semver ranges
 */
export function removeBlockedVersions(
  versions: Record<string, VersionManifest>,
  blockedRanges: string[]
): Record<string, VersionManifest> {
  if (blockedRanges.length === 0) {
    return versions;
  }

  const filtered: Record<string, VersionManifest> = {};

  for (const [version, manifest] of Object.entries(versions)) {
    // Check if this version matches any blocked range
    const isBlocked = blockedRanges.some((range) => semver.satisfies(version, range));
    if (!isBlocked) {
      filtered[version] = manifest;
    }
  }

  return filtered;
}

/**
 * Add explicitly allowed versions back (from original metadata)
 * This allows specific versions or ranges to bypass date filtering
 * Supports semver ranges like ^4.17.0, ~4.17.0, >=4.17.20
 */
export function addAllowedVersions(
  filteredVersions: Record<string, VersionManifest>,
  originalVersions: Record<string, VersionManifest>,
  allowlistRules: AllowlistRule[]
): Record<string, VersionManifest> {
  if (allowlistRules.length === 0) {
    return filteredVersions;
  }

  const result = { ...filteredVersions };

  // Check each original version against allowlist rules
  for (const [version, manifest] of Object.entries(originalVersions)) {
    // Skip if already in result
    if (result[version]) {
      continue;
    }

    // Check if this version matches any allowlist rule
    for (const rule of allowlistRules) {
      if (semver.satisfies(version, rule.range)) {
        result[version] = manifest;
        break; // Version matched, no need to check more rules
      }
    }
  }

  return result;
}

/**
 * Find the latest version from a list of versions using semver
 */
export function findLatestVersion(versions: string[]): string | undefined {
  if (versions.length === 0) {
    return undefined;
  }

  // Filter to valid semver versions and sort
  const validVersions = versions.filter((v) => semver.valid(v));

  if (validVersions.length === 0) {
    // Fallback to string sort if no valid semver
    return versions.sort().pop();
  }

  return validVersions.sort(semver.compare).pop();
}

/**
 * Find the latest non-prerelease version, falling back to latest prerelease
 */
export function findLatestStableVersion(versions: string[]): string | undefined {
  if (versions.length === 0) {
    return undefined;
  }

  // Separate stable and prerelease versions
  const stable = versions.filter((v) => {
    const parsed = semver.parse(v);
    return parsed && parsed.prerelease.length === 0;
  });

  // Prefer stable versions
  if (stable.length > 0) {
    return findLatestVersion(stable);
  }

  // Fall back to any version
  return findLatestVersion(versions);
}

/**
 * Fix dist-tags to only reference versions that exist
 * If a tag points to a filtered version, reassign to latest available
 */
export function fixDistTags(
  distTags: Record<string, string>,
  availableVersions: Record<string, VersionManifest>
): Record<string, string> {
  const fixed: Record<string, string> = {};
  const versionList = Object.keys(availableVersions);

  if (versionList.length === 0) {
    return fixed;
  }

  for (const [tag, version] of Object.entries(distTags)) {
    if (availableVersions[version]) {
      // Tag still points to valid version
      fixed[tag] = version;
    }
    // Don't reassign removed tags - they'll be handled below
  }

  // Ensure 'latest' tag exists and points to a valid version
  if (!fixed['latest']) {
    const latest = findLatestStableVersion(versionList);
    if (latest) {
      fixed['latest'] = latest;
    }
  }

  return fixed;
}

export interface FilterOptions {
  globalCutoff?: Date;
  denylistRules: DenylistRule[];
  allowlistRules: AllowlistRule[];
}

/**
 * Apply all filtering rules to package metadata
 */
export function filterPackageMetadata(
  metadata: PackageMetadata,
  options: FilterOptions
): PackageMetadata {
  const { globalCutoff, denylistRules, allowlistRules } = options;

  // Get denylist rules for this specific package
  const packageDenylistRules = denylistRules.filter((r) => r.package === metadata.name);

  // Collect blocked version ranges from denylist
  const blockedRanges = packageDenylistRules
    .filter((r): r is DenylistRule & { type: 'version' } => r.type === 'version')
    .map((r) => r.range);

  // Collect allowlist rules for this package (supports semver ranges)
  const packageAllowlistRules = allowlistRules.filter((r) => r.package === metadata.name);

  // Find per-package date cutoff (use earliest if multiple)
  let packageDateCutoff: Date | undefined;
  for (const rule of packageDenylistRules) {
    if (rule.type === 'date') {
      if (!packageDateCutoff || rule.cutoffDate < packageDateCutoff) {
        packageDateCutoff = rule.cutoffDate;
      }
    }
  }

  // Effective cutoff is earliest of global and per-package
  const effectiveCutoff = getEarliestCutoff(globalCutoff, packageDateCutoff);

  // Start with all versions
  let filteredVersions = { ...metadata.versions };

  // Apply date cutoff
  if (effectiveCutoff) {
    filteredVersions = filterVersionsByDate(
      filteredVersions,
      metadata.time,
      effectiveCutoff
    );
  }

  // Add back explicitly allowed versions (bypass date filtering)
  if (packageAllowlistRules.length > 0) {
    filteredVersions = addAllowedVersions(
      filteredVersions,
      metadata.versions,
      packageAllowlistRules
    );
  }

  // Remove explicitly blocked versions (takes precedence over allowlist)
  if (blockedRanges.length > 0) {
    filteredVersions = removeBlockedVersions(filteredVersions, blockedRanges);
  }

  // Fix dist-tags
  const fixedDistTags = fixDistTags(metadata['dist-tags'], filteredVersions);

  // Build filtered time object (only keep times for remaining versions)
  const filteredTime: Record<string, string> = {};
  if (metadata.time) {
    // Keep metadata-level timestamps
    if (metadata.time['created']) {
      filteredTime['created'] = metadata.time['created'];
    }
    if (metadata.time['modified']) {
      filteredTime['modified'] = metadata.time['modified'];
    }
    // Keep version timestamps for remaining versions
    for (const version of Object.keys(filteredVersions)) {
      if (metadata.time[version]) {
        filteredTime[version] = metadata.time[version];
      }
    }
  }

  return {
    ...metadata,
    versions: filteredVersions,
    'dist-tags': fixedDistTags,
    time: filteredTime,
  };
}
