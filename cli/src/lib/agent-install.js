import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { log } from './logger.js';
import { getTemplateDir, COMPONENTS } from './installer.js';
import { emitSkillFile, emitRules, AGENTS, GUARDS_BEGIN, GUARDS_END } from './agents.js';

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
    log.copy(`${r.path} (agentpipe operating-rules section)`);
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
