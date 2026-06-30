import { resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { log } from '../lib/logger.js';
import { detectProject } from '../lib/detector.js';
import { writeManifest, createManifest, setFileEntry, readManifest, mergeAgents } from '../lib/manifest.js';
import { hashFile, hashContent } from '../lib/hasher.js';
import { readFile } from 'node:fs/promises';
import { computeDesired } from '../lib/reconcile.js';
import {
  getAllFiles, getFilesForComponents, installFile,
  setPermissions, fillTemplate,
  verifySettingsJson, COMPONENTS,
  getTemplateDir, installSkillForAgent, installAgentHooks, installAgentRules, resolveSkills, skillAllowed,
  pruneOrphans,
} from '../lib/installer.js';
import { resolveHooks } from '../lib/hooks.js';
import { AGENTS, parseSkillPath, resolveAgents } from '../lib/agents.js';
import { initMultiAgent } from './init-agents.js';
import { adoptExisting } from './init-adopt.js';
import { readGlobalManifest, writeGlobalManifest, initGlobal } from './init-global.js';


const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf-8'));

export async function initCommand(path, opts) {
  const targetDir = resolve(path);

  if (!existsSync(targetDir)) {
    log.fail(`Directory not found: ${targetDir}`);
    process.exit(1);
  }

  log.info(`specpipe v${pkg.version}`);
  log.info(`Target: ${targetDir}`);
  log.blank();

  // --- Interactive picker --- (TTY only, and only when no selection flags were
  // passed; -y / any of --global/--agents/--skills/--only/--adopt/--dry-run skips it)
  const wantsInteractive = process.stdin.isTTY && !opts.yes && !opts.global
    && !opts.agents && !opts.skills && !opts.only && !opts.adopt && !opts.dryRun;
  if (wantsInteractive) {
    const { runInteractiveInit } = await import('./init-interactive.js');
    const choice = await runInteractiveInit();
    if (!choice) return; // cancelled
    if (choice.scope === 'global') opts.global = true;
    opts.agents = choice.agents.join(',');
    if (choice.skills) opts.skills = choice.skills;
    if (choice.hooks) opts.hooks = choice.hooks;
  }

  // --- Global mode --- (honors --agents + --skills; defaults to claude + all skills)
  if (opts.global) {
    await initGlobal({
      agents: resolveAgents(opts.agents),
      skills: resolveSkills(opts.skills),
      hookSelection: resolveHooks(opts.hooks),
      force: opts.force,
      hooks: true,
    });
    return;
  }

  // --- Adopt mode ---
  if (opts.adopt) {
    await adoptExisting(targetDir);
    return;
  }

  // --- Prerequisites ---
  let warnings = 0;

  if (!commandExists('git')) {
    log.fail('Git not found — required');
    process.exit(1);
  }

  if (!commandExists('node')) {
    log.warn('Node.js not found — file-guard.js hook requires it');
    warnings++;
  }

  if (!existsSync(resolve(targetDir, '.git'))) {
    log.warn('Not a git repository. Some features need git.');
    warnings++;
  }

  // --- Multi-agent install (opt-in via --agents) ---
  if (opts.agents) {
    await initMultiAgent(targetDir, opts, warnings);
    return;
  }

  // --- Determine files to install ---
  let components = Object.keys(COMPONENTS);
  if (opts.only) {
    components = opts.only.split(',').map((c) => c.trim());
    const valid = Object.keys(COMPONENTS);
    for (const c of components) {
      if (!valid.includes(c)) {
        log.fail(`Unknown component: ${c}. Valid: ${valid.join(', ')}`);
        process.exit(1);
      }
    }
  }

  const skillsSet = resolveSkills(opts.skills);
  const hooksSet = resolveHooks(opts.hooks);
  const files = (opts.only ? getFilesForComponents(components) : getAllFiles())
    .filter((f) => skillAllowed(f, skillsSet));

  // --- Dry run ---
  if (opts.dryRun) {
    log.info('Dry run — no changes will be made');
    log.blank();
    for (const file of files) {
      const sk = parseSkillPath(file);
      const rel = sk ? AGENTS.claude.skillTarget(sk.skill, sk.inner) : file;
      const dst = resolve(targetDir, rel);
      if (existsSync(dst) && !opts.force) {
        log.skip(`${rel} (exists)`);
      } else {
        log.copy(`${rel} (would copy)`);
      }
    }
    return;
  }

  // --- Install files ---
  console.log('--- Installing ---');

  const manifest = createManifest(pkg.version, null, components);
  if (skillsSet) manifest.skills = [...skillsSet];
  if (hooksSet) manifest.hooks = [...hooksSet];
  let copied = 0;
  let skipped = 0;
  let identical = 0;

  for (const file of files) {
    // Skills are emitted through the Claude target (canonical skills/ → .claude/skills/);
    // hooks/config/docs are copied verbatim at their own path.
    const isSkill = !!parseSkillPath(file);
    let outPath = file;
    if (isSkill) {
      const { result, path } = await installSkillForAgent('claude', file, targetDir, { force: opts.force });
      outPath = path || file;
      if (result === 'copied') copied++;
      else if (result === 'identical') identical++;
      else skipped++;
    } else {
      const result = await installFile(file, targetDir, { force: opts.force });
      if (result === 'copied') copied++;
      else if (result === 'identical') identical++;
      else skipped++;
    }

    // Record in manifest (keyed by on-disk path; Claude emit is byte-identical to source).
    const kitHash = await hashFile(resolve(getTemplateDir(), file));
    let installedHash = kitHash;
    try {
      installedHash = await hashFile(resolve(targetDir, outPath));
    } catch { /* file might not exist if skipped */ }
    setFileEntry(manifest, outPath, kitHash, installedHash, { agent: 'claude', templateRel: file });
  }

  // Enforced guard hooks + generated .claude/settings.json — emitted from the hook
  // registry (not static files). Only when the hooks component is in scope.
  if (components.includes('hooks')) {
    await installAgentHooks('claude', targetDir, { force: opts.force, hooks: hooksSet });
  }

  // Claude's rules hub (CLAUDE.md) is a marked section emitted from the single rules
  // source. It's part of the 'config' component; --hooks none (option A) skips it too.
  const noGuards = hooksSet && hooksSet.size === 0;
  if (!noGuards && components.includes('config')) {
    await installAgentRules('claude', targetDir, { force: opts.force });
  }

  // Accumulate: keep agents installed by an earlier run so a plain `init` doesn't
  // orphan files from a prior `init --agents …`. Record their on-disk files too.
  const prior = await readManifest(targetDir);
  manifest.agents = mergeAgents(prior?.agents, ['claude']);
  for (const [relPath, d] of await computeDesired(manifest.agents.filter((a) => a !== 'claude'), skillsSet)) {
    if (manifest.files[relPath]) continue;
    try {
      const installedHash = hashContent(await readFile(resolve(targetDir, relPath), 'utf-8'));
      setFileEntry(manifest, relPath, d.kitHash, installedHash, { agent: d.agent, templateRel: d.templateRel });
    } catch { /* prior agent's file not on disk — don't record a phantom */ }
  }

  // Migration: drop predecessor files a prior manifest tracked but we no longer
  // install (mf-* / ap-* skills, renamed hooks) so an install over an old version
  // doesn't leave orphaned /mf-* commands beside the new /sp-* ones.
  if (prior?.files) {
    const n = await pruneOrphans(targetDir, prior.files, new Set(Object.keys(manifest.files)));
    if (n) log.info(`Migrated: removed ${n} superseded file(s) from a previous version.`);
  }

  // --- Permissions ---
  await setPermissions(targetDir);

  // --- Project detection ---
  log.blank();
  console.log('--- Detecting project ---');

  const projectInfo = detectProject(targetDir);
  if (projectInfo) {
    log.info(`Detected: ${projectInfo.lang} (${projectInfo.framework})`);
    log.info(`Source: ${projectInfo.srcDir} | Tests: ${projectInfo.testDir}`);
    manifest.projectType = { lang: projectInfo.lang, framework: projectInfo.framework };

    await fillTemplate(targetDir, projectInfo);
    log.info('Updated CLAUDE.md with project info');

    // Re-hash CLAUDE.md after template fill
    try {
      const claudeHash = await hashFile(resolve(targetDir, '.claude/CLAUDE.md'));
      if (manifest.files['.claude/CLAUDE.md']) {
        manifest.files['.claude/CLAUDE.md'].installedHash = claudeHash;
        manifest.files['.claude/CLAUDE.md'].customized = false; // Template fill is not "customization"
      }
    } catch { /* */ }
  } else {
    log.warn('Could not detect project type. Fill in CLAUDE.md manually.');
    warnings++;
  }

  // --- Write manifest ---
  await writeManifest(targetDir, manifest);

  // --- Verification ---
  log.blank();
  console.log('--- Verification ---');

  if (await verifySettingsJson(targetDir)) {
    log.pass('settings.json is valid JSON');
  } else {
    log.fail('settings.json is invalid JSON');
  }

  // --- Summary ---
  log.blank();
  console.log('=== Setup Complete ===');
  log.blank();
  console.log('Installed:');
  console.log('  .claude/CLAUDE.md          — rules hub (workflow + guardrails + project info)');
  console.log('  .claude/settings.json      — hook configuration');
  console.log('  .claude/hooks/             — 5 guards (shell, read, comment, glob, file)');
  console.log('  .claude/skills/            — sp-* skills (/sp-explore … /sp-commit, /sp-voices)');
  log.blank();
  const parts = [`${copied} copied`];
  if (identical > 0) parts.push(`${identical} identical`);
  if (skipped > 0) parts.push(`${skipped} conflicted (use --force to overwrite)`);
  console.log(`  ${parts.join(', ')}`);
  log.blank();
  console.log('Next steps:');
  console.log('  1. Review .claude/CLAUDE.md — ensure project info is correct');
  console.log('  2. Write your first spec:   docs/specs/<feature>.md');
  console.log('  3. Generate test plan:      /sp-plan docs/specs/<feature>.md');
  console.log('  4. Start coding + testing:  /sp-build');
  log.blank();

  if (warnings > 0) {
    console.log(`⚠ ${warnings} warning(s) above — review before proceeding.`);
  }

  // --- Global install prompt (first-time only; never on -y or non-TTY) ---
  if (!opts.global) {
    const globalMeta = await readGlobalManifest();
    if (globalMeta?.globalInstalled === undefined && process.stdin.isTTY && !opts.yes) {
      await promptGlobalInstall(opts);
    } else if (globalMeta?.globalInstalled === true) {
      // Auto-upgrade global on init for every agent previously installed globally,
      // preserving the skill selection recorded at global install time.
      await initGlobal({
        agents: globalMeta.globalAgents || ['claude'],
        skills: globalMeta.skills ? new Set(globalMeta.skills) : null,
        hookSelection: globalMeta.hooks ? new Set(globalMeta.hooks) : null,
        force: opts.force,
      });
    }
  }
}

async function promptGlobalInstall(opts) {
  log.blank();
  console.log('─── Global Install ───');
  console.log('');
  console.log('Skills and hooks are installed per-project by default.');
  console.log('You can install them globally so every project is covered without running init again.');
  console.log('');
  console.log('  ~/.claude/skills/   ← global skills (fallback when no per-project skills)');
  console.log('  ~/.claude/hooks/    ← global hooks  (active in all projects)');
  console.log('  .claude/skills/     ← per-project skills (takes precedence over global)');
  console.log('  .claude/hooks/      ← per-project hooks  (takes precedence over global)');
  console.log('');
  console.log('To revert global hooks back to per-project later:');
  console.log('  specpipe remove --global');
  console.log('  then: specpipe init  (in each project)');
  console.log('');
  console.log('RECOMMENDATION: Choose A if you work across many projects.');
  console.log('');

  const answer = await askGlobalInstall();

  if (answer === 'skills+hooks') {
    await initGlobal({ force: opts.force, hooks: true });
    await trackProjectPath(process.cwd());
  } else if (answer === 'skills') {
    await initGlobal({ force: opts.force, hooks: false });
    await trackProjectPath(process.cwd());
  } else if (answer === 'no') {
    await writeGlobalManifest({ globalInstalled: false, updatedAt: new Date().toISOString() });
    log.info('Skipping global install. Run `specpipe init --global` anytime.');
  }
  // 'later' = don't write anything, prompt again next time
}

async function askGlobalInstall() {
  const { createInterface } = await import('node:readline');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    console.log('A) Skills + Hooks globally  (recommended)');
    console.log('B) Skills only              (hooks stay per-project)');
    console.log('C) No — keep everything per-project');
    console.log('D) Ask me next time');
    console.log('');
    rl.question('Choice [A/B/C/D]: ', (answer) => {
      rl.close();
      const a = answer.trim().toUpperCase();
      if (a === 'A') resolve('skills+hooks');
      else if (a === 'B') resolve('skills');
      else if (a === 'C') resolve('no');
      else resolve('later');
    });
  });
}

async function trackProjectPath(projectPath) {
  const meta = await readGlobalManifest() || {};
  const projects = new Set(meta.projects || []);
  projects.add(projectPath);
  await writeGlobalManifest({ ...meta, projects: [...projects] });
}

function commandExists(cmd) {
  // `command -v` is a POSIX shell builtin and is unavailable under Windows
  // cmd.exe, where execSync runs. Use `where` on Windows, `command -v` elsewhere.
  const probe = process.platform === 'win32' ? `where ${cmd}` : `command -v ${cmd}`;
  try {
    execSync(probe, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
