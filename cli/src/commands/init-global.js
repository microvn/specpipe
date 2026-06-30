import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { mkdir, readFile, writeFile, unlink, rmdir } from 'node:fs/promises';
import { log } from '../lib/logger.js';
import {
  COMPONENTS, installSkillGlobalForAgent, skillAllowed,
  installHookGlobal, getGlobalHooksDir, mergeGlobalSettings,
} from '../lib/installer.js';
import { AGENTS } from '../lib/agents.js';
import { hookScriptsFor } from '../lib/hooks.js';

// Global install. Skills go per-agent into each agent's user-level dir (Claude
// ~/.claude/skills, Codex ~/.codex/skills, …). Global hooks remain Claude-only —
// Claude Code's native enforcement engine; other agents enforce per-project.

const GLOBAL_MANIFEST = join(homedir(), '.claude', '.devkit-manifest.json');

/** Which agent a home-relative global key belongs to, by its skill-root prefix. */
function ownerFromGlobalKey(key) {
  for (const [id, a] of Object.entries(AGENTS)) {
    if (a.globalSkillRoot && key.startsWith(a.globalSkillRoot + '/')) return id;
  }
  return null;
}

export async function readGlobalManifest() {
  try {
    return JSON.parse(await readFile(GLOBAL_MANIFEST, 'utf-8'));
  } catch {
    return null;
  }
}

export async function writeGlobalManifest(data) {
  await mkdir(join(homedir(), '.claude'), { recursive: true });
  await writeFile(GLOBAL_MANIFEST, JSON.stringify(data, null, 2) + '\n');
}

export async function initGlobal({ agents = ['claude'], skills = null, hookSelection = null, force = false, hooks = false } = {}) {
  const existing = await readGlobalManifest() || {};
  const globalFiles = existing.files || {};
  const updatedFiles = { ...globalFiles };
  const installedAgents = new Set(existing.globalAgents || (existing.globalInstalled ? ['claude'] : []));
  const installedKeys = new Set(); // every file present after this run (for orphan pruning)

  for (const agent of agents) {
    const { label, globalSkillRoot } = AGENTS[agent];
    if (!globalSkillRoot) {
      // Cursor has no user-level skills dir; it reads ~/.claude/skills & ~/.codex/skills.
      log.blank();
      log.warn(`${label}: no user-level skills directory — install Claude or Codex globally and ${label} reads those. Skipping its global install.`);
      continue;
    }
    log.blank();
    console.log(`--- Installing global skills: ${label} (~/${globalSkillRoot}/) ---`);

    let copied = 0; let skipped = 0; let identical = 0;
    for (const relPath of COMPONENTS.skills) {
      if (!skillAllowed(relPath, skills)) continue;
      const r = await installSkillGlobalForAgent(agent, relPath, { force, globalFiles });
      if (!r) continue;
      if (r.result === 'copied') copied++;
      else if (r.result === 'identical') identical++;
      else skipped++;
      installedKeys.add(r.key);
      updatedFiles[r.key] = { kitHash: r.kitHash, agent };
    }

    const parts = [`${copied} copied`];
    if (identical > 0) parts.push(`${identical} identical`);
    if (skipped > 0) parts.push(`${skipped} customized (use --force to overwrite)`);
    log.pass(`${label} global skills: ${parts.join(', ')} — available in all projects.`);
    installedAgents.add(agent);
  }

  // Global hooks are Claude-only (its native enforcement engine).
  const wantHooks = hooks && agents.includes('claude');
  if (wantHooks) {
    const { keys: hookKeys, entries: hookEntries } = await initGlobalHooks({ force, hooks: hookSelection, _globalFiles: updatedFiles, _skipManifestWrite: true });
    for (const k of hookKeys) installedKeys.add(k);
    Object.assign(updatedFiles, hookEntries); // persist hook kitHashes in the global manifest
  }

  // Prune orphans: files from a previous global install that are no longer desired
  // (a removed/renamed hook like self-review.sh, or a deselected skill), but only
  // within the scopes we just refreshed — never touch an agent we didn't reinstall.
  let pruned = 0;
  const prunedDirs = new Set();
  for (const [key, entry] of Object.entries(globalFiles)) {
    if (installedKeys.has(key)) continue;
    const isHook = key.startsWith('.claude/hooks/');
    // Legacy claude-devkit / agentpipe manifests recorded skills with NO `agent` field;
    // derive the owner from the key's global-skill-root prefix (e.g. .claude/skills/ →
    // claude) so those predecessor mf-*/ap-* skills get pruned, not silently skipped.
    const owner = entry.agent || (isHook ? 'claude' : ownerFromGlobalKey(key));
    const inScope = isHook ? wantHooks : (owner && agents.includes(owner));
    if (!inScope) continue;
    const abs = join(homedir(), ...key.split('/'));
    try {
      await unlink(abs);
      log.del(`~/${key} (no longer in kit)`);
    } catch { /* already gone */ }
    delete updatedFiles[key];
    prunedDirs.add(dirname(abs));
    pruned++;
  }
  // Remove dirs left empty by pruning (deepest first; rmdir no-ops on non-empty).
  for (let d of [...prunedDirs].sort((a, b) => b.length - a.length)) {
    while (d.startsWith(homedir()) && d !== homedir()) {
      try { await rmdir(d); } catch { break; }
      d = dirname(d);
    }
  }
  if (pruned) log.info(`Pruned ${pruned} stale global file(s).`);

  // Legacy migration: older claude-devkit installs left ~/.claude/scripts/build-test.sh
  // (no longer in the kit, untracked by the manifest). Sweep it up on install too —
  // not just on remove — so upgrading from the old tool leaves nothing behind.
  if (wantHooks) {
    const legacyScript = join(homedir(), '.claude', 'scripts', 'build-test.sh');
    try {
      await unlink(legacyScript);
      log.del('~/.claude/scripts/build-test.sh (legacy)');
      try { await rmdir(join(homedir(), '.claude', 'scripts')); } catch { /* keep if other scripts */ }
    } catch { /* not present — fine */ }
  }

  await writeGlobalManifest({
    ...existing,
    globalInstalled: installedAgents.has('claude') || existing.globalInstalled || false,
    globalAgents: [...installedAgents],
    skills: skills ? [...skills] : existing.skills,
    hooks: hookSelection ? [...hookSelection] : existing.hooks,
    globalHooksInstalled: wantHooks || existing.globalHooksInstalled || false,
    files: updatedFiles,
    updatedAt: new Date().toISOString(),
  });
}

