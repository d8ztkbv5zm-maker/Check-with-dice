// One arena game. Every move a bot returns is validated step by step against the rules core.
import { Position, KINDS, seededRandom, rollFaces, moveToAction } from '../core/rules.mjs';

/**
 * Paired schedule: game index i -> pair = floor(i/2). Both games of a pair use the same dice seed
 * (seed + pair), i.e. the same sequence of throws by turn number; the bots swap colours.
 * Time control per decision: `timeMs` is the budget passed to the bot; a decision longer than `warnMs`
 * is flagged in the record, longer than `forfeitMs` loses the game.
 */
export function playGame({ index, seed, a, b, timeMs, timeA = timeMs, timeB = timeMs, maxTurns = 400, warnMs = 0, forfeitMs = 0 }) {
  const pair = Math.floor(index / 2), white = index % 2 === 0 ? a : b, black = white === a ? b : a;
  const random = seededRandom((seed + pair) >>> 0), pos = Position.initial(2), turns = [];
  let result = null;
  const lose = (color, reason, detail) => ({ winner: color === 'white' ? 'black' : 'white', reason, ...(detail ? { detail } : {}) });
  for (let t = 0; t < maxTurns && !result; t++) {
    const bot = pos.turn === 0 ? white : black, color = pos.turn === 0 ? 'white' : 'black';
    const faces = rollFaces(random); pos.setDice(faces);
    const rec = { color, faces: faces.map(k => KINDS[k]), actions: [], ms: 0 };
    if (!pos.canContinue()) { pos.endTurn(); turns.push(rec); if (pos.draw) result = { winner: null, reason: 'draw' }; continue; }
    const t0 = performance.now();
    let decision;
    try { decision = bot.choose(pos.clone(), { timeMs: bot === a ? timeA : timeB, turnNumber: t + 1 }); }
    catch (e) { turns.push(rec); result = lose(color, 'error', `${bot.id}: ${e.message}`); break; }
    rec.ms = +(performance.now() - t0).toFixed(2);
    if (warnMs && rec.ms > warnMs) rec.slow = true;
    if (forfeitMs && rec.ms > forfeitMs) { turns.push(rec); result = lose(color, 'time', `${bot.id}: ${rec.ms.toFixed(0)} ms`); break; }
    if (!decision || !Array.isArray(decision.moves)) { turns.push(rec); result = lose(color, 'error', `${bot.id}: choose() must return { moves: number[] }`); break; }
    for (const m of decision.moves) {
      if (!pos.legalMoves().includes(m)) { result = lose(color, 'illegal', `${bot.id}: move ${m}`); break; }
      rec.actions.push(moveToAction(pos, m)); pos.play(m);
      if (pos.winner >= 0) break;
    }
    turns.push(rec);
    if (result) break;
    if (pos.winner >= 0) { result = { winner: pos.winner ? 'black' : 'white', reason: 'king' }; break; }
    if (pos.canContinue()) { result = lose(color, 'incomplete', `${bot.id}: mandatory maximum of dice not used`); break; }
    pos.endTurn();
    if (pos.draw) result = { winner: null, reason: 'draw' };
  }
  result ??= { winner: null, reason: 'limit' };
  return { schema: 'cwd-game-1', rulesVersion: 2, index, pair, seed, timeMs, timeA, timeB, white: white.id, black: black.id, result, turns };
}
