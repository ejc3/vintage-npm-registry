
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
}

/**
 * A rule to block a specific version
 */
export interface VersionDenylistRule {
  /** Package name (e.g., "lodash" or "@babel/core") */
  package: string;
  type: 'version';
  /** Specific version to block */
  version: string;
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
 * A rule parsed from the denylist file
 */
export type DenylistRule = VersionDenylistRule | DateDenylistRule;

/**
 * A rule to explicitly allow a specific version (bypasses date filtering)
 * Parsed from allowlist.txt file
 */
export interface AllowlistRule {
  /** Package name (e.g., "lodash" or "@babel/core") */
  package: string;
  /** Specific version to allow */
  version: string;
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
