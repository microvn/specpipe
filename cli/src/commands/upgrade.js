import { resolve, dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { log } from '../lib/logger.js';
import { readManifest, writeManifest, setFileEntry, refreshCustomizationStatus, getAgents } from '../lib/manifest.js';
import { setPermissions, COMPONENTS, installSkillGlobal, getGlobalSkillsDir, installHookGlobal, getGlobalHooksDir, mergeGlobalSettings, installAgentRules, installAgentHooks } from '../lib/installer.js';
import { agentRulesMode, agentHasHooks } from '../lib/agents.js';
import { computeDesired } from '../lib/reconcile.js';
import { unlink } from 'node:fs/promises';

const GLOBAL_MANIFEST = join(homedir(), '.claude', '.devkit-manifest.json');

async function readGlobalManifest() {
  try { return JSON.parse(await readFile(GLOBAL_MANIFEST, 'utf-8')); } catch { return null; }
}
async function writeGlobalManifest(data) {
  await mkdir(join(homedir(), '.claude'), { recursive: true });
  await writeFile(GLOBAL_MANIFEST, JSON.stringify(data, null, 2) + '\n');
}

export async function upgradeGlobal({ force = false } = {}) {
  const globalSkillsDir = getGlobalSkillsDir();
  await mkdir(globalSkillsDir, { recursive: true });

  const meta = await readGlobalManifest() || {};
  const globalFiles = meta.files || {};
  const updatedFiles = { ...globalFiles };

  log.blank();
  console.log('--- Upgrading global skills ---');
  let updated = 0; let skipped = 0; let identical = 0;

  for (const relPath of COMPONENTS.skills) {
    const { result, kitHash } = await installSkillGlobal(relPath, globalSkillsDir, { force, globalFiles });
    if (result === 'copied') updated++;
    else if (result === 'identical') identical++;
    else skipped++;
    if (result !== 'skipped') updatedFiles[relPath] = { kitHash };
  }

  let skillParts = [`${updated} updated`, `${identical} unchanged`];
  if (skipped > 0) skillParts.push(`${skipped} customized (use --force to overwrite)`);
  log.pass(`Global skills: ${skillParts.join(', ')}`);

  // Upgrade hooks if previously installed globally
  if (meta.globalHooksInstalled) {
    const globalHooksDir = getGlobalHooksDir();
    await mkdir(globalHooksDir, { recursive: true });

    log.blank();
    console.log('--- Upgrading global hooks ---');
    let hUpdated = 0; let hSkipped = 0; let hIdentical = 0;

    for (const relPath of COMPONENTS.hooks) {
      const { result, kitHash } = await installHookGlobal(relPath, globalHooksDir, { force, globalFiles });
      if (result === 'copied') hUpdated++;
      else if (result === 'identical') hIdentical++;
      else hSkipped++;
      if (result !== 'skipped') updatedFiles[relPath] = { kitHash };
    }

    await mergeGlobalSettings(globalHooksDir);

    let hookParts = [`${hUpdated} updated`, `${hIdentical} unchanged`];
    if (hSkipped > 0) hookParts.push(`${hSkipped} customized (use --force to overwrite)`);
    log.pass(`Global hooks: ${hookParts.join(', ')}`);
  }

  await writeGlobalManifest({ ...meta, globalInstalled: true, files: updatedFiles, updatedAt: new Date().toISOString() });

  // Warn about per-project skills that shadow global
  const projects = meta.projects || [];
  const projectsWithSkills = projects.filter((p) => existsSync(join(p, '.claude/skills')));
  if (projectsWithSkills.length > 0) {
    log.blank();
    log.info(`Found per-project skills in ${projectsWithSkills.length} project(s):`);
    for (const p of projectsWithSkills) log.info(`  ${p}`);
    log.info('Per-project skills take precedence over global. Remove them to use global instead.');
    log.info('Run `specpipe remove <path>` in each project to remove per-project install.');
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf-8'));

export async function upgradeCommand(path, opts) {
  // --- Global mode ---
  if (opts.global) {
    await upgradeGlobal({ force: opts.force });
    return;
  }

  const targetDir = resolve(path);
  const manifest = await readManifest(targetDir);

  if (!manifest) {
    log.fail('No manifest found. Run `specpipe init` first, or `specpipe init --adopt` to adopt existing files.');
    process.exit(1);
  }

  // Refresh customization status by re-hashing installed files
  await refreshCustomizationStatus(targetDir, manifest);

  log.info(`specpipe upgrade: ${manifest.version} → ${pkg.version}`);
  log.blank();

  if (opts.dryRun) {
    log.info('Dry run — no changes will be made');
    log.blank();
  }

  // Desired installed state for every agent this project targets.
  const agents = getAgents(manifest);
  const desired = await computeDesired(agents);

  let updated = 0;
  let skippedCustomized = 0;
  let added = 0;
  let unchanged = 0;

  for (const [relPath, d] of desired) {
    const installedPath = resolve(targetDir, relPath);
    const entry = manifest.files[relPath];

    if (!entry) {
      // New file (new kit file, or an agent added since install) — install it.
      if (!opts.dryRun) {
        await mkdir(dirname(installedPath), { recursive: true });
        await writeFile(installedPath, d.content);
        setFileEntry(manifest, relPath, d.kitHash, d.kitHash, { agent: d.agent, templateRel: d.templateRel });
      }
      log.copy(`${relPath} (new)`);
      added++;
      continue;
    }

    if (d.kitHash === entry.kitHash) {
      log.same(relPath);
      unchanged++;
      continue;
    }

    if (entry.customized && !opts.force) {
      log.skip(`${relPath} (customized — use --force to overwrite)`);
      skippedCustomized++;
      continue;
    }

    // Kit changed, user hasn't customized (or --force) → update.
    if (!opts.dryRun) {
      await mkdir(dirname(installedPath), { recursive: true });
      await writeFile(installedPath, d.content);
      setFileEntry(manifest, relPath, d.kitHash, d.kitHash, { agent: d.agent, templateRel: d.templateRel });
    }
    log.copy(relPath);
    updated++;
  }

  // Remove files in manifest that are no longer desired (dropped kit file or agent).
  let removed = 0;
  for (const relPath of Object.keys(manifest.files)) {
    if (desired.has(relPath)) continue;
    const filePath = resolve(targetDir, relPath);
    if (!opts.dryRun) {
      try {
        await unlink(filePath);
        delete manifest.files[relPath];
        removed++;
        log.del(relPath);
      } catch {
        log.warn(`${relPath} — no longer in kit (could not delete)`);
      }
    } else {
      log.del(`${relPath} (would remove)`);
      removed++;
    }
  }

  // Refresh guardrails that aren't owned files: Codex's shared AGENTS.md section is
  // merged (not reconciled via computeDesired), so re-merge it here to pick up kit
  // changes. Owned rule files were already handled by the reconcile loop above.
  if (!opts.dryRun) {
    for (const agent of agents) {
      if (agentRulesMode(agent) === 'agents-md') await installAgentRules(agent, targetDir, { force: opts.force });
      if (agentHasHooks(agent)) await installAgentHooks(agent, targetDir, { force: opts.force });
    }
  }

  // Update manifest
  if (!opts.dryRun) {
    manifest.version = pkg.version;
    manifest.updatedAt = new Date().toISOString();
    await setPermissions(targetDir);
    await writeManifest(targetDir, manifest);
  }

  // Summary
  log.blank();
  const parts = [`Updated ${updated}`, `added ${added}`, `removed ${removed}`, `unchanged ${unchanged}`];
  if (skippedCustomized > 0) parts.push(`skipped ${skippedCustomized} customized`);
  log.pass(parts.join(', ') + '.');

  if (skippedCustomized > 0) {
    log.warn(`${skippedCustomized} customized file(s) skipped. Run with --force to overwrite.`);
  }

  // --- Auto-upgrade global if previously installed ---
  const globalMeta = await readGlobalManifest();
  if (globalMeta?.globalInstalled === true) {
    await upgradeGlobal({ force: opts.force });
  }
}
