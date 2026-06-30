import { copyFile as fsCopyFile, mkdir, readFile, writeFile, chmod } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { log } from './logger.js';
import { getTemplateDir } from './installer.js';
import { emitSkillFileGlobal } from './agents.js';
import { buildHookConfig } from './hooks.js';
import { hashContent } from './hasher.js';

// Global install. Skills install per-agent via installSkillGlobalForAgent (below);
// hooks + settings stay Claude-only (Claude Code's native enforcement engine).

/** Global hooks directory: ~/.claude/hooks/ */
export function getGlobalHooksDir() {
  return join(homedir(), '.claude', 'hooks');
}

/**
 * Copy one guard script (kit-relative src, e.g. 'hooks/specpipe-shell-guard.sh') into
 * the global ~/.claude/hooks/ dir. `key` is the home-relative manifest key.
 * @returns {{ result: 'copied'|'skipped'|'identical', kitHash: string }}
 */
export async function installHookGlobal(srcRel, globalHooksDir, { force = false, globalFiles = {}, key } = {}) {
  const base = srcRel.split('/').pop();
  const src = join(getTemplateDir(), srcRel);
  const dst = join(globalHooksDir, base);

  const { hashFile } = await import('./hasher.js');
  const srcHash = await hashFile(src);

  if (existsSync(dst) && !force) {
    try {
      const dstHash = await hashFile(dst);
      if (srcHash === dstHash) {
        log.same(`~/.claude/hooks/${base} (identical)`);
        return { result: 'identical', kitHash: srcHash };
      }
      // Overwrite only when the on-disk file is one WE wrote (matches the kit hash
      // recorded in the manifest) — i.e. a stale specpipe version, safe to update.
      // Otherwise the user changed it (or we never tracked it) → preserve.
      const savedKitHash = globalFiles[key]?.kitHash;
      if (!(savedKitHash && dstHash === savedKitHash)) {
        log.skip(`~/.claude/hooks/${base} (customized — use --force to overwrite)`);
        return { result: 'skipped', kitHash: srcHash };
      }
    } catch { /* hash failed */ }
  }

  await mkdir(dirname(dst), { recursive: true });
  await fsCopyFile(src, dst);
  await chmod(dst, 0o755);
  log.copy(`~/.claude/hooks/${base}`);
  return { result: 'copied', kitHash: srcHash };
}

/** Claude settings.json hook entries pointing to the absolute global hooks dir. */
function buildGlobalHookEntries(globalHooksDir, hooksSet) {
  // Forward slashes — bash needs them on every host (WSL, Git Bash, macOS, Linux).
  const dir = globalHooksDir.replace(/\\/g, '/');
  return buildHookConfig('claude', dir, hooksSet)?.hooks || {};
}

function isDevkitHookCommand(command) {
  return command.includes('/.claude/hooks/');
}

function stripDevkitHooks(existingHooks) {
  if (!existingHooks || typeof existingHooks !== 'object') return {};
  const result = {};
  for (const [event, matchers] of Object.entries(existingHooks)) {
    if (!Array.isArray(matchers)) continue;
    const kept = [];
    for (const group of matchers) {
      const keptHooks = (group.hooks || []).filter((h) => !isDevkitHookCommand(h.command || ''));
      if (keptHooks.length > 0) kept.push({ ...group, hooks: keptHooks });
    }
    if (kept.length > 0) result[event] = kept;
  }
  return result;
}

/**
 * Merge devkit hook registrations into ~/.claude/settings.json.
 * Preserves any existing non-devkit hooks the user may have.
 */
export async function mergeGlobalSettings(globalHooksDir, hooksSet = null) {
  const settingsPath = join(homedir(), '.claude', 'settings.json');
  let existing = {};
  try {
    existing = JSON.parse(await readFile(settingsPath, 'utf-8'));
  } catch { /* file doesn't exist yet — start fresh */ }

  const cleanedHooks = stripDevkitHooks(existing.hooks);
  const newEntries = buildGlobalHookEntries(globalHooksDir, hooksSet);
  const mergedHooks = { ...cleanedHooks };
  for (const [event, entries] of Object.entries(newEntries)) {
    mergedHooks[event] = [...(mergedHooks[event] || []), ...entries];
  }

  await mkdir(dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, JSON.stringify({ ...existing, hooks: mergedHooks }, null, 2) + '\n');
}

/**
 * Remove devkit hook registrations from ~/.claude/settings.json.
 * Leaves any non-devkit hooks untouched.
 */
export async function removeGlobalHooksFromSettings() {
  const settingsPath = join(homedir(), '.claude', 'settings.json');
  let existing = {};
  try {
    existing = JSON.parse(await readFile(settingsPath, 'utf-8'));
  } catch { return; }

  const cleanedHooks = stripDevkitHooks(existing.hooks || {});
  await writeFile(settingsPath, JSON.stringify({ ...existing, hooks: cleanedHooks }, null, 2) + '\n');
}

/**
 * Install one skill file into an agent's GLOBAL (user-level) dir, with the agent's
 * own content transformation (frontmatter, AskUserQuestion rewrite, subagent caveat).
 * Works for every agent with a globalSkillRoot — Claude emits identity content, others
 * get their own frontmatter. Idempotency is keyed on the EMITTED content (which differs
 * from the kit source for non-Claude agents). The manifest key is the home-relative
 * emitted path, unique per agent.
 * @returns {{ result: 'copied'|'skipped'|'identical', kitHash: string, key: string } | null}
 *   null when the agent has no global dir (Cursor) or the path isn't a skill file.
 */
export async function installSkillGlobalForAgent(agentId, skillRelPath, { force = false, globalFiles = {} } = {}) {
  const srcContent = await readFile(join(getTemplateDir(), skillRelPath), 'utf-8');
  const emitted = emitSkillFileGlobal(agentId, skillRelPath, srcContent);
  if (!emitted) return null;

  const dst = join(homedir(), ...emitted.path.split('/'));
  const display = `~/${emitted.path}`;
  const key = emitted.path;
  const srcHash = hashContent(emitted.content);

  if (existsSync(dst) && !force) {
    try {
      const dstHash = hashContent(await readFile(dst, 'utf-8'));
      if (dstHash === srcHash) {
        log.same(`${display} (identical)`);
        return { result: 'identical', kitHash: srcHash, key };
      }
      // Overwrite only a stale version we wrote (disk matches the recorded kit hash);
      // otherwise the user customized it (or it's untracked) → preserve.
      const savedKitHash = globalFiles[key]?.kitHash;
      if (!(savedKitHash && dstHash === savedKitHash)) {
        log.skip(`${display} (customized — use --force to overwrite)`);
        return { result: 'skipped', kitHash: srcHash, key };
      }
    } catch { /* hash failed, treat as conflict → overwrite below */ }
  }

  await mkdir(dirname(dst), { recursive: true });
  await writeFile(dst, emitted.content);
  log.copy(display);
  return { result: 'copied', kitHash: srcHash, key };
}
