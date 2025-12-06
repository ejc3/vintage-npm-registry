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
 * Remove specific blocked versions
 */
export function removeBlockedVersions(
  versions: Record<string, VersionManifest>,
  blockedVersions: Set<string>
): Record<string, VersionManifest> {
  const filtered: Record<string, VersionManifest> = {};

  for (const [version, manifest] of Object.entries(versions)) {
    if (!blockedVersions.has(version)) {
      filtered[version] = manifest;
    }
  }

  return filtered;
}

/**
 * Add explicitly allowed versions back (from original metadata)
 * This allows specific versions to bypass date filtering
 */
export function addAllowedVersions(
  filteredVersions: Record<string, VersionManifest>,
  originalVersions: Record<string, VersionManifest>,
  allowedVersions: Set<string>
): Record<string, VersionManifest> {
  const result = { ...filteredVersions };

  for (const version of allowedVersions) {
    // Only add if the version exists in the original metadata
    if (originalVersions[version] && !result[version]) {
      result[version] = originalVersions[version];
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

  // Collect blocked versions from denylist
  const blockedVersions = new Set(
    packageDenylistRules
      .filter((r): r is DenylistRule & { type: 'version' } => r.type === 'version')
      .map((r) => r.version)
  );

  // Collect allowed versions from allowlist (bypass date filtering)
  const allowedVersions = new Set(
    allowlistRules
      .filter((r) => r.package === metadata.name)
      .map((r) => r.version)
  );

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
  if (allowedVersions.size > 0) {
    filteredVersions = addAllowedVersions(
      filteredVersions,
      metadata.versions,
      allowedVersions
    );
  }

  // Remove explicitly blocked versions (takes precedence over allowlist)
  if (blockedVersions.size > 0) {
    filteredVersions = removeBlockedVersions(filteredVersions, blockedVersions);
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
