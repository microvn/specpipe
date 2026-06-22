import { copyFile as fsCopyFile, mkdir, readFile, writeFile, chmod } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { log } from './logger.js';
import { getTemplateDir } from './installer.js';

// Claude's global install (~/.claude/skills, ~/.claude/hooks, ~/.claude/settings.json).
// Claude-only: it's Claude Code's own enforcement engine; other agents have no equivalent.

/** Global skills directory: ~/.claude/skills/ */
export function getGlobalSkillsDir() {
  return join(homedir(), '.claude', 'skills');
}

/** Global hooks directory: ~/.claude/hooks/ */
export function getGlobalHooksDir() {
  return join(homedir(), '.claude', 'hooks');
}

/**
 * Copy a hook to the global ~/.claude/hooks/ directory.
 * Strips the '.claude/hooks/' prefix so path-guard.sh lands at ~/.claude/hooks/path-guard.sh.
 * @returns {{ result: 'copied'|'skipped'|'identical', kitHash: string }}
 */
export async function installHookGlobal(hookRelPath, globalHooksDir, { force = false, globalFiles = {} } = {}) {
  const stripped = hookRelPath.replace(/^\.claude\/hooks\//, '');
  const src = join(getTemplateDir(), hookRelPath);
  const dst = join(globalHooksDir, stripped);

  const { hashFile } = await import('./hasher.js');
  const srcHash = await hashFile(src);

  if (existsSync(dst) && !force) {
    try {
      const dstHash = await hashFile(dst);
      if (srcHash === dstHash) {
        log.same(`~/.claude/hooks/${stripped} (identical)`);
        return { result: 'identical', kitHash: srcHash };
      }
      const savedKitHash = globalFiles[hookRelPath]?.kitHash;
      if (savedKitHash && dstHash === savedKitHash) {
        // fall through to copy
      } else {
        log.skip(`~/.claude/hooks/${stripped} (customized — use --force to overwrite)`);
        return { result: 'skipped', kitHash: srcHash };
      }
    } catch { /* hash failed */ }
  }

  await mkdir(dirname(dst), { recursive: true });
  await fsCopyFile(src, dst);
  await chmod(dst, 0o755);
  log.copy(`~/.claude/hooks/${stripped}`);
  return { result: 'copied', kitHash: srcHash };
}

/** Build hook entries for ~/.claude/settings.json pointing to globalHooksDir. */
function buildGlobalHookEntries(globalHooksDir) {
  // Normalize to forward slashes — bash on all platforms (WSL, Git Bash, macOS, Linux)
  // requires forward slashes even when the host OS is Windows.
  const dir = globalHooksDir.replace(/\\/g, '/');
  const h = (file) => `"${dir}/${file}"`;
  return {
    PreToolUse: [
      { matcher: 'Bash', hooks: [
        { type: 'command', command: `bash ${h('path-guard.sh')}` },
        { type: 'command', command: `bash ${h('sensitive-guard.sh')}` },
      ]},
      { matcher: 'Read|Write|Edit|MultiEdit|Grep', hooks: [
        { type: 'command', command: `bash ${h('sensitive-guard.sh')}` },
      ]},
      { matcher: 'Edit|MultiEdit', hooks: [
        { type: 'command', command: `node ${h('comment-guard.js')}` },
      ]},
      { matcher: 'Glob', hooks: [
        { type: 'command', command: `node ${h('glob-guard.js')}` },
      ]},
    ],
    PostToolUse: [
      { matcher: 'Write|Edit|MultiEdit', hooks: [
        { type: 'command', command: `node ${h('file-guard.js')}` },
      ]},
    ],
    Stop: [
      { matcher: '', hooks: [
        { type: 'command', command: `bash ${h('self-review.sh')}` },
      ]},
    ],
  };
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
export async function mergeGlobalSettings(globalHooksDir) {
  const settingsPath = join(homedir(), '.claude', 'settings.json');
  let existing = {};
  try {
    existing = JSON.parse(await readFile(settingsPath, 'utf-8'));
  } catch { /* file doesn't exist yet — start fresh */ }

  const cleanedHooks = stripDevkitHooks(existing.hooks);
  const newEntries = buildGlobalHookEntries(globalHooksDir);
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
 * Copy a skill to the global ~/.claude/skills/ directory.
 * Strips the 'skills/' prefix so ap-plan/SKILL.md lands at ~/.claude/skills/ap-plan/SKILL.md.
 * @returns {{ result: 'copied'|'skipped'|'identical', kitHash: string }}
 */
export async function installSkillGlobal(skillRelPath, globalSkillsDir, { force = false, globalFiles = {} } = {}) {
  const stripped = skillRelPath.replace(/^skills\//, '');
  const src = join(getTemplateDir(), skillRelPath);
  const dst = join(globalSkillsDir, stripped);

  const { hashFile } = await import('./hasher.js');
  const srcHash = await hashFile(src);

  if (existsSync(dst) && !force) {
    try {
      const dstHash = await hashFile(dst);
      if (srcHash === dstHash) {
        log.same(`~/.claude/skills/${stripped} (identical)`);
        return { result: 'identical', kitHash: srcHash };
      }
      const savedKitHash = globalFiles[skillRelPath]?.kitHash;
      if (savedKitHash && dstHash === savedKitHash) {
        // fall through to copy
      } else {
        log.skip(`~/.claude/skills/${stripped} (customized — use --force to overwrite)`);
        return { result: 'skipped', kitHash: srcHash };
      }
    } catch { /* hash failed, treat as conflict */ }
  }

  await mkdir(dirname(dst), { recursive: true });
  await fsCopyFile(src, dst);
  log.copy(`~/.claude/skills/${stripped}`);
  return { result: 'copied', kitHash: srcHash };
}
