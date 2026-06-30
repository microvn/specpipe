import { resolve, dirname } from 'node:path';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { log } from '../lib/logger.js';
import { detectProject } from '../lib/detector.js';
import { createManifest, writeManifest, setFileEntry, readManifest, mergeAgents } from '../lib/manifest.js';
import { hashContent } from '../lib/hasher.js';
import {
  COMPONENTS,
  fillTemplate, installAgentSkills, installAgentRules, installAgentHooks,
  resolveSkills, pruneOrphans,
} from '../lib/installer.js';
import { resolveAgents, AGENTS, agentHasHooks } from '../lib/agents.js';
import { resolveHooks } from '../lib/hooks.js';
import { computeDesired } from '../lib/reconcile.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf-8'));

/**
 * Multi-agent install. Each selected agent gets its skill set emitted to its
 * native path + frontmatter. Claude additionally gets the full base
 * (hooks, config, docs) since it's the only agent with a native hook system.
 */
export async function initMultiAgent(targetDir, opts, warnings = 0) {
  let requested;
  try {
    requested = resolveAgents(opts.agents);
  } catch (e) {
    log.fail(e.message);
    process.exit(1);
  }
  // Accumulate: keep agents already installed (per the existing manifest) and add the
  // requested ones, so `init --agents X` then `--agents Y` ends up with both, not just Y.
  const existing = await readManifest(targetDir);
  const agents = mergeAgents(existing?.agents, requested);
  const claudeSelected = agents.includes('claude');
  const labels = agents.map((a) => AGENTS[a].label).join(', ');

  // --only selects static COMPONENTS files, which only the single-agent (claude-
  // only) path installs. Multi-agent emits skills/rules/hooks per agent and the
  // reconcile model (computeDesired) has no component dimension, so honoring --only
  // here wouldn't survive the next upgrade. Scope multi-agent installs with
  // --skills / --hooks instead. Warn rather than silently ignore.
  if (opts.only) {
    log.warn(`--only is ignored with --agents (component selection applies to single-agent installs only). Use --skills / --hooks to scope a multi-agent install.`);
  }

  if (opts.dryRun) {
    log.info('Dry run — no changes will be made');
    log.info(`Target agents: ${labels}`);
    return;
  }

  log.blank();
  console.log(`--- Installing for: ${labels} ---`);

  const skills = resolveSkills(opts.skills);
  const hooks = resolveHooks(opts.hooks);
  const manifest = createManifest(pkg.version, null, Object.keys(COMPONENTS));
  manifest.agents = agents;
  if (skills) manifest.skills = [...skills];
  if (hooks) manifest.hooks = [...hooks];

  // Skills + guardrails, emitted per agent into each agent's native location.
  // (No static "Claude base" to copy — hooks/config/docs COMPONENTS are empty;
  // everything is emitted from the registry in the per-agent loop below.)
  const results = [];
  for (const agent of agents) {
    log.blank();
    console.log(`  ${AGENTS[agent].label} skills:`);
    results.push(await installAgentSkills(agent, targetDir, { force: opts.force, skills }));
    // Option A: `--hooks none` turns guardrails off entirely — no enforced hooks AND
    // no always-on advisory rules. A subset/all still installs the advisory rules.
    const noGuards = hooks && hooks.size === 0;
    if (!noGuards) {
      const rules = await installAgentRules(agent, targetDir, { force: opts.force });
      if (rules?.mode === 'merge') manifest.agentsMdGuards = true;
    }
    await installAgentHooks(agent, targetDir, { force: opts.force, hooks }); // enforced hooks (Claude/Codex/Cursor/Antigravity)
  }

  // Project detection only fills Claude's CLAUDE.md template.
  if (claudeSelected) {
    const projectInfo = detectProject(targetDir);
    if (projectInfo) {
      manifest.projectType = { lang: projectInfo.lang, framework: projectInfo.framework };
      await fillTemplate(targetDir, projectInfo);
    } else {
      log.warn('Could not auto-detect project type — fill the Project Info section in .claude/CLAUDE.md manually.');
      warnings++;
    }
  }

  // Record every installed file (all agents) keyed by on-disk path, with the
  // hash of what's actually on disk so customization/skip is detected later.
  const desired = await computeDesired(agents, skills);
  for (const [relPath, d] of desired) {
    let installedHash = d.kitHash;
    try { installedHash = hashContent(await readFile(resolve(targetDir, relPath), 'utf-8')); } catch { /* skipped/missing */ }
    setFileEntry(manifest, relPath, d.kitHash, installedHash, { agent: d.agent, templateRel: d.templateRel });
  }

  // Migration: prune predecessor files (mf-* / ap-*, renamed hooks) a prior manifest
  // tracked but this install no longer wants — only manifest-tracked paths, so a
  // user's own files are never touched.
  if (existing?.files) {
    const n = await pruneOrphans(targetDir, existing.files, new Set(Object.keys(manifest.files)));
    if (n) log.info(`Migrated: removed ${n} superseded file(s) from a previous version.`);
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
  // Enforced = Claude's native .claude/hooks OR an agent with its own blocking
  // hook config (Codex .codex/hooks.json, Cursor .cursor/hooks.json, Antigravity
  // .agents/hooks.json). The rest get guards as always-on advisory rules only.
  const enforced = agents.filter((a) => AGENTS[a].hooks === 'native' || agentHasHooks(a));
  if (enforced.length) {
    log.blank();
    console.log(`  Guards hook-enforced (blocking) for: ${enforced.map((a) => AGENTS[a].label).join(', ')}.`);
  }
  const noHook = agents.filter((a) => AGENTS[a].hooks !== 'native' && !agentHasHooks(a));
  if (noHook.length) {
    log.blank();
    log.warn(`${noHook.map((a) => AGENTS[a].label).join(', ')}: guards installed as always-on rules (advisory — not hook-enforced like Claude).`);
  }
  if (warnings > 0) {
    log.blank();
    console.log(`⚠ ${warnings} warning(s) above — review before proceeding.`);
  }
}
