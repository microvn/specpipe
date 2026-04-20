import { copyFile as fsCopyFile, mkdir, readFile, writeFile, access, constants } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chmod } from 'node:fs/promises';
import { homedir } from 'node:os';
import { log } from './logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Component → file mappings.
 */
export const COMPONENTS = {
  hooks: [
    '.claude/hooks/file-guard.js',
    '.claude/hooks/path-guard.sh',
    '.claude/hooks/comment-guard.js',
    '.claude/hooks/glob-guard.js',
    '.claude/hooks/self-review.sh',
    '.claude/hooks/sensitive-guard.sh',
  ],
  skills: [
    '.claude/skills/mf-explore/SKILL.md',
    '.claude/skills/mf-plan/SKILL.md',
    '.claude/skills/mf-build/SKILL.md',
    '.claude/skills/mf-challenge/SKILL.md',
    '.claude/skills/mf-investigate/SKILL.md',
    '.claude/skills/mf-fix/SKILL.md',
    '.claude/skills/mf-review/SKILL.md',
    '.claude/skills/mf-commit/SKILL.md',
  ],
  config: [
    '.claude/settings.json',
    '.claude/CLAUDE.md',
  ],
  scripts: [
    'scripts/build-test.sh',
  ],
  docs: [
    'docs/WORKFLOW.md',
  ],
};

/**
 * Placeholder directories to create.
 */
export const PLACEHOLDER_DIRS = [
  'docs/specs',
  'docs/test-plans',
];

/**
 * Files that need +x permission.
 */
export const EXECUTABLE_FILES = [
  'scripts/build-test.sh',
  '.claude/hooks/path-guard.sh',
  '.claude/hooks/self-review.sh',
  '.claude/hooks/sensitive-guard.sh',
];

/**
 * Get path to kit (templates) directory.
 * Published package: cli/templates/  |  Dev mode: ../kit/
 */
export function getTemplateDir() {
  const bundled = resolve(__dirname, '../../templates');
  if (existsSync(bundled)) return bundled;
  return resolve(__dirname, '../../../kit');
}

/**
 * Get all files for the given component list.
 * @param {string[]} components - e.g. ['hooks', 'skills']
 * @returns {string[]} relative file paths
 */
export function getFilesForComponents(components) {
  const files = [];
  for (const comp of components) {
    if (COMPONENTS[comp]) {
      files.push(...COMPONENTS[comp]);
    }
  }
  return files;
}

/**
 * Get all installable files (all components).
 */
export function getAllFiles() {
  return Object.values(COMPONENTS).flat();
}

/**
 * Copy a single file from templates to target.
 * @returns {string} 'copied' | 'skipped' | 'identical'
 */
export async function installFile(relativePath, targetDir, { force = false } = {}) {
  const src = join(getTemplateDir(), relativePath);
  const dst = join(targetDir, relativePath);

  if (existsSync(dst) && !force) {
    // Compare content to distinguish: identical, customized, or from another source
    try {
      const { hashFile } = await import('./hasher.js');
      const srcHash = await hashFile(src);
      const dstHash = await hashFile(dst);
      if (srcHash === dstHash) {
        log.same(`${relativePath} (identical)`);
        return 'identical';
      }
    } catch { /* hash failed, treat as conflict */ }
    log.warn(`${relativePath} (exists with different content — use --force to overwrite)`);
    return 'skipped';
  }

  await mkdir(dirname(dst), { recursive: true });
  await fsCopyFile(src, dst);
  log.copy(relativePath);
  return 'copied';
}

/**
 * Create a placeholder directory with .gitkeep.
 */
export async function ensurePlaceholderDir(dir, targetDir) {
  const fullPath = join(targetDir, dir);
  if (existsSync(fullPath)) {
    log.skip(`${dir}/ (exists)`);
    return;
  }
  await mkdir(fullPath, { recursive: true });
  await writeFile(join(fullPath, '.gitkeep'), '');
  log.make(`${dir}/`);
}

/**
 * Set executable permissions on relevant files.
 */
export async function setPermissions(targetDir) {
  for (const file of EXECUTABLE_FILES) {
    const fullPath = join(targetDir, file);
    try {
      await chmod(fullPath, 0o755);
    } catch {
      // File might not exist if component not installed
    }
  }
}

/**
 * Fill [CUSTOMIZE] placeholders in CLAUDE.md with detected project info.
 */
