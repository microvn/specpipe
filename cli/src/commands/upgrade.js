import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { copyFile as fsCopyFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { log } from '../lib/logger.js';
import { hashFile } from '../lib/hasher.js';
import { readManifest, writeManifest, setFileEntry, refreshCustomizationStatus } from '../lib/manifest.js';
import { getAllFiles, getTemplateDir, setPermissions } from '../lib/installer.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf-8'));

export async function upgradeCommand(path, opts) {
  const targetDir = resolve(path);
  const manifest = await readManifest(targetDir);

  if (!manifest) {
    log.fail('No manifest found. Run `claude-devkit init` first, or `claude-devkit init --adopt` to adopt existing files.');
    process.exit(1);
  }

  // Refresh customization status by re-hashing installed files
  await refreshCustomizationStatus(targetDir, manifest);

  log.info(`claude-devkit upgrade: ${manifest.version} → ${pkg.version}`);
  log.blank();

  if (opts.dryRun) {
    log.info('Dry run — no changes will be made');
    log.blank();
  }

  const templateDir = getTemplateDir();
  const allFiles = getAllFiles();

  let updated = 0;
  let skippedCustomized = 0;
  let added = 0;
  let unchanged = 0;

  for (const file of allFiles) {
    const templatePath = resolve(templateDir, file);
    const installedPath = resolve(targetDir, file);
    const currentKitHash = await hashFile(templatePath);
    const entry = manifest.files[file];

    if (!entry) {
      // New file in kit — install it
      if (!opts.dryRun) {
        await mkdir(dirname(installedPath), { recursive: true });
        await fsCopyFile(templatePath, installedPath);
        setFileEntry(manifest, file, currentKitHash, currentKitHash);
      }
      log.copy(`${file} (new)`);
      added++;
      continue;
    }

    const kitChanged = currentKitHash !== entry.kitHash;

    if (!kitChanged) {
      log.same(file);
      unchanged++;
      continue;
    }

    // Kit has changed
    if (entry.customized && !opts.force) {
      log.skip(`${file} (customized — use --force to overwrite)`);
      skippedCustomized++;
      continue;
    }

    // Kit changed, user hasn't customized (or --force) → update
    if (!opts.dryRun) {
      await mkdir(dirname(installedPath), { recursive: true });
      await fsCopyFile(templatePath, installedPath);
      setFileEntry(manifest, file, currentKitHash, currentKitHash);
    }
    log.copy(file);
    updated++;
  }

  // Check for files in manifest that no longer exist in kit
  for (const file of Object.keys(manifest.files)) {
    if (!allFiles.includes(file)) {
      log.warn(`${file} — no longer in kit (keeping)`);
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
  log.pass(`Updated ${updated}, added ${added}, unchanged ${unchanged}, skipped ${skippedCustomized} customized.`);

  if (skippedCustomized > 0) {
    log.warn(`${skippedCustomized} customized file(s) skipped. Run with --force to overwrite.`);
  }
}
