// SHA-256 helpers shared by the arena and the submission tools.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const sha256 = data => createHash('sha256').update(data).digest('hex');
export const sha256File = f => sha256(readFileSync(f));
const walk = d => readdirSync(d).flatMap(f => { const p = resolve(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });

/** { 'relative/path': sha256 } for every file of the given files/folders (relative to the repo root). */
export function hashTree(paths) {
  const files = paths.map(p => resolve(root, p)).filter(existsSync).flatMap(p => statSync(p).isDirectory() ? walk(p) : [p])
    .filter(f => !f.endsWith('.DS_Store')).sort();
  return Object.fromEntries(files.map(f => [relative(root, f).split('\\').join('/'), sha256File(f)]));
}

/** The arena itself: the files that decide the outcome of a game. */
export const ARENA_FILES = ['core/rules.mjs', 'arena/game.mjs', 'arena/run.mjs', 'arena/registry.mjs', 'arena/stats.mjs'];

/** Match seed from the submitted commitments: nobody knows it before every hash is in, nobody controls it alone. */
export function seedFromHashes(hashes) {
  return parseInt(sha256([...hashes].map(h => h.toLowerCase()).sort().join('\n')).slice(0, 8), 16);
}
