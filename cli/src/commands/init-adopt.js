import { resolve, dirname } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { log } from '../lib/logger.js';
import { detectProject } from '../lib/detector.js';
import { createManifest, writeManifest, setFileEntry } from '../lib/manifest.js';
import { hashFile } from '../lib/hasher.js';
import { getAllFiles, COMPONENTS, getTemplateDir } from '../lib/installer.js';
import { AGENTS, parseSkillPath } from '../lib/agents.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf-8'));

/**
 * Adopt existing kit files (migration from setup.sh).
 * Scans for existing files and generates a manifest without overwriting.
 */
export async function adoptExisting(targetDir) {
  log.info('Adopting existing kit files...');
  log.blank();

  const manifest = createManifest(pkg.version, null, Object.keys(COMPONENTS));
  let adopted = 0;

  for (const file of getAllFiles()) {
    // Skills live at the Claude output path (.claude/skills/) on disk; map from canonical skills/.
    const sk = parseSkillPath(file);
    const outRel = sk ? AGENTS.claude.skillTarget(sk.skill, sk.inner) : file;
    const installedPath = resolve(targetDir, outRel);

    if (!existsSync(installedPath)) continue;

    const installedHash = await hashFile(installedPath);
    let kitHash;
    try {
      kitHash = await hashFile(resolve(getTemplateDir(), file));
    } catch {
      kitHash = installedHash; // Template doesn't exist, treat as matching
    }
    setFileEntry(manifest, outRel, kitHash, installedHash, { agent: 'claude', templateRel: file });
    log.adopt(outRel);
    adopted++;
  }

  const projectInfo = detectProject(targetDir);
  if (projectInfo) {
    manifest.projectType = { lang: projectInfo.lang, framework: projectInfo.framework };
    log.info(`Detected: ${projectInfo.lang} (${projectInfo.framework})`);
  }

  await writeManifest(targetDir, manifest);
  log.blank();
  log.pass(`Manifest created for ${adopted} existing files. Future upgrades will work.`);
}
