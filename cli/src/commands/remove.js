import { resolve, join } from 'node:path';
import { unlink, rmdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { log } from '../lib/logger.js';
import { readManifest } from '../lib/manifest.js';

const PRESERVE = [
  '.claude/CLAUDE.md',
];

const PRESERVE_DIRS = [
  'docs/',
];

export async function removeCommand(path) {
  const targetDir = resolve(path);
  const manifest = await readManifest(targetDir);

  if (!manifest) {
    log.fail('No manifest found. Nothing to remove.');
    process.exit(1);
  }

  log.info('Removing claude-devkit files...');
  log.blank();

  // Remove tracked files (except preserved)
  for (const file of Object.keys(manifest.files)) {
    const fullPath = join(targetDir, file);

    // Check if preserved
    if (PRESERVE.includes(file)) {
      log.keep(file);
      continue;
    }

    // Check if in preserved directory
    if (PRESERVE_DIRS.some((dir) => file.startsWith(dir))) {
      log.keep(file);
      continue;
    }

    if (existsSync(fullPath)) {
      await unlink(fullPath);
      log.del(file);
    }
  }

  // Remove manifest itself
  const manifestPath = join(targetDir, '.claude/.devkit-manifest.json');
  if (existsSync(manifestPath)) {
    await unlink(manifestPath);
    log.del('.claude/.devkit-manifest.json');
  }

  // Clean up empty directories
  const dirsToClean = [
    '.claude/hooks',
    '.claude/commands',
    'scripts',
  ];

  for (const dir of dirsToClean) {
    const fullPath = join(targetDir, dir);
    try {
      await rmdir(fullPath);
    } catch {
      // Not empty or doesn't exist
    }
  }

  log.blank();
  log.pass('Removed. CLAUDE.md and docs/ preserved.');
}
