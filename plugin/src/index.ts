import type {
  IPluginStorageFilter,
  Config,
  Logger,
  Package,
} from '@verdaccio/types';
import type { VintagePluginConfig, DenylistRule, AllowlistRule, PackageMetadata } from './types';
import { parseDenylistFile, DenylistFileNotFoundError } from './denylist-parser';
import { parseAllowlistFile, AllowlistFileNotFoundError } from './allowlist-parser';
import { filterPackageMetadata } from './metadata-filter';
import { watchFile, type FileWatcher } from './file-watcher';

/**
 * Verdaccio filter plugin that acts as a "time machine" for npm packages.
 * Hides versions published after a cutoff date and/or blocks specific versions.
 */
export default class VintagePlugin implements IPluginStorageFilter<VintagePluginConfig> {
  private readonly config: VintagePluginConfig;
  private readonly logger: Logger;
  private globalCutoff: Date | undefined;
  private denylistRules: DenylistRule[] = [];
  private allowlistRules: AllowlistRule[] = [];
  private denylistWatcher: FileWatcher | null = null;
  private allowlistWatcher: FileWatcher | null = null;

  constructor(config: VintagePluginConfig, options: { config: Config; logger: Logger }) {
    this.config = config;
    this.logger = options.logger;

    // Parse global cutoff date
    if (config.global_cutoff) {
      const cutoff = new Date(config.global_cutoff);
      if (isNaN(cutoff.getTime())) {
        throw new Error(`Invalid global_cutoff date: ${config.global_cutoff}`);
      }
      this.globalCutoff = cutoff;
      this.logger.info(
        { cutoff: cutoff.toISOString() },
        'Global cutoff date configured'
      );
    }

    // Load denylist file
    if (config.denylist_file) {
      this.loadDenylist();

      // Setup file watcher for hot reload
      if (config.watch_denylist !== false) {
        this.denylistWatcher = watchFile(
          config.denylist_file,
          () => this.loadDenylist(),
          { logger: this.logger }
        );
      }
    }

    // Load allowlist file
    if (config.allowlist_file) {
      this.loadAllowlist();

      // Setup file watcher for hot reload
      if (config.watch_denylist !== false) {
        this.allowlistWatcher = watchFile(
          config.allowlist_file,
          () => this.loadAllowlist(),
          { logger: this.logger }
        );
      }
    }

    this.logger.info('Vintage plugin initialized');
  }

  /**
   * Load or reload the denylist file
   */
  private loadDenylist(): void {
    if (!this.config.denylist_file) {
      return;
    }

    try {
      const result = parseDenylistFile(this.config.denylist_file);

      // Log any parse errors
      for (const error of result.errors) {
        this.logger.warn(
          { line: error.line, content: error.content },
          'Invalid denylist entry, skipping'
        );
      }

      this.denylistRules = result.rules;
      this.logger.info(
        {
          path: this.config.denylist_file,
          ruleCount: result.rules.length,
          errorCount: result.errors.length,
        },
        'Denylist loaded'
      );
    } catch (error) {
      if (error instanceof DenylistFileNotFoundError) {
        this.logger.error(
          { path: this.config.denylist_file },
          error.message
        );
        throw error;
      } else {
        this.logger.error(
          { error, path: this.config.denylist_file },
          'Failed to load denylist file, keeping previous rules'
        );
      }
    }
  }

  /**
   * Load or reload the allowlist file
   */
  private loadAllowlist(): void {
    if (!this.config.allowlist_file) {
      return;
    }

    try {
      const result = parseAllowlistFile(this.config.allowlist_file);

      // Log any parse errors
      for (const error of result.errors) {
        this.logger.warn(
          { line: error.line, content: error.content },
          'Invalid allowlist entry, skipping'
        );
      }

      this.allowlistRules = result.rules;
      this.logger.info(
        {
          path: this.config.allowlist_file,
          ruleCount: result.rules.length,
          errorCount: result.errors.length,
        },
        'Allowlist loaded'
      );
    } catch (error) {
      if (error instanceof AllowlistFileNotFoundError) {
        this.logger.error(
          { path: this.config.allowlist_file },
          error.message
        );
        throw error;
      } else {
        this.logger.error(
          { error, path: this.config.allowlist_file },
          'Failed to load allowlist file, keeping previous rules'
        );
      }
    }
  }

  /**
   * Filter package metadata before it's returned to the client.
   * This is the main entry point called by Verdaccio.
   */
  async filter_metadata(metadata: Package): Promise<Package> {
    const packageName = metadata.name;

    // Check if we have any filtering to do
    if (!this.globalCutoff && this.denylistRules.length === 0 && this.allowlistRules.length === 0) {
      return metadata;
    }

    const originalVersionCount = Object.keys(metadata.versions || {}).length;

    // Apply filtering
    const filtered = filterPackageMetadata(
      metadata as unknown as PackageMetadata,
      {
        globalCutoff: this.globalCutoff,
        denylistRules: this.denylistRules,
        allowlistRules: this.allowlistRules,
      }
    );

    const filteredVersionCount = Object.keys(filtered.versions).length;
    const removedCount = originalVersionCount - filteredVersionCount;

    // Log if we filtered anything
    if (removedCount > 0) {
      this.logger.debug(
        {
          package: packageName,
          original: originalVersionCount,
          remaining: filteredVersionCount,
          removed: removedCount,
        },
        'Filtered package versions'
      );
    }

    // If all versions were filtered, throw an error (Verdaccio returns 404)
    if (filteredVersionCount === 0) {
      this.logger.warn(
        { package: packageName },
        'All versions filtered, package unavailable'
      );
      throw new Error(`All versions of ${packageName} are filtered by vintage plugin`);
    }

    return filtered as unknown as Package;
  }
}
