import { resolve, join, dirname } from 'node:path';
import { unlink, rmdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { log } from '../lib/logger.js';
import { readManifest, MANIFEST_FILE, LEGACY_MANIFEST_FILE } from '../lib/manifest.js';
import { removeGlobalHooksFromSettings, stripAgentsMdGuards } from '../lib/installer.js';

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

  const removedDirs = new Set();

  // Remove tracked files (except preserved), across every agent's layout.
  for (const file of Object.keys(manifest.files)) {
    if (PRESERVE.includes(file) || PRESERVE_DIRS.some((dir) => file.startsWith(dir))) {
      log.keep(file);
      continue;
    }
    const fullPath = join(targetDir, file);
    if (existsSync(fullPath)) {
      await unlink(fullPath);
      log.del(file);
      // Track ancestor dirs (within the project) for empty-dir cleanup.
      let d = dirname(file);
      while (d && d !== '.' && d !== '/') { removedDirs.add(d); d = dirname(d); }
    }
  }

  // Remove the manifest (new + legacy locations).
  for (const rel of [MANIFEST_FILE, LEGACY_MANIFEST_FILE]) {
    const p = join(targetDir, rel);
    if (existsSync(p)) {
      await unlink(p);
      log.del(rel);
      let d = dirname(rel);
      while (d && d !== '.' && d !== '/') { removedDirs.add(d); d = dirname(d); }
    }
  }

  // Codex guards live as a section in a shared AGENTS.md — strip just that section.
  if (manifest.agentsMdGuards) {
    if (await stripAgentsMdGuards(targetDir)) log.del('AGENTS.md (agentpipe guards section)');
  }

  // Legacy: older installs placed build-test.sh under scripts/.
  removedDirs.add('scripts');

  // Remove now-empty directories, deepest first (preserves dirs with user content).
  for (const dir of [...removedDirs].sort((a, b) => b.split('/').length - a.split('/').length)) {
    try { await rmdir(join(targetDir, dir)); } catch { /* not empty or missing */ }
  }

  log.blank();
  log.pass('Removed. CLAUDE.md and docs/ preserved.');
}
