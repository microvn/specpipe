import { copyFile as fsCopyFile, mkdir, readFile, writeFile, unlink, rmdir } from 'node:fs/promises';
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
  // Hooks + settings.json are no longer static files — they're emitted per agent
  // from the hook registry (hooks.js) via installAgentHooks. Kept as an (empty)
  // component so `--only hooks` still resolves; init routes it to the emitter.
  hooks: [],
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
    'skills/sp-port-webui/SKILL.md',
    'skills/sp-port-webui/references/fidelity.mjs',
    'skills/sp-port-webui/references/fidelity.selftest.mjs',
    'skills/sp-port-webui/references/fidelity.map.example.json',
    'skills/sp-port-webui/references/figma-extract.md',
    'skills/sp-port-webui/references/codegen-seed.md',
    'skills/sp-port-webui/references/port-lessons.md',
  ],
  // CLAUDE.md is no longer a static file — it's emitted from the single rules source
  // (kit/rules/specpipe-rules.md) as a marked section, like every other agent's rules.
  config: [],
  // docs/WORKFLOW.md was dropped — its content is covered by the skills (detailed) and
  // the rules hub's workflow table. The user's docs/ holds only their own specs.
  docs: [],
};

// ── Skill selection ─────────────────────────────────────────────────────────
// Skills installed by default but safe to drop — standalone, not part of the
// spec→build→review pipeline. Tagged "(optional)" in the interactive picker.
export const OPTIONAL_SKILLS = ['sp-spec-render', 'sp-md-render', 'sp-humanize', 'sp-port-webui'];

/** Every skill name (sp-*), derived from the skill component list. */
export const ALL_SKILL_NAMES = [...new Set(COMPONENTS.skills.map((p) => p.split('/')[1]))];

/**
 * Resolve a `--skills` value into a Set of selected skill names, or null = all.
 * Accepts 'all', 'core' (all minus OPTIONAL_SKILLS), or a comma list of names
 * (with or without the `sp-` prefix). Throws on an unknown name.
 */
export function resolveSkills(spec) {
  if (!spec || spec === 'all') return null;
  if (spec === 'core') return new Set(ALL_SKILL_NAMES.filter((n) => !OPTIONAL_SKILLS.includes(n)));
  const names = spec.split(',').map((s) => s.trim()).filter(Boolean)
    .map((n) => (n.startsWith('sp-') ? n : `sp-${n}`));
  const unknown = names.filter((n) => !ALL_SKILL_NAMES.includes(n));
  if (unknown.length) {
    throw new Error(`Unknown skill(s): ${unknown.join(', ')}. Valid: ${ALL_SKILL_NAMES.join(', ')}, all, core`);
  }
  return new Set(names);
}

/**
 * Whether a template file path is allowed under a skill selection (null = all).
 * Non-skill files (hooks, config, docs) always pass; skill files pass only when
 * their skill name is in the set.
 */
export function skillAllowed(filePath, skillsSet) {
  if (!skillsSet) return true;
  const m = filePath.replace(/\\/g, '/').match(/^skills\/([^/]+)\//);
  return !m || skillsSet.has(m[1]);
}


// Files needing +x. Empty: guard scripts get +x at emit time (installAgentHooks
// chmods them); none are installed as plain COMPONENTS files anymore.
export const EXECUTABLE_FILES = [];

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
 * Migration prune: delete files a PRIOR manifest tracked that the new install no
 * longer wants — e.g. the predecessor `mf-*` (claude-devkit) / `ap-*` (agentpipe)
 * skills, or renamed/removed hooks. Safe because it only touches paths the kit
 * itself recorded as installed; a user's own files (e.g. a personal `mf-commit`
 * skill that was never in our manifest) are never in `priorFiles`, so untouched.
 * Skips preserved paths and the user's docs/. Cleans up emptied dirs.
 * @returns {Promise<number>} count pruned
 */
export async function pruneOrphans(targetDir, priorFiles, keepSet, { preserve = ['.claude/CLAUDE.md'] } = {}) {
  let pruned = 0;
  const dirs = new Set();
  for (const rel of Object.keys(priorFiles || {})) {
    if (keepSet.has(rel) || preserve.includes(rel) || rel.startsWith('docs/')) continue;
    const p = join(targetDir, rel);
    if (!existsSync(p)) continue;
    try {
      await unlink(p);
      log.del(`${rel} (legacy — superseded, removed)`);
      pruned++;
      let d = dirname(rel);
      while (d && d !== '.' && d !== '/') { dirs.add(d); d = dirname(d); }
    } catch { /* ignore */ }
  }
  for (const d of [...dirs].sort((a, b) => b.split('/').length - a.split('/').length)) {
    try { await rmdir(join(targetDir, d)); } catch { /* not empty / missing */ }
  }
  return pruned;
}

// Per-agent install (emit skills + guardrails) lives in agent-install.js;
// re-exported here so callers keep importing from installer.js.
export {
  installSkillForAgent, installAgentSkills, installAgentRules,
  mergeRulesSection, stripRulesSection,
  installAgentHooks, removeAgentHooks,
} from './agent-install.js';

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

// Every file the rules section can land in (per agent). fillTemplate fills the
// detected Project Info into whichever ones exist.
export const RULE_FILES = [
  '.claude/CLAUDE.md',
  'AGENTS.md',
  '.cursor/rules/specpipe-rules.mdc',
  '.agents/rules/specpipe-rules.md',
  'SPECPIPE-RULES.md',
];

/**
 * Fill the `[CUSTOMIZE]` Project Info placeholders in every installed rules file with
 * the detected project info. Rules are emitted per agent (CLAUDE.md, AGENTS.md, …), so
 * fill all of them, not just CLAUDE.md.
 */
export async function fillTemplate(targetDir, projectInfo) {
  if (!projectInfo) return;
  for (const rel of RULE_FILES) {
    const p = join(targetDir, rel);
    try {
      const before = await readFile(p, 'utf-8');
      const after = before
        .replace(/\*\*Language:\*\* \[CUSTOMIZE\]/, `**Language:** ${projectInfo.lang}`)
        .replace(/\*\*Test framework:\*\* \[CUSTOMIZE\]/, `**Test framework:** ${projectInfo.framework}`)
        .replace(/\*\*Source directory:\*\* \[CUSTOMIZE\]/, `**Source directory:** ${projectInfo.srcDir}`)
        .replace(/\*\*Test directory:\*\* \[CUSTOMIZE\]/, `**Test directory:** ${projectInfo.testDir}`);
      if (after !== before) await writeFile(p, after);
    } catch { /* file not installed for this agent — skip */ }
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
  getGlobalHooksDir, installHookGlobal,
  mergeGlobalSettings, removeGlobalHooksFromSettings,
  installSkillGlobalForAgent,
} from './claude-global.js';
