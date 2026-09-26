
/**
 * Plugin configuration from Verdaccio config.yaml
 */
export interface VintagePluginConfig {
  /** Global cutoff date - hide ALL versions published after this ISO 8601 date */
  global_cutoff?: string;

  /** Path to denylist file */
  denylist_file?: string;

  /** Path to allowlist file (versions that bypass date filtering) */
  allowlist_file?: string;

  /** Watch denylist/allowlist files for changes (default: true) */
  watch_denylist?: boolean;

  /** Enable CVE vulnerability filtering (default: false) */
  cve_filter?: boolean;

  /** Path to CVE denylist file (optional, uses built-in if not specified) */
  cve_file?: string;
}

/**
 * A rule to block a specific version or semver range
 */
export interface VersionDenylistRule {
  /** Package name (e.g., "lodash" or "@babel/core") */
  package: string;
  type: 'version';
  /** Version or semver range to block (e.g., "4.17.20", "^4.17.0", ">=4.17.20") */
  range: string;
}

/**
 * A rule to block versions after a date
 */
export interface DateDenylistRule {
  /** Package name (e.g., "lodash" or "@babel/core") */
  package: string;
  type: 'date';
  /** Cutoff date for this package */
  cutoffDate: Date;
}

/**
 * A rule to block vulnerable package versions based on CVEs
 */
export interface CVEVulnerabilityRule {
  /** Package name (e.g., "lodash" or "@babel/core") */
  package: string;
  type: 'cve';
  /** Version or semver range with vulnerability (e.g., "4.17.4", "<4.17.21") */
  vulnerableRange: string;
  /** CVE identifier (e.g., "CVE-2018-3721") */
  cveId: string;
  /** Severity level (low, medium, high, critical) */
  severity: string;
}

/**
 * A rule parsed from the denylist file
 */
export type DenylistRule = VersionDenylistRule | DateDenylistRule | CVEVulnerabilityRule;

/**
 * A rule to explicitly allow a specific version or range (bypasses date filtering)
 * Parsed from allowlist.txt file
 */
export interface AllowlistRule {
  /** Package name (e.g., "lodash" or "@babel/core") */
  package: string;
  /** Version or semver range to allow (e.g., "4.17.21", "^4.17.0", ">=4.17.20") */
  range: string;
}

/**
 * Simplified package metadata types (subset of @verdaccio/types Package)
 */
export interface VersionManifest {
  name: string;
  version: string;
  [key: string]: unknown;
}

export interface PackageMetadata {
  name: string;
  versions: Record<string, VersionManifest>;
  'dist-tags': Record<string, string>;
  time?: Record<string, string>;
  [key: string]: unknown;
}
