import { copyFile as fsCopyFile, mkdir, readFile, writeFile, access, constants, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chmod } from 'node:fs/promises';
import { homedir } from 'node:os';
import { log } from './logger.js';
import { emitSkillFile, emitRules, AGENTS, GUARDS_BEGIN, GUARDS_END } from './agents.js';

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
    'skills/ap-explore/SKILL.md',
    'skills/ap-scaffold/SKILL.md',
    'skills/ap-scaffold/references/ARCHITECTURE.md.tmpl',
    'skills/ap-scaffold/references/DESIGN.md.tmpl',
    'skills/ap-scaffold/references/adr/NNNN-template.md',
    'skills/ap-scaffold/references/stack-profiles/react.md',
    'skills/ap-plan/SKILL.md',
    'skills/ap-build/SKILL.md',
    'skills/ap-challenge/SKILL.md',
    'skills/ap-investigate/SKILL.md',
    'skills/ap-fix/SKILL.md',
    'skills/ap-review/SKILL.md',
    'skills/ap-commit/SKILL.md',
    'skills/ap-voices/SKILL.md',
    'skills/ap-spec-render/SKILL.md',
    'skills/ap-spec-render/template.html',
    'skills/ap-spec-render/components.md',
    'skills/ap-spec-render/examples/user-auth.md',
    'skills/ap-spec-render/examples/user-auth.html',
    'skills/ap-md-render/SKILL.md',
    'skills/ap-md-render/template.html',
    'skills/ap-md-render/components.md',
    'skills/ap-humanize/SKILL.md',
  ],
  config: [
    '.claude/settings.json',
    '.claude/CLAUDE.md',
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
 * Emit one canonical skill file for a target agent and write it to targetDir.
 * Transforms path + frontmatter per the agent's convention (see agents.js).
 * @returns {{ result: 'copied'|'skipped'|'identical', path?: string }}
 */
export async function installSkillForAgent(agentId, canonicalRel, targetDir, { force = false } = {}) {
  const src = join(getTemplateDir(), canonicalRel);
  const content = await readFile(src, 'utf-8');
  const emitted = emitSkillFile(agentId, canonicalRel, content);
  if (!emitted) return { result: 'skipped' };

  const dst = join(targetDir, emitted.path);
  if (existsSync(dst) && !force) {
    try {
      if ((await readFile(dst, 'utf-8')) === emitted.content) {
        log.same(`${emitted.path} (identical)`);
        return { result: 'identical', path: emitted.path };
      }
    } catch { /* unreadable — treat as conflict */ }
    log.warn(`${emitted.path} (exists with different content — use --force to overwrite)`);
    return { result: 'skipped', path: emitted.path };
  }

  await mkdir(dirname(dst), { recursive: true });
  await writeFile(dst, emitted.content);
  log.copy(emitted.path);
  return { result: 'copied', path: emitted.path };
}

/**
 * Install the full skill set for one agent into targetDir.
 * @returns {{ agent: string, copied: number, skipped: number, identical: number, paths: string[] }}
 */
export async function installAgentSkills(agentId, targetDir, { force = false } = {}) {
  let copied = 0, skipped = 0, identical = 0;
  const paths = [];
  for (const relPath of COMPONENTS.skills) {
    const { result, path } = await installSkillForAgent(agentId, relPath, targetDir, { force });
    if (result === 'copied') copied++;
    else if (result === 'identical') identical++;
    else skipped++;
    if (path) paths.push(path);
  }
  return { agent: agentId, label: AGENTS[agentId].label, copied, skipped, identical, paths };
}

const GUARDS_TEMPLATE_REL = 'rules/agentpipe-guards.md';

function guardsSectionRegex() {
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(esc(GUARDS_BEGIN) + '[\\s\\S]*?' + esc(GUARDS_END) + '\\n?', '');
}

/** Merge (or replace) the agentpipe guards section in a shared AGENTS.md. */
export async function mergeAgentsMdGuards(targetDir, section) {
  const p = join(targetDir, 'AGENTS.md');
  let existing = '';
  try { existing = await readFile(p, 'utf-8'); } catch { /* new file */ }
  const re = guardsSectionRegex();
  existing = re.test(existing)
    ? existing.replace(re, section)
    : (existing.trim() ? existing.trimEnd() + '\n\n' : '') + section;
  await writeFile(p, existing);
}

/** Remove the agentpipe guards section from AGENTS.md (deletes file if now empty). */
export async function stripAgentsMdGuards(targetDir) {
  const p = join(targetDir, 'AGENTS.md');
  let existing;
  try { existing = await readFile(p, 'utf-8'); } catch { return false; }
  const stripped = existing.replace(guardsSectionRegex(), '').trim();
  if (stripped === existing.trim()) return false;
  if (stripped) await writeFile(p, stripped + '\n');
  else await unlink(p);
  return true;
}

/**
 * Install an agent's guardrails: an owned rules file (Cursor/Antigravity/
 * OpenClaw/Hermes) or a merged section in a shared AGENTS.md (Codex).
 * Claude returns null — it uses native hooks instead.
 */
export async function installAgentRules(agentId, targetDir, { force = false } = {}) {
  const body = await readFile(join(getTemplateDir(), GUARDS_TEMPLATE_REL), 'utf-8');
  const r = emitRules(agentId, body);
  if (!r) return null;

  if (r.mode === 'agents-md') {
    await mergeAgentsMdGuards(targetDir, r.content);
    log.copy(`${r.path} (agentpipe guards section)`);
    return { mode: 'agents-md', path: r.path };
  }

  const dst = join(targetDir, r.path);
  if (existsSync(dst) && !force) {
    try {
      if ((await readFile(dst, 'utf-8')) === r.content) {
        log.same(`${r.path} (identical)`);
        return { mode: r.mode, path: r.path };
      }
    } catch { /* unreadable — treat as conflict */ }
    log.warn(`${r.path} (exists with different content — use --force to overwrite)`);
    return { mode: r.mode, path: r.path };
  }
  await mkdir(dirname(dst), { recursive: true });
  await writeFile(dst, r.content);
  log.copy(r.path);
  return { mode: r.mode, path: r.path };
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
 * Strips the 'skills/' prefix so ap-plan/SKILL.md lands at
 * ~/.claude/skills/ap-plan/SKILL.md.
 * @param {object} [opts.globalFiles] - files section from global manifest, used to detect true customization
 * @returns {{ result: 'copied'|'skipped'|'identical', kitHash: string }}
 */
export async function installSkillGlobal(skillRelPath, globalSkillsDir, { force = false, globalFiles = {} } = {}) {
  // Canonical skills live under kit/skills/; global Claude install lands them at ~/.claude/skills/.
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
