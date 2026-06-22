import { resolve, dirname } from 'node:path';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { log } from '../lib/logger.js';
import { detectProject } from '../lib/detector.js';
import { createManifest, writeManifest, setFileEntry } from '../lib/manifest.js';
import { hashContent } from '../lib/hasher.js';
import {
  COMPONENTS, PLACEHOLDER_DIRS, installFile, ensurePlaceholderDir,
  setPermissions, fillTemplate, installAgentSkills, installAgentRules,
} from '../lib/installer.js';
import { resolveAgents, AGENTS } from '../lib/agents.js';
import { computeDesired } from '../lib/reconcile.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf-8'));

/**
 * Multi-agent install. Each selected agent gets its skill set emitted to its
 * native path + frontmatter. Claude additionally gets the full base
 * (hooks, config, docs) since it's the only agent with a native hook system.
 */
export async function initMultiAgent(targetDir, opts, warnings = 0) {
  let agents;
  try {
    agents = resolveAgents(opts.agents);
  } catch (e) {
    log.fail(e.message);
    process.exit(1);
  }
  const claudeSelected = agents.includes('claude');
  const labels = agents.map((a) => AGENTS[a].label).join(', ');

  if (opts.dryRun) {
    log.info('Dry run — no changes will be made');
    log.info(`Target agents: ${labels}`);
    return;
  }

  log.blank();
  console.log(`--- Installing for: ${labels} ---`);

  const manifest = createManifest(pkg.version, null, Object.keys(COMPONENTS));
  manifest.agents = agents;

  // Claude base: hooks + config + docs (only Claude has a native hook system).
  if (claudeSelected) {
    log.blank();
    console.log('  Claude base (hooks, config, docs):');
    for (const file of [...COMPONENTS.hooks, ...COMPONENTS.config, ...COMPONENTS.docs]) {
      await installFile(file, targetDir, { force: opts.force });
    }
    for (const dir of PLACEHOLDER_DIRS) await ensurePlaceholderDir(dir, targetDir);
    await setPermissions(targetDir);
  }

  // Skills + guardrails, emitted per agent into each agent's native location.
  const results = [];
  for (const agent of agents) {
    log.blank();
    console.log(`  ${AGENTS[agent].label} skills:`);
    results.push(await installAgentSkills(agent, targetDir, { force: opts.force }));
    const rules = await installAgentRules(agent, targetDir, { force: opts.force });
    if (rules?.mode === 'agents-md') manifest.agentsMdGuards = true;
  }

  // Project detection only fills Claude's CLAUDE.md template.
  if (claudeSelected) {
    const projectInfo = detectProject(targetDir);
    if (projectInfo) {
      manifest.projectType = { lang: projectInfo.lang, framework: projectInfo.framework };
      await fillTemplate(targetDir, projectInfo);
    } else {
      warnings++;
    }
  }

  // Record every installed file (all agents) keyed by on-disk path, with the
  // hash of what's actually on disk so customization/skip is detected later.
  const desired = await computeDesired(agents);
  for (const [relPath, d] of desired) {
    let installedHash = d.kitHash;
    try { installedHash = hashContent(await readFile(resolve(targetDir, relPath), 'utf-8')); } catch { /* skipped/missing */ }
    setFileEntry(manifest, relPath, d.kitHash, installedHash, { agent: d.agent, templateRel: d.templateRel });
  }

  await writeManifest(targetDir, manifest);

  // Summary
  log.blank();
  console.log('=== Setup Complete ===');
  log.blank();
  for (const r of results) {
    const parts = [`${r.copied} copied`];
    if (r.identical > 0) parts.push(`${r.identical} identical`);
    if (r.skipped > 0) parts.push(`${r.skipped} conflicted`);
    console.log(`  ${r.label}: ${parts.join(', ')}`);
  }
  if (claudeSelected) {
    log.blank();
    console.log('  Claude hooks active via .claude/settings.json.');
  }
  const noHook = agents.filter((a) => AGENTS[a].hooks !== 'native');
  if (noHook.length) {
    log.blank();
    log.warn(`${noHook.map((a) => AGENTS[a].label).join(', ')}: guards installed as always-on rules (advisory — not hook-enforced like Claude).`);
  }
  if (warnings > 0) {
    log.blank();
    console.log(`⚠ ${warnings} warning(s) above — review before proceeding.`);
  }
}
