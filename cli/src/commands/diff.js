import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import chalk from 'chalk';
import { log } from '../lib/logger.js';
import { readManifest, getAgents } from '../lib/manifest.js';
import { hashContent } from '../lib/hasher.js';
import { computeDesired } from '../lib/reconcile.js';

export async function diffCommand(path) {
  const targetDir = resolve(path);
  const manifest = await readManifest(targetDir);

  if (!manifest) {
    log.fail('No manifest found. Run `agentpipe init` first.');
    process.exit(1);
  }

  const desired = await computeDesired(getAgents(manifest));
  let hasDiffs = false;

  for (const [file, d] of desired) {
    const installedPath = resolve(targetDir, file);

    if (!existsSync(installedPath)) {
      // File in kit but not installed
      console.log(chalk.cyan(`\n${file} (new in kit — not installed)`));
      hasDiffs = true;
      continue;
    }

    const installedContent = await readFile(installedPath, 'utf-8');
    if (hashContent(installedContent) === d.kitHash) continue;

    hasDiffs = true;

    // Check if kit changed or user changed
    const entry = manifest.files[file];
    const kitChanged = entry && d.kitHash !== entry.kitHash;
    const userChanged = entry && entry.customized;

    let label = '';
    if (kitChanged && userChanged) label = 'both kit and local changed';
    else if (kitChanged) label = 'kit updated';
    else if (userChanged) label = 'locally customized';
    else label = 'differs';

    console.log(chalk.bold(`\n${file}`) + chalk.gray(` (${label})`));
    console.log('─'.repeat(60));

    // Simple line-by-line diff (desired kit content vs installed)
    const kitLines = d.content.split('\n');
    const installedLines = installedContent.split('\n');

    // Show a simplified diff: lines only in kit (green +), only in installed (red -)
    const kitSet = new Set(kitLines);
    const installedSet = new Set(installedLines);

    const removed = installedLines.filter((l) => !kitSet.has(l) && l.trim());
    const added = kitLines.filter((l) => !installedSet.has(l) && l.trim());

    for (const line of removed.slice(0, 10)) {
      console.log(chalk.red(`  - ${line}`));
    }
    for (const line of added.slice(0, 10)) {
      console.log(chalk.green(`  + ${line}`));
    }
    if (removed.length > 10 || added.length > 10) {
      console.log(chalk.gray(`  ... and ${Math.max(removed.length - 10, 0) + Math.max(added.length - 10, 0)} more lines`));
    }
  }

  // Check for files in manifest no longer desired (removed from kit / agent)
  for (const file of Object.keys(manifest.files)) {
    if (!desired.has(file)) {
      console.log(chalk.yellow(`\n${file} (removed from kit)`));
      hasDiffs = true;
    }
  }

  if (!hasDiffs) {
    log.pass('All files match the kit. No differences.');
  }
}
