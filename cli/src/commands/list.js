import { resolve } from 'node:path';
import chalk from 'chalk';
import { log } from '../lib/logger.js';
import { readManifest, refreshCustomizationStatus, getAgents } from '../lib/manifest.js';
import { AGENTS } from '../lib/agents.js';

export async function listCommand(path) {
  const targetDir = resolve(path);
  const manifest = await readManifest(targetDir);

  if (!manifest) {
    log.fail('No manifest found. Run `agentpipe init` first.');
    process.exit(1);
  }

  // Refresh hashes to get accurate customization status
  await refreshCustomizationStatus(targetDir, manifest);

  const agents = getAgents(manifest);
  log.info(`agentpipe v${manifest.version} — installed ${manifest.installedAt.split('T')[0]}`);
  if (manifest.projectType) {
    log.info(`Project: ${manifest.projectType.lang} (${manifest.projectType.framework})`);
  }
  log.info(`Agents: ${agents.map((a) => AGENTS[a]?.label || a).join(', ')}`);
  log.blank();

  // Group files by the agent that produced them.
  const byAgent = {};
  for (const [file, entry] of Object.entries(manifest.files)) {
    const a = entry.agent || 'claude';
    (byAgent[a] ||= []).push([file, entry]);
  }

  const fileCol = 44;
  let totalFiles = 0;
  let customized = 0;

  for (const agent of Object.keys(byAgent)) {
    const meta = AGENTS[agent];
    const hookNote = meta && meta.hooks !== 'native' ? chalk.gray(' (guards as advisory rules)') : '';
    console.log(chalk.bold(`${meta?.label || agent}`) + hookNote);
    for (const [file, entry] of byAgent[agent].sort((a, b) => a[0].localeCompare(b[0]))) {
      totalFiles++;
      let status;
      if (entry.installedHash === null) status = chalk.red('deleted');
      else if (entry.customized) { status = chalk.yellow('customized'); customized++; }
      else status = chalk.green('up-to-date');
      console.log('  ' + file.padEnd(fileCol) + status);
    }
    log.blank();
  }

  console.log(`${totalFiles} files | ${customized} customized | ${agents.length} agent(s)`);
}
