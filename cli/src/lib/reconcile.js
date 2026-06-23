import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { hashContent } from './hasher.js';
import { getAllFiles, COMPONENTS, getTemplateDir } from './installer.js';
import { emitFile, emitRules } from './agents.js';

export const GUARDS_TEMPLATE_REL = 'rules/agentpipe-guards.md';

/**
 * Template files a given agent receives. Claude gets the full kit
 * (hooks + config + docs + skills); every other agent gets skills only —
 * their guardrails are emitted separately from kit/rules (see emitRules), since
 * hooks are Claude-specific.
 */
export function templateFilesForAgent(agentId) {
  return agentId === 'claude' ? getAllFiles() : COMPONENTS.skills;
}

/**
 * Compute the desired installed state for a set of agents.
 * @param {string[]} agents
 * @returns {Promise<Map<string, {agent, templateRel, content, kitHash}>>}
 *          keyed by installed (on-disk) relative path.
 */
export async function computeDesired(agents) {
  const dir = getTemplateDir();
  const desired = new Map();
  const guardsBody = await readFile(join(dir, GUARDS_TEMPLATE_REL), 'utf-8');

  for (const agent of agents) {
    for (const templateRel of templateFilesForAgent(agent)) {
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
    if (rules && rules.mode !== 'agents-md') {
      desired.set(rules.path, {
        agent,
        templateRel: GUARDS_TEMPLATE_REL,
        content: rules.content,
        kitHash: hashContent(rules.content),
      });
    }
  }
  return desired;
}
