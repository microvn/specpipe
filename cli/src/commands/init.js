import { resolve, join, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { log } from '../lib/logger.js';
import { detectProject } from '../lib/detector.js';
import { readManifest, writeManifest, createManifest, setFileEntry } from '../lib/manifest.js';
import { hashFile } from '../lib/hasher.js';
import { homedir } from 'node:os';
import { mkdir } from 'node:fs/promises';
import {
  getAllFiles, getFilesForComponents, installFile,
  ensurePlaceholderDir, setPermissions, fillTemplate,
  verifySettingsJson, PLACEHOLDER_DIRS, COMPONENTS,
  getTemplateDir, installSkillGlobal, getGlobalSkillsDir,
  installHookGlobal, getGlobalHooksDir, mergeGlobalSettings,
} from '../lib/installer.js';
import { readFile, writeFile } from 'node:fs/promises';

const GLOBAL_MANIFEST = join(homedir(), '.claude', '.devkit-manifest.json');

async function readGlobalManifest() {
  try {
    return JSON.parse(await readFile(GLOBAL_MANIFEST, 'utf-8'));
  } catch {
    return null;
  }
}

async function writeGlobalManifest(data) {
  await mkdir(join(homedir(), '.claude'), { recursive: true });
  await writeFile(GLOBAL_MANIFEST, JSON.stringify(data, null, 2) + '\n');
}

export async function initGlobal({ force = false, hooks = false } = {}) {
  const globalSkillsDir = getGlobalSkillsDir();
  await mkdir(globalSkillsDir, { recursive: true });

  const existing = await readGlobalManifest() || {};
  const globalFiles = existing.files || {};
  const updatedFiles = { ...globalFiles };

  log.blank();
  console.log('--- Installing global skills ---');

  let copied = 0; let skipped = 0; let identical = 0;
  for (const relPath of COMPONENTS.skills) {
    const { result, kitHash } = await installSkillGlobal(relPath, globalSkillsDir, { force, globalFiles });
    if (result === 'copied') copied++;
    else if (result === 'identical') identical++;
    else skipped++;
    if (result !== 'skipped') updatedFiles[relPath] = { kitHash };
  }

  const parts = [`${copied} copied`];
  if (identical > 0) parts.push(`${identical} identical`);
  if (skipped > 0) parts.push(`${skipped} customized (use --force to overwrite)`);
  log.pass(`Global skills: ${parts.join(', ')}`);
  log.info('Skills available in all projects via ~/.claude/skills/');

  // --- Global scripts ---
  const { getGlobalScriptsDir, installScriptGlobal } = await import('../lib/installer.js');
  const globalScriptsDir = getGlobalScriptsDir();
  await mkdir(globalScriptsDir, { recursive: true });

  log.blank();
  console.log('--- Installing global scripts ---');
  let sCopied = 0; let sSkipped = 0; let sIdentical = 0;
  for (const relPath of COMPONENTS.scripts) {
    const { result, kitHash } = await installScriptGlobal(relPath, globalScriptsDir, { force, globalFiles: existing.files || {} });
    if (result === 'copied') sCopied++;
    else if (result === 'identical') sIdentical++;
    else sSkipped++;
    if (result !== 'skipped') updatedFiles[relPath] = { kitHash };
  }
  const sParts = [`${sCopied} copied`];
  if (sIdentical > 0) sParts.push(`${sIdentical} identical`);
  if (sSkipped > 0) sParts.push(`${sSkipped} customized (use --force to overwrite)`);
  log.pass(`Global scripts: ${sParts.join(', ')}`);

  if (hooks) {
    await initGlobalHooks({ force, _globalFiles: updatedFiles, _skipManifestWrite: true });
  }

  await writeGlobalManifest({
    ...existing,
    globalInstalled: true,
    globalHooksInstalled: hooks || existing.globalHooksInstalled || false,
    files: updatedFiles,
    updatedAt: new Date().toISOString(),
  });
}

export async function initGlobalHooks({ force = false, _globalFiles, _skipManifestWrite = false } = {}) {
  const globalHooksDir = getGlobalHooksDir();
  await mkdir(globalHooksDir, { recursive: true });

  const existing = _skipManifestWrite ? null : (await readGlobalManifest() || {});
  const globalFiles = _globalFiles || existing?.files || {};
  const updatedFiles = { ...globalFiles };

  log.blank();
  console.log('--- Installing global hooks ---');

  let copied = 0; let skipped = 0; let identical = 0;
  for (const relPath of COMPONENTS.hooks) {
    const { result, kitHash } = await installHookGlobal(relPath, globalHooksDir, { force, globalFiles });
    if (result === 'copied') copied++;
    else if (result === 'identical') identical++;
    else skipped++;
    if (result !== 'skipped') updatedFiles[relPath] = { kitHash };
  }

  await mergeGlobalSettings(globalHooksDir);

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
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf-8'));

export async function initCommand(path, opts) {
  const targetDir = resolve(path);

  if (!existsSync(targetDir)) {
    log.fail(`Directory not found: ${targetDir}`);
    process.exit(1);
  }

  log.info(`claude-devkit v${pkg.version}`);
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
      const dst = resolve(targetDir, file);
      if (existsSync(dst) && !opts.force) {
        log.skip(`${file} (exists)`);
      } else {
        log.copy(`${file} (would copy)`);
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
    const result = await installFile(file, targetDir, { force: opts.force });
    if (result === 'copied') copied++;
    else if (result === 'identical') identical++;
    else skipped++;

    // Record in manifest
    const templatePath = resolve(getTemplateDir(), file);
    const installedPath = resolve(targetDir, file);
    const kitHash = await hashFile(templatePath);
    let installedHash = kitHash;
    try {
      installedHash = await hashFile(installedPath);
    } catch { /* file might not exist if skipped */ }
    setFileEntry(manifest, file, kitHash, installedHash);
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
  console.log('  .claude/skills/            — /mf-plan, /mf-challenge, /mf-build, /mf-fix, /mf-review, /mf-commit, /mf-voices');
  console.log('  scripts/build-test.sh      — Universal test runner');
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
  console.log('  3. Generate test plan:      /mf-plan docs/specs/<feature>.md');
  console.log('  4. Start coding + testing:  /mf-build');
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
  console.log('  claude-devkit remove --global');
  console.log('  then: claude-devkit init  (in each project)');
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
    log.info('Skipping global install. Run `claude-devkit init --global` anytime.');
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
    const installedPath = resolve(targetDir, file);
    const templatePath = resolve(getTemplateDir(), file);

    if (!existsSync(installedPath)) continue;

    const installedHash = await hashFile(installedPath);
    let kitHash;
    try {
      kitHash = await hashFile(templatePath);
    } catch {
      kitHash = installedHash; // Template doesn't exist, treat as matching
    }
    setFileEntry(manifest, file, kitHash, installedHash);
    log.adopt(file);
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
  try {
    execSync(`command -v ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
