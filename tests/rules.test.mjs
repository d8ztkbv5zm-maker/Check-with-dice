// Rule tests written directly from GAME_RULES.md (independent of the original engine).
// Run: node --test tests/rules.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Position, code, KINDS, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING, mFrom, mTo, mType, T_CASTLE, T_EP, moveName } from '../core/rules.mjs';

const sq = s => (8 - Number(s[1])) * 8 + 'abcdefgh'.indexOf(s[0]);
const K = { P: PAWN, N: KNIGHT, B: BISHOP, R: ROOK, Q: QUEEN, K: KING };
/** setup('w', 'Ke1 Rh1 ...', 'Ke8 ...', {moved:['e1'], turn}) — pieces listed without '*' are unmoved; '*' marks moved. */
function setup(white, black, { turn = 0, quiet = 0 } = {}) {
  const p = new Position(); p.rules = 2; p.turn = turn; p.quiet = quiet;
  for (const [list, color] of [[white, 0], [black, 1]]) for (const t of list.split(/\s+/).filter(Boolean)) {
    const moved = t.endsWith('*'), s = sq(t.slice(1, 3)); p.C[s] = code(K[t[0]], color); p.M[s] = moved ? 1 : 0;
  }
  p.rehash(); return p;
}
const dice = (p, ...names) => { p.setDice(names.map(n => KINDS.indexOf(n))); return p; };
const names = (p, ms) => ms.map(m => moveName(p, m)).sort();
const fullTurns = p => p.turns().turns;
const play = (p, from, to, promo) => { const m = p.legalMoves().find(m => mFrom(m) === sq(from) && mTo(m) === sq(to) && (promo === undefined || mType(m) === promo)); assert.ok(m !== undefined, `move ${from}-${to} must be legal`); p.play(m); return m; };

// ---------- castling ----------
test('castling: costs king+rook dice, both sides, rook moves with the king', () => {
  const p = dice(setup('Ke1 Ra1 Rh1 Pa2* Ph2*', 'Ke8* Pa7*'), 'king', 'rook', 'pawn');
  const castles = p.legalMoves().filter(m => mType(m) === T_CASTLE).map(m => moveName(p, m)).sort();
  assert.deepEqual(castles, ['O-O', 'O-O-O']);
  play(p, 'e1', 'g1', T_CASTLE);
  assert.equal(p.C[sq('g1')], code(KING, 0)); assert.equal(p.C[sq('f1')], code(ROOK, 0)); assert.equal(p.C[sq('h1')], 0);
  assert.equal(p.dice[KING], 0); assert.equal(p.dice[ROOK], 0); assert.equal(p.dice[PAWN], 1);
});
test('castling needs BOTH dice: no rook die -> no castling', () => {
  const p = dice(setup('Ke1 Rh1', 'Ke8*'), 'king', 'pawn', 'pawn');
  assert.equal(p.legalMoves().filter(m => mType(m) === T_CASTLE).length, 0);
});
test('castling forbidden after the king or that rook has moved', () => {
  assert.equal(dice(setup('Ke1* Rh1', 'Ke8*'), 'king', 'rook', 'rook').legalMoves().filter(m => mType(m) === T_CASTLE).length, 0);
  const p = dice(setup('Ke1 Ra1 Rh1*', 'Ke8*'), 'king', 'rook', 'queen');
  assert.deepEqual(p.legalMoves().filter(m => mType(m) === T_CASTLE).map(m => moveName(p, m)), ['O-O-O']);
});
test('castling forbidden with a piece between (incl. b1 on the queen side)', () => {
  const p = dice(setup('Ke1 Ra1 Nb1 Rh1 Bf1', 'Ke8*'), 'king', 'rook', 'queen');
  assert.equal(p.legalMoves().filter(m => mType(m) === T_CASTLE).length, 0);
});
test('castling through / into attacked squares is allowed (no check rule)', () => {
  const p = dice(setup('Ke1 Rh1', 'Ke8* Rf8* Rg8*'), 'king', 'rook', 'pawn');
  assert.equal(p.legalMoves().filter(m => mType(m) === T_CASTLE).length, 1);
});
test('GAME_RULES example: castling forbidden by the mandatory maximum (Rb2 blocks Ba1)', () => {
  const p = dice(setup('Ke1 Rh1 Rb2* Ba1*', 'Ke8* Pa7*'), 'king', 'rook', 'bishop');
  assert.equal(p.legalMoves().filter(m => mType(m) === T_CASTLE).length, 0, 'castling would leave the bishop die unusable');
  assert.equal(p.turns().max, 3);
  // once the bishop is free, castling is allowed again
  const q = dice(setup('Ke1 Rh1 Rb3* Ba1*', 'Ke8* Pa7*'), 'king', 'rook', 'bishop');
  assert.equal(q.legalMoves().filter(m => mType(m) === T_CASTLE).length, 1);
});
test('black castles too', () => {
  const p = dice(setup('Ke1*', 'Ke8 Ra8 Rh8'), 'king', 'rook', 'pawn'); p.turn = 1;
  assert.deepEqual(p.legalMoves().filter(m => mType(m) === T_CASTLE).map(m => moveName(p, m)).sort(), ['O-O', 'O-O-O']);
});

