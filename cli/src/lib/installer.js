import { copyFile as fsCopyFile, mkdir, readFile, writeFile, access, constants } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chmod } from 'node:fs/promises';
import { log } from './logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Component → file mappings.
 */
export const COMPONENTS = {
  hooks: [
    '.claude/hooks/file-guard.js',
    '.claude/hooks/path-guard.sh',
    '.claude/hooks/comment-guard.js',
    '.claude/hooks/glob-guard.js',
    '.claude/hooks/self-review.sh',
    '.claude/hooks/sensitive-guard.sh',
  ],
  commands: [
    '.claude/commands/plan.md',
    '.claude/commands/challenge.md',
    '.claude/commands/test.md',
    '.claude/commands/fix.md',
    '.claude/commands/review.md',
    '.claude/commands/commit.md',
  ],
  config: [
    '.claude/settings.json',
    '.claude/CLAUDE.md',
  ],
  scripts: [
    'scripts/build-test.sh',
  ],
  docs: [
    'docs/WORKFLOW.md',
  ],
};

/**
 * Placeholder directories to create.
 */
export const PLACEHOLDER_DIRS = [
  'docs/specs',
  'docs/test-plans',
];

/**
 * Files that need +x permission.
 */
export const EXECUTABLE_FILES = [
  'scripts/build-test.sh',
  '.claude/hooks/path-guard.sh',
  '.claude/hooks/self-review.sh',
  '.claude/hooks/sensitive-guard.sh',
];

/**
 * Get path to kit (templates) directory.
 * Published package: cli/templates/  |  Dev mode: ../kit/
 */
export function getTemplateDir() {
  const bundled = resolve(__dirname, '../../templates');
  if (existsSync(bundled)) return bundled;
  return resolve(__dirname, '../../../kit');
}

/**
 * Get all files for the given component list.
 * @param {string[]} components - e.g. ['hooks', 'commands']
 * @returns {string[]} relative file paths
 */
export function getFilesForComponents(components) {
  const files = [];
  for (const comp of components) {
    if (COMPONENTS[comp]) {
      files.push(...COMPONENTS[comp]);
    }
  }
  return files;
}

/**
 * Get all installable files (all components).
 */
export function getAllFiles() {
  return Object.values(COMPONENTS).flat();
}

/**
 * Copy a single file from templates to target.
 * @returns {string} 'copied' | 'skipped'
 */
export async function installFile(relativePath, targetDir, { force = false } = {}) {
  const src = join(getTemplateDir(), relativePath);
  const dst = join(targetDir, relativePath);

  if (existsSync(dst) && !force) {
    log.skip(`${relativePath} (exists, use --force to overwrite)`);
    return 'skipped';
  }

  await mkdir(dirname(dst), { recursive: true });
  await fsCopyFile(src, dst);
  log.copy(relativePath);
  return 'copied';
}

/**
 * Create a placeholder directory with .gitkeep.
 */
export async function ensurePlaceholderDir(dir, targetDir) {
  const fullPath = join(targetDir, dir);
  if (existsSync(fullPath)) {
    log.skip(`${dir}/ (exists)`);
    return;
  }
  await mkdir(fullPath, { recursive: true });
  await writeFile(join(fullPath, '.gitkeep'), '');
  log.make(`${dir}/`);
}

/**
 * Set executable permissions on relevant files.
 */
export async function setPermissions(targetDir) {
  for (const file of EXECUTABLE_FILES) {
    const fullPath = join(targetDir, file);
    try {
      await chmod(fullPath, 0o755);
    } catch {
      // File might not exist if component not installed
    }
  }
}

/**
 * Fill [CUSTOMIZE] placeholders in CLAUDE.md with detected project info.
 */
export async function fillTemplate(targetDir, projectInfo) {
  if (!projectInfo) return;

  const claudeMdPath = join(targetDir, '.claude/CLAUDE.md');
  try {
    let content = await readFile(claudeMdPath, 'utf-8');
    content = content
      .replace(/\[CUSTOMIZE\] Language:.*/, `**Language:** ${projectInfo.lang}`)
      .replace(/\[CUSTOMIZE\] Test framework:.*/, `**Test framework:** ${projectInfo.framework}`)
      .replace(/\[CUSTOMIZE\] Source directory:.*/, `**Source directory:** ${projectInfo.srcDir}`)
      .replace(/\[CUSTOMIZE\] Test directory:.*/, `**Test directory:** ${projectInfo.testDir}`)
      // Also handle the format without [CUSTOMIZE] prefix
      .replace(/\*\*Language:\*\* \[CUSTOMIZE\]/, `**Language:** ${projectInfo.lang}`)
      .replace(/\*\*Test framework:\*\* \[CUSTOMIZE\]/, `**Test framework:** ${projectInfo.framework}`)
      .replace(/\*\*Source directory:\*\* \[CUSTOMIZE\]/, `**Source directory:** ${projectInfo.srcDir}`)
      .replace(/\*\*Test directory:\*\* \[CUSTOMIZE\]/, `**Test directory:** ${projectInfo.testDir}`);
    await writeFile(claudeMdPath, content);
  } catch {
    // CLAUDE.md might not exist
  }
}

/**
 * Verify settings.json is valid JSON.
 */
export async function verifySettingsJson(targetDir) {
  try {
    const raw = await readFile(join(targetDir, '.claude/settings.json'), 'utf-8');
    JSON.parse(raw);
    return true;
  } catch {
    return false;
  }
}
