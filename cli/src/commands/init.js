import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { log } from '../lib/logger.js';
import { detectProject } from '../lib/detector.js';
import { readManifest, writeManifest, createManifest, setFileEntry } from '../lib/manifest.js';
import { hashFile } from '../lib/hasher.js';
import {
  getAllFiles, getFilesForComponents, installFile,
  ensurePlaceholderDir, setPermissions, fillTemplate,
  verifySettingsJson, PLACEHOLDER_DIRS, COMPONENTS,
  getTemplateDir,
} from '../lib/installer.js';

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

  for (const file of files) {
    const result = await installFile(file, targetDir, { force: opts.force });
    if (result === 'copied') copied++;
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
  console.log('  .claude/commands/          — /plan, /test, /fix, /review, /commit, /challenge');
  console.log('  scripts/build-test.sh      — Universal test runner');
  console.log('  docs/WORKFLOW.md           — Workflow reference');
  log.blank();
  console.log(`  ${copied} files copied, ${skipped} skipped`);
  log.blank();
  console.log('Next steps:');
  console.log('  1. Review .claude/CLAUDE.md — ensure project info is correct');
  console.log('  2. Write your first spec:   docs/specs/<feature>.md');
  console.log('  3. Generate test plan:      /plan docs/specs/<feature>.md');
  console.log('  4. Start coding + testing:  /test');
  log.blank();

  if (warnings > 0) {
    console.log(`⚠ ${warnings} warning(s) above — review before proceeding.`);
  }
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
