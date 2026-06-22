import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { log } from '../lib/logger.js';
import { readManifest } from '../lib/manifest.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf-8'));

export async function checkCommand(path) {
  const targetDir = resolve(path);
  const manifest = await readManifest(targetDir);

  if (!manifest) {
    log.fail('No manifest found. Run `agentpipe init` first.');
    process.exit(1);
  }

  const installed = manifest.version;
  const latest = pkg.version;

  log.info(`Installed: ${installed}`);
  log.info(`Latest:    ${latest}`);
  log.blank();

  if (installed === latest) {
    log.pass('Up to date.');
  } else {
    log.warn(`Update available: ${installed} → ${latest}`);
    console.log('Run: npx agentpipe upgrade');
  }
}
