import {
  watchFile as fsWatchFile,
  unwatchFile as fsUnwatchFile,
  existsSync,
  type Stats,
} from 'fs';
import type { Logger } from '@verdaccio/types';

export interface FileWatcherOptions {
  /** Polling interval in milliseconds (default: 2000) */
  pollIntervalMs?: number;
  /** Logger instance */
  logger: Logger;
}

export interface FileWatcher {
  /** Stop watching the file */
  close(): void;
}

/**
 * Watch a file for changes using stat polling.
 *
 * Uses fs.watchFile (stat-based polling) instead of fs.watch (inotify/FSEvents)
 * because inotify events don't propagate across container bind mount boundaries.
 * This is slower but reliable across container mounts.
 */
export function watchFile(
  filePath: string,
  onChange: () => void,
  options: FileWatcherOptions
): FileWatcher {
  const { pollIntervalMs = 2000, logger } = options;

  let isWatching = false;

  const startWatching = () => {
    if (!existsSync(filePath)) {
      logger.warn({ path: filePath }, 'Denylist file does not exist, will retry');
      setTimeout(() => startWatching(), 5000);
      return;
    }

    // fs.watchFile uses stat polling - works across container mounts
    fsWatchFile(filePath, { interval: pollIntervalMs }, (curr: Stats, prev: Stats) => {
      // Check if file was actually modified (mtime changed)
      if (curr.mtimeMs !== prev.mtimeMs) {
        logger.info({ path: filePath }, 'Denylist file changed, reloading');
        onChange();
      }
    });

    isWatching = true;
    logger.info(
      { path: filePath, pollIntervalMs },
      'Watching denylist file for changes (polling mode)'
    );
  };

  startWatching();

  return {
    close() {
      if (isWatching) {
        fsUnwatchFile(filePath);
        isWatching = false;
      }
    },
  };
}