export async function fillTemplate(targetDir, projectInfo) {
  if (!projectInfo) return;

  const claudeMdPath = join(targetDir, '.claude/CLAUDE.md');
  try {
    let content = await readFile(claudeMdPath, 'utf-8');
    content = content
      .replace(/\[CUSTOMIZE\] Language:.*/, `**Language:** ${projectInfo.lang}`)
      .replace(/\[CUSTOMIZE\] Test framework:.*/, `**Test framework:** ${projectInfo.framework}`)
      .replace(/\[CUSTOMIZE\] Source directory:.*/, `**Source directory:** ${projectInfo.srcDir}`)
      .replace(/\[CUSTOMIZE\] Test directory:.*/, `**Test directory:** ${projectInfo.testDir}`)
      // Also handle the format without [CUSTOMIZE] prefix
      .replace(/\*\*Language:\*\* \[CUSTOMIZE\]/, `**Language:** ${projectInfo.lang}`)
      .replace(/\*\*Test framework:\*\* \[CUSTOMIZE\]/, `**Test framework:** ${projectInfo.framework}`)
      .replace(/\*\*Source directory:\*\* \[CUSTOMIZE\]/, `**Source directory:** ${projectInfo.srcDir}`)
      .replace(/\*\*Test directory:\*\* \[CUSTOMIZE\]/, `**Test directory:** ${projectInfo.testDir}`);
    await writeFile(claudeMdPath, content);
  } catch {
    // CLAUDE.md might not exist
  }
}

/**
 * Verify settings.json is valid JSON.
 */
export async function verifySettingsJson(targetDir) {
  try {
    const raw = await readFile(join(targetDir, '.claude/settings.json'), 'utf-8');
    JSON.parse(raw);
    return true;
  } catch {
    return false;
  }
}

/**
 * Global skills directory: ~/.claude/skills/
 */
export function getGlobalSkillsDir() {
  return join(homedir(), '.claude', 'skills');
}

/**
 * Global hooks directory: ~/.claude/hooks/
 */
export function getGlobalHooksDir() {
  return join(homedir(), '.claude', 'hooks');
}

/**
 * Global scripts directory: ~/.claude/scripts/
 */
export function getGlobalScriptsDir() {
  return join(homedir(), '.claude', 'scripts');
}

/**
 * Copy a script to the global ~/.claude/scripts/ directory.
 * Strips the 'scripts/' prefix so build-test.sh lands at
 * ~/.claude/scripts/build-test.sh.
 * @param {object} [opts.globalFiles] - files section from global manifest, used to detect true customization
 * @returns {{ result: 'copied'|'skipped'|'identical', kitHash: string }}
 */
export async function installScriptGlobal(scriptRelPath, globalScriptsDir, { force = false, globalFiles = {} } = {}) {
  const stripped = scriptRelPath.replace(/^scripts\//, '');
  const src = join(getTemplateDir(), scriptRelPath);
  const dst = join(globalScriptsDir, stripped);

  const { hashFile } = await import('./hasher.js');
  const srcHash = await hashFile(src);

  if (existsSync(dst) && !force) {
    try {
      const dstHash = await hashFile(dst);
      if (srcHash === dstHash) {
        log.same(`~/.claude/scripts/${stripped} (identical)`);
        return { result: 'identical', kitHash: srcHash };
      }
      const savedKitHash = globalFiles[scriptRelPath]?.kitHash;
      if (savedKitHash && dstHash === savedKitHash) {
        // fall through to copy
      } else {
        log.skip(`~/.claude/scripts/${stripped} (customized — use --force to overwrite)`);
        return { result: 'skipped', kitHash: srcHash };
      }
    } catch { /* hash failed */ }
  }

  await mkdir(dirname(dst), { recursive: true });
  await fsCopyFile(src, dst);
  await chmod(dst, 0o755);
  log.copy(`~/.claude/scripts/${stripped}`);
  return { result: 'copied', kitHash: srcHash };
}

/**
 * Copy a hook to the global ~/.claude/hooks/ directory.
 * Strips the '.claude/hooks/' prefix so path-guard.sh lands at
 * ~/.claude/hooks/path-guard.sh.
 * @param {object} [opts.globalFiles] - files section from global manifest, used to detect true customization
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

/**
 * Build hook entries for ~/.claude/settings.json pointing to globalHooksDir.
 */
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

  // Remove old devkit entries (identified by /.claude/hooks/ in command path)
  const cleanedHooks = stripDevkitHooks(existing.hooks);

  // Append new devkit entries
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
 * Strips the '.claude/skills/' prefix so mf-plan/SKILL.md lands at
 * ~/.claude/skills/mf-plan/SKILL.md.
 * @param {object} [opts.globalFiles] - files section from global manifest, used to detect true customization
 * @returns {{ result: 'copied'|'skipped'|'identical', kitHash: string }}
 */
export async function installSkillGlobal(skillRelPath, globalSkillsDir, { force = false, globalFiles = {} } = {}) {
  const stripped = skillRelPath.replace(/^\.claude\/skills\//, '');
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
      // If the installed file still matches the kitHash we saved at last install,
      // the user hasn't touched it — the kit just changed. Safe to update.
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
