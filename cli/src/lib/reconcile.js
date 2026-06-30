import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { hashContent } from './hasher.js';
import { getAllFiles, COMPONENTS, getTemplateDir, skillAllowed } from './installer.js';
import { emitFile, emitRules, AGENTS } from './agents.js';

export const RULES_TEMPLATE_REL = 'rules/specpipe-rules.md';

/**
 * Template files a given agent receives. Claude gets the full kit
 * (hooks + config + docs + skills); every other agent gets skills only —
 * their guardrails are emitted separately from kit/rules (see emitRules), since
 * hooks are Claude-specific.
 */
export function templateFilesForAgent(agentId) {
  if (agentId === 'claude') return getAllFiles();
  // Agents that don't read project-local skills (Hermes scans only ~/.hermes/skills/)
  // get no per-project skill files — they'd be dead. Their rules doc is still emitted.
  if (AGENTS[agentId]?.perProjectSkills === false) return [];
  return COMPONENTS.skills;
}

/**
 * Compute the desired installed state for a set of agents.
 * @param {string[]} agents
 * @returns {Promise<Map<string, {agent, templateRel, content, kitHash}>>}
 *          keyed by installed (on-disk) relative path.
 */
export async function computeDesired(agents, skillsSet = null) {
  const dir = getTemplateDir();
  const desired = new Map();
  const guardsBody = await readFile(join(dir, RULES_TEMPLATE_REL), 'utf-8');

  for (const agent of agents) {
    for (const templateRel of templateFilesForAgent(agent)) {
      if (!skillAllowed(templateRel, skillsSet)) continue;
      const content = await readFile(join(dir, templateRel), 'utf-8');
      const emitted = emitFile(agent, templateRel, content);
      desired.set(emitted.path, {
        agent,
        templateRel,
        content: emitted.content,
        kitHash: hashContent(emitted.content),
      });
    }

    // Owned guardrails files (Cursor .mdc, Antigravity rule, OpenClaw/Hermes doc)
    // are reconciled like any other file. Codex's AGENTS.md is shared, not owned
    // here — it's merged/stripped separately.
    const rules = emitRules(agent, guardsBody);
    if (rules && rules.mode !== 'merge') {
      desired.set(rules.path, {
        agent,
        templateRel: RULES_TEMPLATE_REL,
        content: rules.content,
        kitHash: hashContent(rules.content),
      });
    }
  }
  return desired;
}
