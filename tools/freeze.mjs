// Freeze before an official match: SHA-256 of every file of the submitted bots and of the arena.
//   node tools/freeze.mjs          writes match/freeze.json
//   node tools/freeze.mjs --check  compares the current files with match/freeze.json (exit code 1 on any change)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { root, hashTree, ARENA_FILES } from './hash.mjs';
import { status, commitments } from './submit.mjs';

const out = resolve(root, 'match/freeze.json');
const now = hashTree([...Object.keys(commitments()).map(n => `bots/${n}`), ...ARENA_FILES]);

if (process.argv.includes('--check')) {
  if (!existsSync(out)) { console.log('No match/freeze.json'); process.exit(1); }
  const was = JSON.parse(readFileSync(out, 'utf8')).files; let bad = 0;
  for (const f of new Set([...Object.keys(was), ...Object.keys(now)])) if (was[f] !== now[f]) { console.log(`CHANGED/NEW/REMOVED: ${f}`); bad++; }
  for (const [n, x] of Object.entries(status())) if (!x.match) { console.log(`ARCHIVE ${n}: ${x.archive ? 'does not match its commitment' : 'missing'}`); bad++; }
  console.log(bad ? `Freeze violated: ${bad} problem(s)` : `Freeze confirmed: ${Object.keys(now).length} files unchanged`);
  process.exit(bad ? 1 : 0);
}
mkdirSync(resolve(root, 'match'), { recursive: true });
writeFileSync(out, JSON.stringify({ frozen: new Date().toISOString(), submissions: status(), files: now }, null, 1));
console.log(`Frozen ${Object.keys(now).length} files → match/freeze.json`);
for (const [f, h] of Object.entries(now)) console.log(h.slice(0, 16), f);
