// Independent check of a finished match: anyone can re-check every game without running the bots.
//   node tools/verify.mjs results/<name>
// For every game record it re-creates the dice from the seed, replays every recorded move through the rules core,
// and checks that each move was legal, that every turn used the mandatory maximum of dice, and that the stated result
// follows. Then it recomputes the summary and compares it with summary.json, and compares the arena files with the
// SHA-256 stored in run.json.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Position, KINDS, seededRandom, rollFaces, actionToMove } from '../core/rules.mjs';
import { summarize } from '../arena/stats.mjs';
import { root, hashTree, ARENA_FILES } from './hash.mjs';

export function verifyGame(g, { forfeitMs = 0 } = {}) {
  const random = seededRandom((g.seed + g.pair) >>> 0), pos = Position.initial(2);
  const bad = msg => ({ ok: false, error: `game ${g.index + 1}: ${msg}` });
  let i = 0;
  for (; i < g.turns.length; i++) {
    const t = g.turns[i], faces = rollFaces(random), color = pos.turn === 0 ? 'white' : 'black';
    if (t.color !== color) return bad(`turn ${i + 1}: expected ${color} to move`);
    if (faces.map(k => KINDS[k]).join() !== t.faces.join()) return bad(`turn ${i + 1}: dice ${t.faces} do not follow from the seed (${faces.map(k => KINDS[k])})`);
    pos.setDice(faces);
    if (!pos.canContinue()) { if (t.actions.length) return bad(`turn ${i + 1}: moves recorded on an unusable throw`); pos.endTurn(); continue; }
    for (const a of t.actions) { const m = actionToMove(a); if (!pos.legalMoves().includes(m)) return bad(`turn ${i + 1}: illegal move ${JSON.stringify(a)}`); pos.play(m); if (pos.winner >= 0) break; }
    const last = i === g.turns.length - 1;
    if (pos.winner >= 0) { if (!last) return bad(`turn ${i + 1}: the king was captured but the game went on`); break; }
    if (pos.canContinue()) {
      if (!last) return bad(`turn ${i + 1}: mandatory maximum of dice not used but the game went on`);
      if (!['illegal', 'incomplete', 'error', 'time'].includes(g.result.reason)) return bad(`turn ${i + 1}: unfinished turn but result is "${g.result.reason}"`);
      break;
    }
    pos.endTurn();
  }
  const r = g.result, mover = g.turns.at(-1)?.color, other = mover === 'white' ? 'black' : 'white';
  if (r.reason === 'king' && !(pos.winner >= 0 && r.winner === (pos.winner ? 'black' : 'white'))) return bad('result "king" does not follow from the moves');
  if (r.reason === 'draw' && !pos.draw) return bad('result "draw" does not follow from the moves');
  if (['illegal', 'incomplete', 'error', 'time'].includes(r.reason) && r.winner !== other) return bad(`result "${r.reason}": the opponent of the side to move must win`);
  if (r.reason === 'time' && forfeitMs && !(g.turns.at(-1).ms > forfeitMs)) return bad('loss on time but the recorded decision was within the limit');
  if (r.reason === 'limit' && (pos.winner >= 0 || pos.draw)) return bad('result "limit" but the game had ended');
  return { ok: true };
}

const dir = resolve(process.cwd(), process.argv[2] ?? '');
if (!process.argv[2] || !existsSync(resolve(dir, 'run.json'))) { console.log('Usage: node tools/verify.mjs results/<name>'); process.exit(1); }
const run = JSON.parse(readFileSync(resolve(dir, 'run.json'), 'utf8'));
const games = readdirSync(dir).filter(f => /^game-\d+\.json$/.test(f)).sort().map(f => JSON.parse(readFileSync(resolve(dir, f), 'utf8')));
let failed = 0;
for (const g of games) {
  if (g.seed !== run.seed) { console.log(`game ${g.index + 1}: seed ${g.seed} differs from run.json`); failed++; continue; }
  const v = verifyGame(g, { forfeitMs: run.forfeitMs }); if (!v.ok) { console.log(v.error); failed++; }
}
const s = summarize(games, run.a, run.b), stored = existsSync(resolve(dir, 'summary.json')) ? JSON.parse(readFileSync(resolve(dir, 'summary.json'), 'utf8')) : null;
const summaryOk = !!stored && stored.score === s.score && stored.aWins === s.aWins && stored.bWins === s.bWins && stored.games === s.games;
const arenaNow = hashTree(ARENA_FILES), arenaOk = JSON.stringify(arenaNow) === JSON.stringify(run.sha256?.arena);
console.log(`Games checked: ${games.length} of ${run.games}; invalid: ${failed}`);
console.log(`Summary: ${summaryOk ? 'matches summary.json' : 'DIFFERS from summary.json'} — ${run.a}: ${(s.score * 100).toFixed(1)}%, 95% CI ${s.ci95 ? s.ci95.map(x => (x * 100).toFixed(1) + '%').join(' – ') : '—'}`);
console.log(`Arena files: ${arenaOk ? 'identical to the ones used for this run' : 'DIFFERENT from the ones recorded in run.json (verify with the same version of the repository)'}`);
process.exit(failed || !summaryOk ? 1 : 0);