export async function initGlobalHooks({ force = false, hooks = null, _globalFiles, _skipManifestWrite = false } = {}) {
  const globalHooksDir = getGlobalHooksDir();
  await mkdir(globalHooksDir, { recursive: true });

  const existing = _skipManifestWrite ? null : (await readGlobalManifest() || {});
  const globalFiles = _globalFiles || existing?.files || {};
  const updatedFiles = { ...globalFiles };
  const keys = []; // home-relative keys installed this run (for the caller's orphan-prune)
  const entries = {}; // kitHash entries written this run — the caller persists these so
                      // hooks are TRACKED (else savedKitHash is always undefined → every
                      // version bump looks "customized" and stale hooks never auto-update)

  log.blank();
  console.log('--- Installing global hooks ---');

  let copied = 0; let skipped = 0; let identical = 0;
  for (const s of hookScriptsFor('claude', globalHooksDir, hooks)) {
    const base = s.src.split('/').pop();
    const key = `.claude/hooks/${base}`;
    const { result, kitHash } = await installHookGlobal(s.src, globalHooksDir, { force, globalFiles, key });
    if (result === 'copied') copied++;
    else if (result === 'identical') identical++;
    else skipped++;
    if (result !== 'skipped') { updatedFiles[key] = { kitHash }; entries[key] = { kitHash }; }
    keys.push(key);
  }

  await mergeGlobalSettings(globalHooksDir, hooks);

  const parts = [`${copied} copied`];
  if (identical > 0) parts.push(`${identical} identical`);
  if (skipped > 0) parts.push(`${skipped} customized (use --force to overwrite)`);
  log.pass(`Global hooks: ${parts.join(', ')}`);
  log.info('Hooks registered in ~/.claude/settings.json — active in all projects');

  if (!_skipManifestWrite) {
    await writeGlobalManifest({
      ...existing,
      globalHooksInstalled: true,
      files: updatedFiles,
      updatedAt: new Date().toISOString(),
    });
  }
  return { keys, entries };
}
