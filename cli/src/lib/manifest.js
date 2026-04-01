import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { hashFile } from './hasher.js';

const MANIFEST_FILE = '.claude/.devkit-manifest.json';

/**
 * Read manifest from target directory.
 * @returns {object|null}
 */
export async function readManifest(targetDir) {
  try {
    const raw = await readFile(join(targetDir, MANIFEST_FILE), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Write manifest to target directory.
 */
export async function writeManifest(targetDir, manifest) {
  const filePath = join(targetDir, MANIFEST_FILE);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(manifest, null, 2) + '\n');
}

/**
 * Create a new empty manifest.
 */
export function createManifest(version, projectType, components) {
  const now = new Date().toISOString();
  return {
    version,
    installedAt: now,
    updatedAt: now,
    projectType: projectType || null,
    components: components || ['hooks', 'commands', 'scripts', 'docs'],
    files: {},
  };
}

/**
 * Add or update a file entry in the manifest.
 */
export function setFileEntry(manifest, relativePath, kitHash, installedHash) {
  manifest.files[relativePath] = {
    kitHash,
    installedHash: installedHash || kitHash,
    customized: installedHash ? installedHash !== kitHash : false,
  };
}

/**
 * Check if a file has been customized by the user.
 */
export function isCustomized(manifest, relativePath) {
  const entry = manifest?.files?.[relativePath];
  if (!entry) return false;
  return entry.customized;
}

/**
 * Refresh customization status by re-hashing installed files.
 */
export async function refreshCustomizationStatus(targetDir, manifest) {
  for (const [relativePath, entry] of Object.entries(manifest.files)) {
    try {
      const currentHash = await hashFile(join(targetDir, relativePath));
      entry.installedHash = currentHash;
      entry.customized = currentHash !== entry.kitHash;
    } catch {
      // File was deleted
      entry.installedHash = null;
      entry.customized = true;
    }
  }
}
