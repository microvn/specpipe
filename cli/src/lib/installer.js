import { copyFile as fsCopyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chmod } from 'node:fs/promises';
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
    'skills/sp-explore/SKILL.md',
    'skills/sp-scaffold/SKILL.md',
    'skills/sp-scaffold/references/ARCHITECTURE.md.tmpl',
    'skills/sp-scaffold/references/DESIGN.md.tmpl',
    'skills/sp-scaffold/references/adr/NNNN-template.md',
    'skills/sp-scaffold/references/stack-profiles/react.md',
    'skills/sp-plan/SKILL.md',
    'skills/sp-build/SKILL.md',
    'skills/sp-challenge/SKILL.md',
    'skills/sp-investigate/SKILL.md',
    'skills/sp-fix/SKILL.md',
    'skills/sp-review/SKILL.md',
    'skills/sp-commit/SKILL.md',
    'skills/sp-voices/SKILL.md',
    'skills/sp-spec-render/SKILL.md',
    'skills/sp-spec-render/template.html',
    'skills/sp-spec-render/components.md',
    'skills/sp-spec-render/examples/user-auth.md',
    'skills/sp-spec-render/examples/user-auth.html',
    'skills/sp-md-render/SKILL.md',
    'skills/sp-md-render/template.html',
    'skills/sp-md-render/components.md',
    'skills/sp-humanize/SKILL.md',
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

// Per-agent install (emit skills + guardrails) lives in agent-install.js;
// re-exported here so callers keep importing from installer.js.
export {
  installSkillForAgent, installAgentSkills, installAgentRules,
  mergeAgentsMdGuards, stripAgentsMdGuards,
  installAgentHooks, removeAgentHooks,
} from './agent-install.js';

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

// Claude's global install (~/.claude/skills + hooks + settings.json) lives in
// claude-global.js; re-exported here so callers keep importing from installer.js.
export {
  getGlobalSkillsDir, getGlobalHooksDir, installHookGlobal,
  mergeGlobalSettings, removeGlobalHooksFromSettings, installSkillGlobal,
} from './claude-global.js';
