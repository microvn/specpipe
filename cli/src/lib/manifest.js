import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { hashFile } from './hasher.js';

// Neutral, agent-agnostic location. Older installs used .claude/ — still read
// as a fallback so existing projects migrate on their next write.
export const MANIFEST_FILE = '.agentpipe/manifest.json';
export const LEGACY_MANIFEST_FILE = '.claude/.devkit-manifest.json';

/**
 * Read manifest from target directory (new location, then legacy fallback).
 * @returns {object|null}
 */
export async function readManifest(targetDir) {
  for (const rel of [MANIFEST_FILE, LEGACY_MANIFEST_FILE]) {
    try {
      return JSON.parse(await readFile(join(targetDir, rel), 'utf-8'));
    } catch { /* try next */ }
  }
  return null;
}

/**
 * Write manifest to target directory (always to the new neutral location).
 */
export async function writeManifest(targetDir, manifest) {
  const filePath = join(targetDir, MANIFEST_FILE);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(manifest, null, 2) + '\n');
}

/** Agents recorded in a manifest, defaulting to Claude for legacy installs. */
export function getAgents(manifest) {
  return manifest?.agents?.length ? manifest.agents : ['claude'];
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
    components: components || ['hooks', 'skills', 'scripts', 'docs'],
    agents: ['claude'],
    files: {},
  };
}

/**
 * Add or update a file entry in the manifest.
 * `installedPath` is the on-disk key. `agent`/`templateRel` let lifecycle
 * commands reproduce the file's desired content (default: Claude, verbatim).
 */
export function setFileEntry(manifest, installedPath, kitHash, installedHash, { agent = 'claude', templateRel } = {}) {
  manifest.files[installedPath] = {
    agent,
    templateRel: templateRel || installedPath,
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
