import { resolve, join } from 'node:path';
import { unlink, rmdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { log } from '../lib/logger.js';
import { readManifest } from '../lib/manifest.js';
import { removeGlobalHooksFromSettings } from '../lib/installer.js';

const PRESERVE = [
  '.claude/CLAUDE.md',
];

const PRESERVE_DIRS = [
  'docs/',
];

export async function removeGlobal() {
  log.info('Removing global claude-devkit install...');
  log.blank();

  // Remove ~/.claude/skills/
  const globalSkillsDir = join(homedir(), '.claude', 'skills');
  if (existsSync(globalSkillsDir)) {
    await rm(globalSkillsDir, { recursive: true, force: true });
    log.del('~/.claude/skills/');
  } else {
    log.skip('~/.claude/skills/ (not found)');
  }

  // Remove ~/.claude/hooks/
  const globalHooksDir = join(homedir(), '.claude', 'hooks');
  if (existsSync(globalHooksDir)) {
    await rm(globalHooksDir, { recursive: true, force: true });
    log.del('~/.claude/hooks/');
  } else {
    log.skip('~/.claude/hooks/ (not found)');
  }

  // Remove devkit hook entries from ~/.claude/settings.json
  await removeGlobalHooksFromSettings();
  log.del('hook entries from ~/.claude/settings.json');

  // Remove global manifest
  const globalManifest = join(homedir(), '.claude', '.devkit-manifest.json');
  if (existsSync(globalManifest)) {
    await unlink(globalManifest);
    log.del('~/.claude/.devkit-manifest.json');
  }

  log.blank();
  log.pass('Global install removed. Per-project installs are unaffected.');
  log.info('Run `claude-devkit init` in each project to restore per-project hooks.');
}

export async function removeCommand(path, opts = {}) {
  if (opts.global) {
    await removeGlobal();
    return;
  }

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

  // Skills are nested dirs — use recursive rm
  const skillsDir = join(targetDir, '.claude/skills');
  if (existsSync(skillsDir)) {
    await rm(skillsDir, { recursive: true, force: true });
    log.del('.claude/skills/');
  }

  log.blank();
  log.pass('Removed. CLAUDE.md and docs/ preserved.');
}
