import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

/**
 * Compute SHA-256 hash of a file.
 * @param {string} filePath
 * @returns {Promise<string>} hex digest
 */
export async function hashFile(filePath) {
  const content = await readFile(filePath);
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Compute SHA-256 hash of a string/buffer.
 * @param {string|Buffer} content
 * @returns {string} hex digest
 */
export function hashContent(content) {
  return createHash('sha256').update(content).digest('hex');
}
