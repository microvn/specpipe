import { resolve } from 'node:path';
import chalk from 'chalk';
import { log } from '../lib/logger.js';
import { readManifest, refreshCustomizationStatus } from '../lib/manifest.js';

export async function listCommand(path) {
  const targetDir = resolve(path);
  const manifest = await readManifest(targetDir);

  if (!manifest) {
    log.fail('No manifest found. Run `agentpipe init` first.');
    process.exit(1);
  }

  // Refresh hashes to get accurate customization status
  await refreshCustomizationStatus(targetDir, manifest);

  log.info(`agentpipe v${manifest.version} — installed ${manifest.installedAt.split('T')[0]}`);
  if (manifest.projectType) {
    log.info(`Project: ${manifest.projectType.lang} (${manifest.projectType.framework})`);
  }
  log.blank();

  // Table header
  const fileCol = 40;
  console.log(
    chalk.bold('File'.padEnd(fileCol)) + chalk.bold('Status')
  );
  console.log('─'.repeat(fileCol) + '  ' + '─'.repeat(12));

  let totalFiles = 0;
  let customized = 0;

  for (const [file, entry] of Object.entries(manifest.files)) {
    totalFiles++;
    let status;
    if (entry.installedHash === null) {
      status = chalk.red('deleted');
    } else if (entry.customized) {
      status = chalk.yellow('customized');
      customized++;
    } else {
      status = chalk.green('up-to-date');
    }
    console.log(file.padEnd(fileCol) + status);
  }

  log.blank();
  console.log(`${totalFiles} files | ${customized} customized`);
}
