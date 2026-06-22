import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { hashContent } from './hasher.js';
import { getAllFiles, COMPONENTS, getTemplateDir } from './installer.js';
import { emitFile } from './agents.js';

/**
 * Template files a given agent receives. Claude gets the full kit
 * (hooks + config + docs + skills); every other agent gets skills only —
 * hooks/guards are Claude-specific (translated in a later phase).
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
  }
  return desired;
}
