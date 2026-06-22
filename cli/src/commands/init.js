import { resolve, join, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { log } from '../lib/logger.js';
import { detectProject } from '../lib/detector.js';
import { writeManifest, createManifest, setFileEntry } from '../lib/manifest.js';
import { hashFile } from '../lib/hasher.js';
import {
  getAllFiles, getFilesForComponents, installFile,
  ensurePlaceholderDir, setPermissions, fillTemplate,
  verifySettingsJson, PLACEHOLDER_DIRS, COMPONENTS,
  getTemplateDir, installSkillForAgent,
} from '../lib/installer.js';
import { AGENTS, parseSkillPath } from '../lib/agents.js';
import { initMultiAgent } from './init-agents.js';
import { readGlobalManifest, writeGlobalManifest, initGlobal } from './init-global.js';


const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf-8'));

export async function initCommand(path, opts) {
  const targetDir = resolve(path);

  if (!existsSync(targetDir)) {
    log.fail(`Directory not found: ${targetDir}`);
    process.exit(1);
  }

  log.info(`agentpipe v${pkg.version}`);
  log.info(`Target: ${targetDir}`);
  log.blank();

  // --- Global mode ---
  if (opts.global) {
    await initGlobal({ force: opts.force, hooks: true });
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

  const files = opts.only ? getFilesForComponents(components) : getAllFiles();

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

  // Placeholder directories
  for (const dir of PLACEHOLDER_DIRS) {
    await ensurePlaceholderDir(dir, targetDir);
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
  console.log('  .claude/CLAUDE.md          — Project rules (review and customize)');
  console.log('  .claude/settings.json      — Hook configuration');
  console.log('  .claude/hooks/             — 6 guards (file, path, glob, comment, sensitive, self-review)');
  console.log('  .claude/skills/            — /ap-plan, /ap-challenge, /ap-build, /ap-fix, /ap-review, /ap-commit, /ap-voices');
  console.log('  docs/WORKFLOW.md           — Workflow reference');
  log.blank();
  const parts = [`${copied} copied`];
  if (identical > 0) parts.push(`${identical} identical`);
  if (skipped > 0) parts.push(`${skipped} conflicted (use --force to overwrite)`);
  console.log(`  ${parts.join(', ')}`);
  log.blank();
  console.log('Next steps:');
  console.log('  1. Review .claude/CLAUDE.md — ensure project info is correct');
  console.log('  2. Write your first spec:   docs/specs/<feature>.md');
  console.log('  3. Generate test plan:      /ap-plan docs/specs/<feature>.md');
  console.log('  4. Start coding + testing:  /ap-build');
  log.blank();

  if (warnings > 0) {
    console.log(`⚠ ${warnings} warning(s) above — review before proceeding.`);
  }

  // --- Global install prompt (first-time only) ---
  if (!opts.global) {
    const globalMeta = await readGlobalManifest();
    if (globalMeta?.globalInstalled === undefined) {
      await promptGlobalInstall(opts);
    } else if (globalMeta?.globalInstalled === true) {
      // Auto-upgrade global on init if previously installed
      await initGlobal({ force: opts.force });
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
  console.log('  agentpipe remove --global');
  console.log('  then: agentpipe init  (in each project)');
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
    log.info('Skipping global install. Run `agentpipe init --global` anytime.');
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

/**
 * Adopt existing kit files (migration from setup.sh).
 * Scans for existing files and generates a manifest without overwriting.
 */
async function adoptExisting(targetDir) {
  log.info('Adopting existing kit files...');
  log.blank();

  const allFiles = getAllFiles();
  const manifest = createManifest(pkg.version, null, Object.keys(COMPONENTS));
  let adopted = 0;

  for (const file of allFiles) {
    // Skills live at the Claude output path (.claude/skills/) on disk; map from canonical skills/.
    const sk = parseSkillPath(file);
    const outRel = sk ? AGENTS.claude.skillTarget(sk.skill, sk.inner) : file;
    const installedPath = resolve(targetDir, outRel);
    const templatePath = resolve(getTemplateDir(), file);

    if (!existsSync(installedPath)) continue;

    const installedHash = await hashFile(installedPath);
    let kitHash;
    try {
      kitHash = await hashFile(templatePath);
    } catch {
      kitHash = installedHash; // Template doesn't exist, treat as matching
    }
    setFileEntry(manifest, outRel, kitHash, installedHash, { agent: 'claude', templateRel: file });
    log.adopt(outRel);
    adopted++;
  }

  // Detect project
  const projectInfo = detectProject(targetDir);
  if (projectInfo) {
    manifest.projectType = { lang: projectInfo.lang, framework: projectInfo.framework };
    log.info(`Detected: ${projectInfo.lang} (${projectInfo.framework})`);
  }

  await writeManifest(targetDir, manifest);
  log.blank();
  log.pass(`Manifest created for ${adopted} existing files. Future upgrades will work.`);
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
