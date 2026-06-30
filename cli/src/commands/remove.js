import { resolve, join, dirname } from 'node:path';
import { unlink, rmdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { log } from '../lib/logger.js';
import { readManifest, writeManifest, getAgents, MANIFEST_FILE, LEGACY_MANIFEST_FILE } from '../lib/manifest.js';
import { removeGlobalHooksFromSettings, stripRulesSection, removeAgentHooks, COMPONENTS } from '../lib/installer.js';
import { agentHasHooks, AGENTS, resolveAgents, emitRules } from '../lib/agents.js';
import { computeDesired } from '../lib/reconcile.js';
import { readGlobalManifest } from './init-global.js';

// specpipe's skill dir names (sp-*), derived from the kit's skill component list.
const GLOBAL_SKILL_NAMES = [...new Set(COMPONENTS.skills.map((p) => p.split('/')[1]))];

const PRESERVE = [
  '.claude/CLAUDE.md',
];

const PRESERVE_DIRS = [
  'docs/',
];

export async function removeGlobal({ dryRun = false } = {}) {
  log.info(dryRun ? 'Global remove — dry run (no changes):' : 'Removing global specpipe install...');
  log.blank();
  const would = (label) => log.del(dryRun ? `${label} (would remove)` : label);

  // Remove only specpipe's sp-* skill dirs from each globally-installed agent's
  // skills root — never the whole root (it may hold the agent's own / vendor skills,
  // e.g. Codex ships system skills under ~/.codex/skills/.system).
  const gm = await readGlobalManifest() || {};
  const globalAgents = gm.globalAgents || (gm.globalInstalled ? ['claude'] : ['claude']);
  for (const agent of globalAgents) {
    const root = AGENTS[agent]?.globalSkillRoot;
    if (!root) continue;
    let removed = 0;
    for (const name of GLOBAL_SKILL_NAMES) {
      const dir = join(homedir(), ...root.split('/'), name);
      if (existsSync(dir)) { if (!dryRun) await rm(dir, { recursive: true, force: true }); removed++; }
    }
    if (removed) would(`~/${root}/sp-* (${removed} skill${removed === 1 ? '' : 's'})`);
    else log.skip(`~/${root}/sp-* (none found)`);
    // Tidy up the skills root if specpipe was its only occupant; rmdir is a no-op
    // (throws) when other skills remain — e.g. Codex's ~/.codex/skills/.system.
    if (!dryRun) try { await rmdir(join(homedir(), ...root.split('/'))); } catch { /* not empty — keep */ }
  }

  // Remove ~/.claude/hooks/
  const globalHooksDir = join(homedir(), '.claude', 'hooks');
  if (existsSync(globalHooksDir)) {
    if (!dryRun) await rm(globalHooksDir, { recursive: true, force: true });
    would('~/.claude/hooks/');
  } else {
    log.skip('~/.claude/hooks/ (not found)');
  }

  // Legacy cleanup: older installs shipped ~/.claude/scripts/build-test.sh.
  // The script is no longer part of the kit — sweep up the orphan if present.
  const legacyScript = join(homedir(), '.claude', 'scripts', 'build-test.sh');
  if (existsSync(legacyScript)) {
    if (!dryRun) await unlink(legacyScript);
    would('~/.claude/scripts/build-test.sh (legacy)');
    if (!dryRun) try { await rmdir(join(homedir(), '.claude', 'scripts')); } catch { /* keep if other scripts */ }
  }

  // Remove devkit hook entries from ~/.claude/settings.json
  if (!dryRun) await removeGlobalHooksFromSettings();
  would('hook entries from ~/.claude/settings.json');

  // Remove global manifest
  const globalManifest = join(homedir(), '.claude', '.devkit-manifest.json');
  if (existsSync(globalManifest)) {
    if (!dryRun) await unlink(globalManifest);
    would('~/.claude/.devkit-manifest.json');
  }

  log.blank();
  log.pass(dryRun ? 'Dry run — nothing changed.' : 'Global install removed. Per-project installs are unaffected.');
  if (!dryRun) log.info('Run `specpipe init` in each project to restore per-project hooks.');
}

/**
 * Remove only the named agents, keeping the rest. A file is deleted only when no
 * remaining agent still wants it (reconcile against computeDesired), so shared
 * artifacts survive: .agents/skills/* stays while Codex OR Antigravity remains,
 * SPECPIPE-RULES.md stays while OpenClaw OR Hermes remains. Each removed agent's
 * merge-mode rules section (Claude → CLAUDE.md, Codex → AGENTS.md) and enforced
 * hook config are stripped/removed separately — those are unique per agent.
 */
async function removeAgentsPartial(targetDir, manifest, removeSet, remaining, dryRun) {
  const removedLabels = removeSet.map((a) => AGENTS[a]?.label || a).join(', ');
  const keptLabels = remaining.map((a) => AGENTS[a]?.label || a).join(', ');
  log.info(dryRun ? `Dry run — would remove ${removedLabels}, keep ${keptLabels}:` : `Removing ${removedLabels}; keeping ${keptLabels}.`);
  log.blank();

  const skillsSet = manifest.skills ? new Set(manifest.skills) : null;
  const desired = await computeDesired(remaining, skillsSet); // paths a remaining agent still needs
  const removedDirs = new Set();

  for (const file of Object.keys(manifest.files)) {
    if (PRESERVE.includes(file) || PRESERVE_DIRS.some((d) => file.startsWith(d))) { log.keep(file); continue; }
    if (desired.has(file)) {
      // Still owned by a remaining agent — keep, and reassign the owner so the
      // manifest stays accurate (the removed agent may have been the recorded owner).
      if (!dryRun) manifest.files[file].agent = desired.get(file).agent;
      continue;
    }
    const full = join(targetDir, file);
    if (existsSync(full)) {
      if (dryRun) { log.del(`${file} (would remove)`); }
      else { await unlink(full); log.del(file); delete manifest.files[file]; }
      let d = dirname(file);
      while (d && d !== '.' && d !== '/') { removedDirs.add(d); d = dirname(d); }
    } else if (!dryRun) {
      delete manifest.files[file];
    }
  }

  for (const agent of removeSet) {
    const r = emitRules(agent, '');
    if (r && r.mode === 'merge') {
      if (dryRun) log.del(`${r.path} (specpipe rules section — would strip)`);
      else if (await stripRulesSection(targetDir, r.path)) log.del(`${r.path} (specpipe rules section)`);
    }
    if (agentHasHooks(agent)) {
      if (dryRun) log.del(`${AGENTS[agent].label} enforced hooks (would remove)`);
      else await removeAgentHooks(agent, targetDir);
    }
  }

  if (!dryRun) {
    manifest.agents = remaining;
    await writeManifest(targetDir, manifest);
    for (const dir of [...removedDirs].sort((a, b) => b.split('/').length - a.split('/').length)) {
      try { await rmdir(join(targetDir, dir)); } catch { /* not empty or missing */ }
    }
  }

  log.blank();
  log.pass(dryRun ? `Dry run — would remove ${removedLabels}, keep ${keptLabels}.` : `Removed ${removedLabels}. Kept ${keptLabels}.`);
}

/** Remove everything specpipe installed in this project (all agents). */
async function removeAll(targetDir, manifest, dryRun) {
  log.info(dryRun ? 'Remove — dry run (no changes):' : 'Removing specpipe files...');
  log.blank();

  const removedDirs = new Set();

  // Remove tracked files (except preserved), across every agent's layout.
  for (const file of Object.keys(manifest.files)) {
    if (PRESERVE.includes(file) || PRESERVE_DIRS.some((dir) => file.startsWith(dir))) {
      log.keep(file);
      continue;
    }
    const fullPath = join(targetDir, file);
    if (existsSync(fullPath)) {
      if (dryRun) { log.del(`${file} (would remove)`); }
      else { await unlink(fullPath); log.del(file); }
      let d = dirname(file);
      while (d && d !== '.' && d !== '/') { removedDirs.add(d); d = dirname(d); }
    }
  }

  // Remove the manifest (new + legacy locations).
  for (const rel of [MANIFEST_FILE, LEGACY_MANIFEST_FILE]) {
    const p = join(targetDir, rel);
    if (existsSync(p)) {
      if (dryRun) { log.del(`${rel} (would remove)`); }
      else { await unlink(p); log.del(rel); }
      let d = dirname(rel);
      while (d && d !== '.' && d !== '/') { removedDirs.add(d); d = dirname(d); }
    }
  }

  // Rules live as a marked section in shared CLAUDE.md / AGENTS.md — strip just our
  // section, preserving the rest of the user's file (don't delete the whole file).
  for (const f of ['.claude/CLAUDE.md', 'AGENTS.md']) {
    if (dryRun) { if (existsSync(join(targetDir, f))) log.del(`${f} (specpipe rules section — would strip)`); }
    else if (await stripRulesSection(targetDir, f)) log.del(`${f} (specpipe rules section)`);
  }

  // Enforced hooks (Codex/Cursor/Antigravity) live outside the tracked file set — clean per agent.
  for (const agent of getAgents(manifest)) {
    if (agentHasHooks(agent) && !dryRun) await removeAgentHooks(agent, targetDir);
  }

  // Legacy: older installs placed build-test.sh under scripts/.
  removedDirs.add('scripts');

  // Remove now-empty directories, deepest first (preserves dirs with user content).
  if (!dryRun) {
    for (const dir of [...removedDirs].sort((a, b) => b.split('/').length - a.split('/').length)) {
      try { await rmdir(join(targetDir, dir)); } catch { /* not empty or missing */ }
    }
  }

  log.blank();
  log.pass(dryRun ? 'Dry run — nothing changed. CLAUDE.md and docs/ would be preserved.' : 'Removed. CLAUDE.md and docs/ preserved.');
}

export async function removeCommand(path, opts = {}) {
  const dryRun = !!opts.dryRun;

  if (opts.global) {
    await removeGlobal({ dryRun });
    return;
  }

  const targetDir = resolve(path);
  const manifest = await readManifest(targetDir);

  if (!manifest) {
    log.fail('No manifest found. Nothing to remove.');
    process.exit(1);
  }

  const installedAgents = getAgents(manifest);

  // Selective removal: drop only the named agents, keep the rest.
  if (opts.agents) {
    let requested;
    try { requested = resolveAgents(opts.agents); }
    catch (e) { log.fail(e.message); process.exit(1); }

    const removeSet = requested.filter((a) => installedAgents.includes(a));
    for (const a of requested.filter((a) => !installedAgents.includes(a))) {
      log.warn(`${AGENTS[a]?.label || a} is not installed here — skipping.`);
    }
    if (removeSet.length === 0) {
      log.fail('None of the requested agents are installed here. Nothing to remove.');
      process.exit(1);
    }
    const remaining = installedAgents.filter((a) => !removeSet.includes(a));
    if (remaining.length > 0) {
      await removeAgentsPartial(targetDir, manifest, removeSet, remaining, dryRun);
      return;
    }
    // Removing every installed agent — fall through to a full teardown.
  }

  await removeAll(targetDir, manifest, dryRun);
}
