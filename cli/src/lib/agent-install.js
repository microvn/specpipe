import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile, unlink, chmod, rmdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { log } from './logger.js';
import { getTemplateDir, COMPONENTS, skillAllowed } from './installer.js';
import { emitSkillFile, emitRules, emitHooks, AGENTS, RULES_BEGIN, RULES_END } from './agents.js';

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
export async function installAgentSkills(agentId, targetDir, { force = false, skills = null } = {}) {
  let copied = 0, skipped = 0, identical = 0;
  const paths = [];
  // Hermes (and any perProjectSkills:false agent) reads skills only from its global dir,
  // never the project — emitting per-project skill files here would be dead. Skip them.
  if (AGENTS[agentId]?.perProjectSkills === false) {
    return { agent: agentId, label: AGENTS[agentId].label, copied, skipped, identical, paths };
  }
  for (const relPath of COMPONENTS.skills) {
    if (!skillAllowed(relPath, skills)) continue;
    const { result, path } = await installSkillForAgent(agentId, relPath, targetDir, { force });
    if (result === 'copied') copied++;
    else if (result === 'identical') identical++;
    else skipped++;
    if (path) paths.push(path);
  }
  return { agent: agentId, label: AGENTS[agentId].label, copied, skipped, identical, paths };
}

const RULES_TEMPLATE_REL = 'rules/specpipe-rules.md';

function rulesSectionRegex() {
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(esc(RULES_BEGIN) + '[\\s\\S]*?' + esc(RULES_END) + '\\n?', '');
}

/** Merge (or replace) the specpipe rules section in a shared file (CLAUDE.md / AGENTS.md). */
export async function mergeRulesSection(targetDir, fileRel, section) {
  const p = join(targetDir, fileRel);
  let existing = '';
  try { existing = await readFile(p, 'utf-8'); } catch { /* new file */ }
  const re = rulesSectionRegex();
  existing = re.test(existing)
    ? existing.replace(re, section)
    : (existing.trim() ? existing.trimEnd() + '\n\n' : '') + section;
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, existing);
}

/** Remove the specpipe rules section from a shared file (deletes it if now empty). */
export async function stripRulesSection(targetDir, fileRel) {
  const p = join(targetDir, fileRel);
  let existing;
  try { existing = await readFile(p, 'utf-8'); } catch { return false; }
  const stripped = existing.replace(rulesSectionRegex(), '').trim();
  if (stripped === existing.trim()) return false;
  if (stripped) await writeFile(p, stripped + '\n');
  else await unlink(p);
  return true;
}

/**
 * Install an agent's guardrails: a merged section in a shared file (Claude →
 * .claude/CLAUDE.md, Codex → AGENTS.md) or an owned rules file (Cursor/
 * Antigravity/OpenClaw/Hermes). Returns null only if the agent has no rules entry.
 */
export async function installAgentRules(agentId, targetDir, { force = false } = {}) {
  const body = await readFile(join(getTemplateDir(), RULES_TEMPLATE_REL), 'utf-8');
  const r = emitRules(agentId, body);
  if (!r) return null;

  if (r.mode === 'merge') {
    await mergeRulesSection(targetDir, r.path, r.content);
    log.copy(`${r.path} (specpipe operating-rules section)`);
    return { mode: 'merge', path: r.path };
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
 * Install an agent's ENFORCED (blocking) hooks: the guard scripts + the agent's
 * hook config file. Agents with a verified hook config (Claude/Codex/Cursor/
 * Antigravity); returns null for agents without one.
 * The hook config is specpipe-owned; if a different one already exists, we skip
 * unless --force (don't clobber a user's hooks).
 */
export async function installAgentHooks(agentId, targetDir, { force = false, hooks = null } = {}) {
  const h = emitHooks(agentId, hooks);
  if (!h) return null;

  for (const { src, dst } of h.scripts) {
    const content = await readFile(join(getTemplateDir(), src), 'utf-8');
    const dstAbs = join(targetDir, dst);
    await mkdir(dirname(dstAbs), { recursive: true });
    await writeFile(dstAbs, content);
    await chmod(dstAbs, 0o755);
    log.copy(dst);
  }

  const cfgAbs = join(targetDir, h.configPath);
  if (existsSync(cfgAbs) && !force) {
    try {
      if ((await readFile(cfgAbs, 'utf-8')) === h.configContent) {
        log.same(`${h.configPath} (identical)`);
        return { configPath: h.configPath };
      }
    } catch { /* unreadable */ }
    log.warn(`${h.configPath} (exists — use --force to install specpipe enforced hooks)`);
    return { configPath: h.configPath };
  }
  await mkdir(dirname(cfgAbs), { recursive: true });
  await writeFile(cfgAbs, h.configContent);
  log.copy(h.configPath);
  return { configPath: h.configPath };
}

/** Remove an agent's enforced-hook scripts + config (+ empty hooks/agent dirs). */
export async function removeAgentHooks(agentId, targetDir) {
  const h = emitHooks(agentId);
  if (!h) return;
  for (const { dst } of h.scripts) { try { await unlink(join(targetDir, dst)); } catch { /* */ } }
  try { await unlink(join(targetDir, h.configPath)); } catch { /* */ }
  try { await rmdir(join(targetDir, h.hooksDir)); } catch { /* not empty / missing */ }
  // Tidy the agent's container dir too (e.g. .codex/, .agents/) — its only specpipe
  // content was the hook config + hooks/. rmdir is a no-op when the dir still holds
  // other content (.claude/CLAUDE.md, .cursor/rules/, .agents/skills/ for a kept agent).
  const agentDir = dirname(h.configPath);
  if (agentDir && agentDir !== '.') { try { await rmdir(join(targetDir, agentDir)); } catch { /* not empty / missing */ } }
}
