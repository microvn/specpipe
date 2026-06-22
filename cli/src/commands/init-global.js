import { join } from 'node:path';
import { homedir } from 'node:os';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { log } from '../lib/logger.js';
import {
  COMPONENTS, installSkillGlobal, getGlobalSkillsDir,
  installHookGlobal, getGlobalHooksDir, mergeGlobalSettings,
} from '../lib/installer.js';

// Global Claude install (~/.claude/skills + hooks) and its manifest.

const GLOBAL_MANIFEST = join(homedir(), '.claude', '.devkit-manifest.json');

export async function readGlobalManifest() {
  try {
    return JSON.parse(await readFile(GLOBAL_MANIFEST, 'utf-8'));
  } catch {
    return null;
  }
}

export async function writeGlobalManifest(data) {
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
