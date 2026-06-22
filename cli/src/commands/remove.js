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
  log.info('Removing global agentpipe install...');
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

  // Legacy cleanup: older installs shipped ~/.claude/scripts/build-test.sh.
  // The script is no longer part of the kit — sweep up the orphan if present.
  const legacyScript = join(homedir(), '.claude', 'scripts', 'build-test.sh');
  if (existsSync(legacyScript)) {
    await unlink(legacyScript);
    log.del('~/.claude/scripts/build-test.sh (legacy)');
    try {
      await rmdir(join(homedir(), '.claude', 'scripts'));
    } catch { /* keep dir if user has other scripts in it */ }
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
  log.info('Run `agentpipe init` in each project to restore per-project hooks.');
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

  log.info('Removing agentpipe files...');
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
    'scripts', // legacy: older installs placed build-test.sh here
  ];

  for (const dir of dirsToClean) {
    const fullPath = join(targetDir, dir);
    try {
      await rmdir(fullPath);
    } catch {
      // Not empty or doesn't exist
    }
  }

  // Remove only skill dirs that were tracked in the manifest
  // (preserves any custom skills the user added outside of devkit)
  const trackedSkillDirs = new Set();
  for (const file of Object.keys(manifest.files)) {
    const match = file.match(/^\.claude\/skills\/([^/]+)\//);
    if (match) trackedSkillDirs.add(match[1]);
  }

  for (const skillName of trackedSkillDirs) {
    const skillDir = join(targetDir, '.claude', 'skills', skillName);
    if (existsSync(skillDir)) {
      await rm(skillDir, { recursive: true, force: true });
      log.del(`.claude/skills/${skillName}/`);
    }
  }

  // Remove skills dir itself only if now empty
  const skillsDir = join(targetDir, '.claude/skills');
  if (existsSync(skillsDir)) {
    try {
      await rmdir(skillsDir);
    } catch {
      // Not empty — user has custom skills, leave it
    }
  }

  log.blank();
  log.pass('Removed. CLAUDE.md and docs/ preserved.');
}