// ---------- promotion ----------
test('promotion costs only the pawn die; 4 choices, never king or pawn', () => {
  const p = dice(setup('Pa7* Kh1*', 'Kh8*'), 'pawn', 'king', 'king');
  const promos = p.legalMoves().filter(m => mFrom(m) === sq('a7'));
  assert.deepEqual(promos.map(mType).sort(), [1, 2, 3, 4]);
});
test('promotion with ONLY pawn dice is possible (rule change of 25.10)', () => {
  const p = dice(setup('Pa7* Kh1*', 'Kh8* Ph7*'), 'pawn', 'pawn', 'pawn');
  assert.equal(p.legalMoves().filter(m => mFrom(m) === sq('a7')).length, 4);
});
test('GAME_RULES example: a7, dice pawn/knight/knight, no other knights -> only =N keeps the maximum', () => {
  const p = dice(setup('Pa7* Kh1*', 'Kh8* Pc7*'), 'pawn', 'knight', 'knight');
  const promos = p.legalMoves().filter(m => mFrom(m) === sq('a7'));
  assert.deepEqual(promos.map(mType), [1], 'only the knight promotion lets both knight dice be used');
  play(p, 'a7', 'a8', 1);
  assert.equal(p.legalMoves().length > 0 && p.legalMoves().every(m => p.C[mFrom(m)] === code(KNIGHT, 0)), true, 'new knight uses the remaining knight dice');
});
test('promotion by capture on the last rank', () => {
  const p = dice(setup('Pb7* Kh1*', 'Ra8* Kc8*'), 'pawn', 'king', 'king');
  const caps = p.legalMoves().filter(m => mFrom(m) === sq('b7') && mTo(m) === sq('a8'));
  assert.equal(caps.length, 4);
});
test('capturing the king on the last rank with the pawn die ends the game at once', () => {
  const p = dice(setup('Pb7* Kh1*', 'Ka8*'), 'pawn', 'queen', 'queen');
  const win = p.legalMoves().find(m => mTo(m) === sq('a8'));
  assert.ok(win !== undefined); p.play(win); assert.equal(p.winner, 0);
});

