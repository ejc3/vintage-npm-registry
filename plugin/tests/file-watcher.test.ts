import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { watchFile } from '../src/file-watcher';
import * as fs from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { writeFileSync, unlinkSync, mkdtempSync, rmdirSync } from 'fs';

// Mock logger
const createMockLogger = () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  fatal: vi.fn(),
  child: vi.fn(),
});

describe('watchFile', () => {
  let tempDir: string;
  let testFilePath: string;
  let mockLogger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'vintage-test-'));
    testFilePath = join(tempDir, 'test-denylist.txt');
    mockLogger = createMockLogger();
  });

  afterEach(() => {
    try {
      unlinkSync(testFilePath);
    } catch {
      // File may not exist
    }
    try {
      rmdirSync(tempDir);
    } catch {
      // Dir may not be empty or not exist
    }
  });

  it('logs info when starting to watch existing file', () => {
    writeFileSync(testFilePath, 'initial content');

    const watcher = watchFile(testFilePath, vi.fn(), {
      logger: mockLogger as any,
      pollIntervalMs: 100,
    });

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ path: testFilePath, pollIntervalMs: 100 }),
      'Watching denylist file for changes (polling mode)'
    );

    watcher.close();
  });

  it('logs warning when file does not exist', async () => {
    const nonExistentPath = join(tempDir, 'does-not-exist.txt');

    const watcher = watchFile(nonExistentPath, vi.fn(), {
      logger: mockLogger as any,
      pollIntervalMs: 100,
    });

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ path: nonExistentPath }),
      'Denylist file does not exist, will retry'
    );

    watcher.close();
  });

  it('calls onChange when file is modified', async () => {
    writeFileSync(testFilePath, 'initial content');
    const onChange = vi.fn();

    const watcher = watchFile(testFilePath, onChange, {
      logger: mockLogger as any,
      pollIntervalMs: 100,
    });

    // Wait for watcher to start
    await new Promise((r) => setTimeout(r, 50));

    // Modify the file
    writeFileSync(testFilePath, 'modified content');

    // Wait for polling to detect change
    await new Promise((r) => setTimeout(r, 250));

    expect(onChange).toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ path: testFilePath }),
      'Denylist file changed, reloading'
    );

    watcher.close();
  });

  it('does not call onChange when file is unchanged', async () => {
    writeFileSync(testFilePath, 'initial content');
    const onChange = vi.fn();

    const watcher = watchFile(testFilePath, onChange, {
      logger: mockLogger as any,
      pollIntervalMs: 100,
    });

    // Wait for multiple poll cycles
    await new Promise((r) => setTimeout(r, 350));

    expect(onChange).not.toHaveBeenCalled();

    watcher.close();
  });

  it('close() stops watching', async () => {
    writeFileSync(testFilePath, 'initial content');
    const onChange = vi.fn();

    const watcher = watchFile(testFilePath, onChange, {
      logger: mockLogger as any,
      pollIntervalMs: 100,
    });

    // Close immediately
    watcher.close();

    // Modify the file
    await new Promise((r) => setTimeout(r, 50));
    writeFileSync(testFilePath, 'modified content');

    // Wait for what would have been polling
    await new Promise((r) => setTimeout(r, 250));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('uses default poll interval when not specified', () => {
    writeFileSync(testFilePath, 'initial content');

    const watcher = watchFile(testFilePath, vi.fn(), {
      logger: mockLogger as any,
    });

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ pollIntervalMs: 2000 }),
      expect.any(String)
    );

    watcher.close();
  });
});
