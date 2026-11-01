// Closed submission of bots for an official match (see MATCH_PROTOCOL.md).
//   node tools/submit.mjs commit <name> <sha256>   record a participant's commitment (SHA-256 of the ORIGINAL archive)
//   node tools/submit.mjs status                   commitments, archives found, their SHA-256, match or not
//   node tools/submit.mjs unpack                   verify every archive against its commitment, unpack into bots/<name>/, freeze
//   node tools/submit.mjs seed                     the match seed derived from all commitments
//   node tools/submit.mjs reset <name> --force     remove a mistyped commitment (only with every participant's consent)
// Archives: match/submissions/<name>.zip | .tar.gz | .tgz | .tar — checked byte for byte as delivered, never repacked.
// Inside: bot.mjs at the top level, or inside a single top-level folder.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, cpSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { root, sha256File, seedFromHashes } from './hash.mjs';

const M = resolve(root, 'match'), SUB = resolve(M, 'submissions'), EXTS = ['.zip', '.tar.gz', '.tgz', '.tar'];
const NAME = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const readJson = (f, d) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return d; } };
export const commitments = () => readJson(resolve(M, 'commitments.json'), {});
export function archiveOf(name) { for (const e of EXTS) { const f = resolve(SUB, name + e); if (existsSync(f)) return f; } return null; }

export function commit(name, hash) {
  if (!NAME.test(name ?? '')) throw new Error('name: lowercase letters, digits, - and _ (max 32)');
  const h = String(hash ?? '').trim().toLowerCase(); if (!/^[0-9a-f]{64}$/.test(h)) throw new Error('SHA-256 must be 64 hex characters');
  const c = commitments(); if (c[name] && c[name].sha256 !== h) throw new Error(`${name} already committed ${c[name].sha256.slice(0, 12)}… — it cannot be changed`);
  mkdirSync(M, { recursive: true }); c[name] = { sha256: h, at: c[name]?.at ?? new Date().toISOString() };
  writeFileSync(resolve(M, 'commitments.json'), JSON.stringify(c, null, 1)); return c;
}

export function status() {
  return Object.fromEntries(Object.entries(commitments()).map(([n, c]) => {
    const a = archiveOf(n), h = a ? sha256File(a) : null;
    return [n, { commitment: c.sha256, committedAt: c.at, archive: a ? a.slice(root.length + 1) : null, archiveSha256: h, match: !!h && h === c.sha256 }];
  }));
}

export function unpack() {
  const st = status(), names = Object.keys(st), log = [];
  if (names.length < 2) throw new Error('At least two commitments are needed');
  for (const n of names) { if (!st[n].archive) throw new Error(`No archive for ${n} in match/submissions/`); if (!st[n].match) throw new Error(`Archive of ${n} does not match its commitment: ${st[n].archiveSha256}`); }
  for (const n of names) {
    const tmp = resolve(M, 'unpacked', n); rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
    const file = resolve(root, st[n].archive);
    const r = file.endsWith('.zip') ? spawnSync('unzip', ['-q', file, '-d', tmp], { encoding: 'utf8' }) : spawnSync('tar', ['-xf', file, '-C', tmp], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`Cannot unpack ${n}: ${r.stderr || r.error}`);
    let src = tmp; const top = readdirSync(tmp).filter(f => !f.startsWith('.') && f !== '__MACOSX');
    if (!existsSync(resolve(src, 'bot.mjs')) && top.length === 1 && statSync(resolve(tmp, top[0])).isDirectory()) src = resolve(tmp, top[0]);
    if (!existsSync(resolve(src, 'bot.mjs'))) throw new Error(`No bot.mjs in the archive of ${n}`);
    const dest = resolve(root, 'bots', n); rmSync(dest, { recursive: true, force: true }); mkdirSync(dest, { recursive: true });
    cpSync(src, dest, { recursive: true, filter: p => !p.includes('__MACOSX') && !p.endsWith('.DS_Store') });
    log.push(`${n}: archive matches its commitment, unpacked into bots/${n}/`);
  }
  const f = spawnSync(process.execPath, [resolve(root, 'tools/freeze.mjs')], { encoding: 'utf8' });
  log.push(f.stdout.split('\n')[0], `Match seed: ${seedFromHashes(names.map(n => st[n].commitment))}`);
  return log;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, a, b] = process.argv.slice(2);
  try {
    if (cmd === 'commit') console.log(commit(a, b));
    else if (cmd === 'reset' && b === '--force') { const c = commitments(); delete c[a]; writeFileSync(resolve(M, 'commitments.json'), JSON.stringify(c, null, 1)); console.log(`Commitment of ${a} removed`); }
    else if (cmd === 'unpack') console.log(unpack().join('\n'));
    else if (cmd === 'seed') console.log(seedFromHashes(Object.values(commitments()).map(c => c.sha256)));
    else console.log(JSON.stringify(status(), null, 1));
  } catch (e) { console.error(e.message); process.exit(1); }
}
