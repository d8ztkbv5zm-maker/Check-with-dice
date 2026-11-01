// Arena CLI: a paired match between two bots.
//   node arena/run.mjs --a file:bots/mybot/bot.mjs --b random --games 100
// Options:
//   --a --b              bot ids (file:<path to bot.mjs> or random)
//   --games N            number of games, rounded up to an even number (pairs)       default 100
//   --time MS            time budget per decision passed to the bots                  default 1000
//   --warn-ms MS         a decision longer than this is flagged in the record          default 1500
//   --forfeit-ms MS      a decision longer than this loses the game                    default 3000
//   --seed N             dice seed                                                     default 20261101
//   --seed-from-commitments   derive the seed from match/commitments.json (official matches, see MATCH_PROTOCOL.md)
//   --workers N          games played in parallel (each bot still runs single-threaded) default: CPU count - 1
//   --out NAME           results folder name under results/
// Results: results/<name>/game-00001.json …, run.json (configuration + SHA-256 of bots and arena),
// summary.json, summary.md. Updated while running; an interrupted run resumes where it stopped.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, renameSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { loadBot } from './registry.mjs';
import { playGame } from './game.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

if (!isMainThread) {
  const { a, b, opts } = workerData;
  const A = await loadBot(a), B = await loadBot(b);
  parentPort.on('message', msg => {
    if (msg === 'stop') process.exit(0);
    parentPort.postMessage(playGame({ index: msg.index, seed: opts.seed, a: A, b: B, timeMs: opts.timeMs, warnMs: opts.warnMs, forfeitMs: opts.forfeitMs }));
  });
  parentPort.postMessage('ready');
} else {
  const { summarize, markdown } = await import('./stats.mjs');
  const { hashTree, ARENA_FILES, seedFromHashes } = await import('../tools/hash.mjs');
  const args = Object.fromEntries(process.argv.slice(2).reduce((acc, x, i, arr) => { if (x.startsWith('--')) acc.push([x.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : 'true']); return acc; }, []));
  if (!args.a || !args.b) { console.log('Usage: node arena/run.mjs --a <bot> --b <bot> [--games 100] [--time 1000] [--seed N | --seed-from-commitments] [--out name]'); process.exit(1); }
  const a = args.a, b = args.b === args.a ? args.b + '#2' : args.b, games = Math.max(2, 2 * Math.ceil(+(args.games ?? 100) / 2)), timeMs = +(args.time ?? 1000);
  const warnMs = +(args['warn-ms'] ?? 1500), forfeitMs = +(args['forfeit-ms'] ?? 3000);
  let seed = +(args.seed ?? 20261101);
  if (args['seed-from-commitments']) {
    const c = JSON.parse(readFileSync(resolve(root, 'match/commitments.json'), 'utf8'));
    seed = seedFromHashes(Object.values(c).map(x => x.sha256));
  }
  const workers = Math.max(1, Math.min(+(args.workers ?? Math.max(1, os.availableParallelism() - 1)), games));
  // check both bots load before starting workers
  await loadBot(a); await loadBot(b);
  const opts = { seed, timeMs, warnMs, forfeitMs };
  const name = args.out ?? `${a}_vs_${b}_${timeMs}ms_s${seed}`.replace(/[:/\\]/g, '-');
  const dir = resolve(root, 'results', name); mkdirSync(dir, { recursive: true });
  const botFolder = id => { id = id.replace(/#\d+$/, ''); return id === 'random' ? 'bots/example-random' : dirname(id.slice(5)); };
  const metaPath = resolve(dir, 'run.json');
  const meta = { a, b, games, timeMs, warnMs, forfeitMs, seed, started: new Date().toISOString(), node: process.version, cpu: os.cpus()[0]?.model,
    sha256: { arena: hashTree(ARENA_FILES), a: hashTree([botFolder(a)]), b: hashTree([botFolder(b)]) } };
  if (existsSync(metaPath)) {
    const m = JSON.parse(readFileSync(metaPath, 'utf8'));
    if (m.a !== a || m.b !== b || m.timeMs !== timeMs || m.seed !== seed || m.games !== games) throw new Error('This results folder belongs to another configuration; use --out');
    if (JSON.stringify(m.sha256) !== JSON.stringify(meta.sha256)) throw new Error('Bot or arena files changed since this run started; use --out for a new run');
  } else writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  const file = i => resolve(dir, `game-${String(i + 1).padStart(5, '0')}.json`);
  const done = []; for (const f of readdirSync(dir)) if (/^game-\d+\.json$/.test(f)) done.push(JSON.parse(readFileSync(resolve(dir, f), 'utf8')));
  const todo = []; for (let i = 0; i < games; i++) if (!existsSync(file(i))) todo.push(i);
  const metaLine = `Time control: ${timeMs} ms per decision, > ${warnMs} ms warning, > ${forfeitMs} ms loss · seed ${seed} · paired games (same throws, colours swapped) · ${meta.cpu} · Node ${process.version}`;
  const save = () => { const s = summarize(done, a, b); writeFileSync(resolve(dir, 'summary.json'), JSON.stringify(s, null, 2)); writeFileSync(resolve(dir, 'summary.md'), markdown(s, metaLine)); return s; };
  console.log(`${a} vs ${b}: ${games} games, ${timeMs} ms per decision, ${workers} parallel games, seed ${seed}; already done ${done.length} → ${dir}`);
  let next = 0, active = 0; const t0 = Date.now();
  await new Promise(resolveAll => {
    if (!todo.length) return resolveAll();
    for (let w = 0; w < Math.min(workers, todo.length); w++) {
      const worker = new Worker(fileURLToPath(import.meta.url), { workerData: { a, b, opts } }); active++;
      const feed = () => { if (next < todo.length) worker.postMessage({ index: todo[next++] }); else { worker.postMessage('stop'); if (--active === 0) resolveAll(); } };
      worker.on('message', msg => {
        if (msg !== 'ready') {
          writeFileSync(file(msg.index) + '.tmp', JSON.stringify(msg)); renameSync(file(msg.index) + '.tmp', file(msg.index)); done.push(msg);
          const s = save(), el = (Date.now() - t0) / 1000;
          process.stdout.write(`\r${done.length}/${games}  ${a}: ${(s.score * 100).toFixed(1)}%  CI ${s.ci95 ? s.ci95.map(x => (x * 100).toFixed(0)).join('–') : '—'}  ${el.toFixed(0)} s   `);
        }
        feed();
      });
      worker.on('error', e => { console.error('\nworker error', e); process.exitCode = 1; if (--active === 0) resolveAll(); });
    }
  });
  const s = save(); console.log('\n' + markdown(s, metaLine));
}