// ---------- en passant ----------
test('en passant: right created by a double step, capture with a pawn die, captured pawn removed', () => {
  const p = dice(setup('Pe5* Ke1*', 'Pd7 Ke8*', { turn: 1 }), 'pawn', 'king', 'king');
  play(p, 'd7', 'd5'); p.dice.fill(0); p.endTurn();
  dice(p, 'pawn', 'king', 'king');
  const ep = p.legalMoves().find(m => mType(m) === T_EP);
  assert.ok(ep !== undefined, 'e5xd6 en passant must be legal'); assert.equal(mTo(ep), sq('d6'));
  p.play(ep); assert.equal(p.C[sq('d5')], 0); assert.equal(p.C[sq('d6')], code(PAWN, 0));
});
test('en passant may come after other moves of the same turn', () => {
  const p = dice(setup('Pe5* Ke1*', 'Pd7 Ke8*', { turn: 1 }), 'pawn', 'king', 'king');
  play(p, 'd7', 'd5'); p.dice.fill(0); p.endTurn(); dice(p, 'king', 'pawn', 'king');
  play(p, 'e1', 'e2');
  assert.ok(p.legalMoves().some(m => mType(m) === T_EP));
});
test('en passant right expires after the opponent\'s next full turn', () => {
  const p = dice(setup('Pe5* Ke1* Ph2*', 'Pd7 Ke8* Ph7*', { turn: 1 }), 'pawn', 'king', 'king');
  play(p, 'd7', 'd5'); p.dice.fill(0); p.endTurn();
  dice(p, 'king', 'king', 'king'); play(p, 'e1', 'e2'); while (p.canContinue()) p.play(p.legalMoves()[0]); p.endTurn(); // white does not take
  dice(p, 'king', 'king', 'king'); while (p.canContinue()) p.play(p.legalMoves()[0]); p.endTurn();                    // black turn
  dice(p, 'pawn', 'pawn', 'pawn');
  assert.equal(p.legalMoves().filter(m => mType(m) === T_EP).length, 0, 'right must have expired');
});
test('en passant right disappears if that pawn moves again in the same turn', () => {
  const p = dice(setup('Pe4* Ke1*', 'Pd7 Ke8*', { turn: 1 }), 'pawn', 'pawn', 'king');
  play(p, 'd7', 'd5'); play(p, 'd5', 'd4'); assert.equal(p.epN, 0);
});
test('en passant needs an empty target square and only applies to the pawn that double-stepped', () => {
  const p = dice(setup('Pe5* Ke1*', 'Pd7 Nd6* Ke8*', { turn: 1 }), 'pawn', 'king', 'king');
  // d7-d5 is impossible here (d6 occupied); construct the right manually with an occupied target
  p.ep[0] = sq('d5'); p.ep[1] = 1; p.epN = 1; p.C[sq('d5')] = code(PAWN, 1); p.C[sq('d7')] = 0; p.rehash(); p.turn = 0; dice(p, 'pawn', 'king', 'king');
  assert.equal(p.legalMoves().filter(m => mType(m) === T_EP).length, 0);
});

// ---------- mandatory maximum / turn ----------
test('mandatory maximum: a move that makes the maximum unreachable is not offered', () => {
  // dice bishop+rook: Rb2 blocks Ba1; moving the bishop is impossible first, rook must free it
  const p = dice(setup('Ba1* Rb2* Kh1*', 'Kh8*'), 'bishop', 'rook', 'king');
  assert.equal(p.turns().max, 3);
  for (const m of p.legalMoves()) { const q = p.clone(); q.play(m); assert.equal(1 + q.maxSpend(), 3); }
});
test('repeated moves of one piece with equal dice', () => {
  const p = dice(setup('Ng1* Kh1*', 'Kh8*'), 'knight', 'knight', 'knight');
  assert.equal(p.turns().max, 3);
});
test('unusable throw -> pass', () => {
  const p = dice(setup('Kh1* Ph2* Pg2*', 'Kh8*'), 'queen', 'rook', 'bishop');
  assert.equal(p.canContinue(), false);
});
test('king capture ends the game even with dice left', () => {
  const p = dice(setup('Qd1* Kh1*', 'Kd8*'), 'queen', 'queen', 'queen');
  const w = p.legalMoves().find(m => mTo(m) === sq('d8')); p.play(w);
  assert.equal(p.winner, 0); assert.equal(p.legalMoves().length, 0);
});

// ---------- 50-move draw (100 side-turns) ----------
test('draw after 100 side-turns without captures; a capture resets the counter', () => {
  const p = dice(setup('Ke1* Ra1*', 'Ke8* Rh8*', { quiet: 99 }), 'king', 'king', 'king');
  while (p.canContinue()) p.play(p.legalMoves().find(m => !p.C[mTo(m)]) ?? p.legalMoves()[0]);
  p.endTurn(); assert.equal(p.draw, true);
  const q = dice(setup('Ke1* Ra1*', 'Ke8* Pa7*', { quiet: 99 }), 'rook', 'king', 'king');
  play(q, 'a1', 'a7'); while (q.canContinue()) q.play(q.legalMoves()[0]); q.endTurn();
  assert.equal(q.draw, false); assert.equal(q.quiet, 0);
});
