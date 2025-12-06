
/**
 * Plugin configuration from Verdaccio config.yaml
 */
export interface VintagePluginConfig {
  /** Global cutoff date - hide ALL versions published after this ISO 8601 date */
  global_cutoff?: string;

  /** Path to denylist file */
  denylist_file?: string;

  /** Watch denylist file for changes (default: true) */
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
 * A rule to explicitly allow a specific version (bypasses date filtering)
 */
export interface AllowlistVersionRule {
  /** Package name (e.g., "lodash" or "@babel/core") */
  package: string;
  type: 'allowlist';
  /** Specific version to allow */
  version: string;
}

/**
 * A rule parsed from the denylist file
 */
export type DenylistRule = VersionDenylistRule | DateDenylistRule | AllowlistVersionRule;

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
