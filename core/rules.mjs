// Check with Dice — fast rules core (Lab). Plain JS, no dependencies, browser + Node.
// Rules: GAME_RULES.md (v2 by default): 3 dice of {pawn,knight,bishop,rook,queen,king};
// a turn spends up to 3 dice in any order, mandatory maximum of SPENT DICE (castling = 2);
// no check/mate, capturing the king ends the game at once; promotion costs only the pawn die
// and may choose knight/bishop/rook/queen; en passant + 50-move (100 side-turns) draw in v2.
// Squares: 0 = a8 … 63 = h1 (same as the original engine).

export const KINDS = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];
export const PAWN = 0, KNIGHT = 1, BISHOP = 2, ROOK = 3, QUEEN = 4, KING = 5;
export const WHITE = 0, BLACK = 1;
// piece code: 0 empty, 1..6 white pawn..king, 7..12 black pawn..king
export const code = (kind, color) => 1 + kind + 6 * color;
export const kindOf = c => (c - 1) % 6;
export const colorOf = c => (c > 6 ? 1 : 0);
// move: from | to<<6 | type<<12 ; type 0 normal, 1..4 promotion knight..queen, 5 castle, 6 en passant
export const T_NORMAL = 0, T_CASTLE = 5, T_EP = 6;
export const mFrom = m => m & 63, mTo = m => (m >> 6) & 63, mType = m => m >> 12;
export const mCost = m => (m >> 12) === T_CASTLE ? 2 : 1;
export const squareName = n => 'abcdefgh'[n & 7] + (8 - (n >> 3));

// ---------- tables ----------
const KNT = [], KGT = [], RAYS = [];
const DIRS8 = [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
for (let sq = 0; sq < 64; sq++) {
  const x = sq & 7, y = sq >> 3, kn = [], kg = [], rays = [];
  for (const [dx, dy] of [[1, 2], [1, -2], [-1, 2], [-1, -2], [2, 1], [2, -1], [-2, 1], [-2, -1]]) {
    const nx = x + dx, ny = y + dy; if (nx >= 0 && nx < 8 && ny >= 0 && ny < 8) kn.push(ny * 8 + nx);
  }
  for (const [dx, dy] of DIRS8) {
    const r = []; for (let s = 1; s < 8; s++) { const nx = x + dx * s, ny = y + dy * s; if (nx < 0 || nx > 7 || ny < 0 || ny > 7) break; r.push(ny * 8 + nx); }
    rays.push(Int8Array.from(r)); if (r.length) kg.push(r[0]);
  }
  KNT.push(Int8Array.from(kn)); KGT.push(Int8Array.from(kg)); RAYS.push(rays);
}
export const TABLES = { KNT, KGT, RAYS };

// ---------- zobrist ----------
// Nonlinear generator (mulberry32). NOTE: an xorshift generator must not be used here — it is linear over
// GF(2), so with ZA/ZB taken from one xorshift stream hb was a fixed linear function of ha and the 53-bit key
// carried only 32 independent bits (real collisions inside one turn enumeration; found 30.10.2026).
let s32 = 0x2545F491;
const rnd = () => { let t = s32 = (s32 + 0x6D2B79F5) | 0; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return (t ^ t >>> 14) >>> 0; };
const ZA = new Uint32Array(13 * 2 * 64), ZB = new Uint32Array(13 * 2 * 64);
for (let i = 0; i < ZA.length; i++) { ZA[i] = rnd(); ZB[i] = rnd(); }
const ZDA = new Uint32Array(6 * 4), ZDB = new Uint32Array(6 * 4); for (let i = 0; i < 24; i++) { ZDA[i] = rnd(); ZDB[i] = rnd(); }
const ZEA = new Uint32Array(128), ZEB = new Uint32Array(128); for (let i = 0; i < 128; i++) { ZEA[i] = rnd(); ZEB[i] = rnd(); }
const ZTA = rnd(), ZTB = rnd();

const MAXD = 8, MPD = 256; // max depth inside one turn, moves per depth
/** Standard material values maintained incrementally in Position.mat (white, black). */
export const MAT_VALUES = [100, 300, 300, 500, 900, 0];

export class Position {
  constructor() {
    this.C = new Int8Array(64); this.M = new Int8Array(64);
    this.turn = WHITE; this.rules = 2;
    this.ep = new Int16Array(32); this.epN = 0;   // pairs (pawn square, color)
    this.quiet = 0; this.captured = 0;            // side-turns without capture; capture happened in current turn
    this.dice = new Int8Array(6);                 // remaining dice of the current turn (counts)
    this.winner = -1; this.draw = false;
    this.ha = 0; this.hb = 0; this.mat = new Int32Array(2);
    this.mv = new Int32Array(MAXD * MPD);
    this.U = new Int32Array(64 * 12); this.sp = 0;  // undo stack
    this.epStack = new Int16Array(64 * 33);
  }
  static initial(rules = 2) {
    const p = new Position(); p.rules = rules;
    const back = [ROOK, KNIGHT, BISHOP, QUEEN, KING, BISHOP, KNIGHT, ROOK];
    for (let x = 0; x < 8; x++) { p.C[x] = code(back[x], BLACK); p.C[x + 8] = code(PAWN, BLACK); p.C[x + 48] = code(PAWN, WHITE); p.C[x + 56] = code(back[x], WHITE); }
    p.rehash(); return p;
  }
  clone() {
    const p = new Position(); p.C.set(this.C); p.M.set(this.M); p.turn = this.turn; p.rules = this.rules;
    p.ep.set(this.ep); p.epN = this.epN; p.quiet = this.quiet; p.captured = this.captured; p.dice.set(this.dice);
    p.winner = this.winner; p.draw = this.draw; p.ha = this.ha; p.hb = this.hb; p.mat.set(this.mat); return p;
  }
  copyFrom(o) {
    this.C.set(o.C); this.M.set(o.M); this.turn = o.turn; this.rules = o.rules; this.ep.set(o.ep); this.epN = o.epN;
    this.quiet = o.quiet; this.captured = o.captured; this.dice.set(o.dice); this.winner = o.winner; this.draw = o.draw; this.ha = o.ha; this.hb = o.hb; this.mat.set(o.mat); this.sp = 0;
  }
  rehash() { this.ha = 0; this.hb = 0; this.mat[0] = 0; this.mat[1] = 0; for (let i = 0; i < 64; i++) { const c = this.C[i]; if (c) { this.tog(i); this.mat[c > 6 ? 1 : 0] += MAT_VALUES[(c - 1) % 6]; } } }
  tog(i) { const z = (this.C[i] * 2 + this.M[i]) * 64 + i; this.ha ^= ZA[z]; this.hb ^= ZB[z]; }
  /** 53-bit key: board+moved, side to move, remaining dice, en-passant rights. */
  key() {
    let a = this.ha, b = this.hb; const d = this.dice;
    if (this.turn) { a ^= ZTA; b ^= ZTB; }
    for (let k = 0; k < 6; k++) if (d[k]) { a ^= ZDA[k * 4 + d[k]]; b ^= ZDB[k * 4 + d[k]]; }
    for (let i = 0; i < this.epN; i++) { const z = this.ep[i * 2] * 2 + this.ep[i * 2 + 1]; a ^= ZEA[z]; b ^= ZEB[z]; }
    return (a >>> 0) * 2097152 + (b >>> 11);
  }
  /** Key of a finished turn (rights of the mover only, as the engine keeps after settle). */
  endKey(mover) {
    let a = this.ha, b = this.hb; if (1 - mover) { a ^= ZTA; b ^= ZTB; }
    for (let i = 0; i < this.epN; i++) if (this.ep[i * 2 + 1] === mover) { const z = this.ep[i * 2] * 2 + mover; a ^= ZEA[z]; b ^= ZEB[z]; }
    return (a >>> 0) * 2097152 + (b >>> 11);
  }
  diceTotal() { const d = this.dice; return d[0] + d[1] + d[2] + d[3] + d[4] + d[5]; }
  kingSquare(color) { const c = code(KING, color); for (let i = 0; i < 64; i++) if (this.C[i] === c) return i; return -1; }

  /** Geometric moves for `turn` with remaining dice into mv[depth*MPD…]; same order as the original engine. */
  gen(depth, turn = this.turn) {
    const C = this.C, d = this.dice, mv = this.mv; let n = depth * MPD; const start = n;
    const own = turn === 0 ? 1 : 7, oppLo = turn === 0 ? 7 : 1;
    for (let from = 0; from < 64; from++) {
      const c = C[from]; if (c < own || c > own + 5) continue; const k = c - own; if (!d[k]) continue;
      if (k === PAWN) {
        const x = from & 7, y = from >> 3, dy = turn === 0 ? -1 : 1, ny = y + dy; if (ny < 0 || ny > 7) continue;
        const to = ny * 8 + x, last = ny === 0 || ny === 7;
        if (!C[to]) {
          if (last) { for (let p = 1; p <= 4; p++) mv[n++] = from | to << 6 | p << 12; } else mv[n++] = from | to << 6;
          if (!this.M[from] && y === (turn === 0 ? 6 : 1)) { const t2 = to + dy * 8; if (!C[t2]) mv[n++] = from | t2 << 6; }
        }
        for (let dx = -1; dx <= 1; dx += 2) {
          const nx = x + dx; if (nx < 0 || nx > 7) continue; const t = to + dx, tc = C[t];
          if (tc) { if (tc >= oppLo && tc <= oppLo + 5) { if (last) { for (let p = 1; p <= 4; p++) mv[n++] = from | t << 6 | p << 12; } else mv[n++] = from | t << 6; } }
          else for (let i = 0; i < this.epN; i++) {
            const pw = this.ep[i * 2], col = this.ep[i * 2 + 1];
            if (col !== turn && pw === from + dx && pw + (col === 0 ? 8 : -8) === t && C[pw] === (col === 0 ? 1 : 7)) mv[n++] = from | t << 6 | T_EP << 12;
          }
        }
      } else if (k === KNIGHT || k === KING) {
        const T = k === KNIGHT ? KNT[from] : KGT[from];
        for (let i = 0; i < T.length; i++) { const t = T[i], tc = C[t]; if (tc >= own && tc <= own + 5) continue; mv[n++] = from | t << 6; }
        if (k === KING) {
          const home = turn === 0 ? 60 : 4;
          if (from === home && !this.M[from] && d[ROOK]) for (let side = -1; side <= 1; side += 2) {
            const rf = home + (side < 0 ? -4 : 3); if (C[rf] !== own + ROOK || this.M[rf]) continue;
            let clear = true; for (let q = home + side; q !== rf; q += side) if (C[q]) { clear = false; break; }
            if (clear) mv[n++] = from | (home + 2 * side) << 6 | T_CASTLE << 12;
          }
        }
      } else {
        const d0 = k === ROOK ? 4 : 0, d1 = k === BISHOP ? 4 : 8, R = RAYS[from];
        for (let di = d0; di < d1; di++) { const ray = R[di]; for (let i = 0; i < ray.length; i++) { const t = ray[i], tc = C[t]; if (tc >= own && tc <= own + 5) break; mv[n++] = from | t << 6; if (tc) break; } }
      }
    }
    return n - start;
  }
  isKingAt(sq) { const c = this.C[sq]; return c === 6 || c === 12; }

  make(m) {
    const C = this.C, M = this.M, U = this.U, u = this.sp * 12, from = m & 63, to = (m >> 6) & 63, type = m >> 12;
    U[u] = C[to]; U[u + 1] = M[to]; U[u + 2] = C[from]; U[u + 3] = M[from]; U[u + 8] = this.captured; U[u + 9] = this.winner; U[u + 10] = this.mat[0]; U[u + 11] = this.mat[1];
    const es = this.sp * 33; this.epStack[es] = this.epN; for (let i = 0; i < this.epN * 2; i++) this.epStack[es + 1 + i] = this.ep[i];
    this.sp++;
    const piece = C[from], kind = (piece - 1) % 6, col = piece > 6 ? 1 : 0;
    if (C[to]) { this.captured = 1; this.mat[1 - col] -= MAT_VALUES[(C[to] - 1) % 6]; if ((C[to] - 1) % 6 === KING) this.winner = col; }
    if (type >= 1 && type <= 4) this.mat[col] += MAT_VALUES[type] - MAT_VALUES[PAWN];
    this.tog(from); if (C[to]) this.tog(to);
    C[to] = type >= 1 && type <= 4 ? piece + type : piece; M[to] = 1; C[from] = 0; M[from] = 0; this.tog(to);
    let epCap = -1;
    if (type === T_EP) { epCap = to + (col === 0 ? 8 : -8); U[u + 4] = C[epCap]; U[u + 5] = M[epCap]; this.tog(epCap); C[epCap] = 0; M[epCap] = 0; this.captured = 1; this.mat[1 - col] -= MAT_VALUES[PAWN]; }
    if (type === T_CASTLE) { const rf = to > from ? from + 3 : from - 4, rt = to > from ? from + 1 : from - 1; U[u + 6] = C[rf]; U[u + 7] = M[rf]; this.tog(rf); C[rt] = C[rf]; M[rt] = 1; C[rf] = 0; M[rf] = 0; this.tog(rt); }
    if (this.rules === 2) {
      let w = 0; for (let i = 0; i < this.epN; i++) { const pw = this.ep[i * 2]; if (pw === from || pw === to || pw === epCap) continue; this.ep[w * 2] = pw; this.ep[w * 2 + 1] = this.ep[i * 2 + 1]; w++; }
      this.epN = w; if (kind === PAWN && (to - from === 16 || from - to === 16)) { this.ep[w * 2] = to; this.ep[w * 2 + 1] = col; this.epN++; }
    }
    if (type === T_CASTLE) { this.dice[KING]--; this.dice[ROOK]--; } else this.dice[kind]--;
  }
  unmake(m) {
    this.sp--;
    const C = this.C, M = this.M, U = this.U, u = this.sp * 12, from = m & 63, to = (m >> 6) & 63, type = m >> 12;
    const piece = U[u + 2], kind = (piece - 1) % 6, col = piece > 6 ? 1 : 0;
    if (type === T_CASTLE) { this.dice[KING]++; this.dice[ROOK]++; } else this.dice[kind]++;
    if (type === T_CASTLE) { const rf = to > from ? from + 3 : from - 4, rt = to > from ? from + 1 : from - 1; this.tog(rt); C[rf] = U[u + 6]; M[rf] = U[u + 7]; C[rt] = 0; M[rt] = 0; this.tog(rf); }
    if (type === T_EP) { const e = to + (col === 0 ? 8 : -8); C[e] = U[u + 4]; M[e] = U[u + 5]; this.tog(e); }
    this.tog(to); C[to] = U[u]; M[to] = U[u + 1]; if (C[to]) this.tog(to);
    C[from] = piece; M[from] = U[u + 3]; this.tog(from);
    this.captured = U[u + 8]; this.winner = U[u + 9]; this.mat[0] = U[u + 10]; this.mat[1] = U[u + 11];
    const es = this.sp * 33; this.epN = this.epStack[es]; for (let i = 0; i < this.epN * 2; i++) this.ep[i] = this.epStack[es + 1 + i];
  }

  // ---------- turn level ----------
  /** Start a turn with three faces (kind indices or names). */
  setDice(faces) { this.dice.fill(0); for (const f of faces) this.dice[typeof f === 'number' ? f : KINDS.indexOf(f)]++; }
  /** Maximum dice still spendable (king capture counts its cost and ends). memo optional. */
  maxSpend(memo = new Map(), depth = 0) {
    const kk = this.key(); const m = memo.get(kk); if (m !== undefined) return m;
    const n = this.gen(depth), base = depth * MPD, total = this.diceTotal(); let best = 0;
    for (let i = 0; i < n && best < total; i++) {
      const mvv = this.mv[base + i], cost = mCost(mvv);
      let v = cost;
      if (!this.isKingAt(mTo(mvv))) { this.make(mvv); v += this.maxSpend(memo, depth + 1); this.unmake(mvv); }
      if (v > best) best = v;
    }
    memo.set(kk, best); return best;
  }
  /** Legal single moves now (mandatory maximum preserved; king capture always legal). */
  legalMoves() {
    if (this.winner >= 0 || this.draw) return [];
    const memo = new Map(), need = this.maxSpend(memo, 0);
    const n = this.gen(0), list = Array.from(this.mv.subarray(0, n)), out = [];
    for (const mvv of list) {
      if (this.isKingAt(mTo(mvv))) { out.push(mvv); continue; }
      this.make(mvv); const v = mCost(mvv) + this.maxSpend(memo, 1); this.unmake(mvv);
      if (v === need) out.push(mvv);
    }
    return out;
  }
  /** True while the current side may still move (dice left and some geometric move exists). */
  canContinue() { return this.winner < 0 && !this.draw && this.diceTotal() > 0 && this.gen(0) > 0; }
  /** Finish the turn (engine `settle`): counters, en-passant expiry, side switch, automatic draw. */
  endTurn() {
    if (this.winner >= 0) return;
    if (this.rules === 2) {
      this.quiet = this.captured ? 0 : this.quiet + 1;
      let w = 0; for (let i = 0; i < this.epN; i++) if (this.ep[i * 2 + 1] === this.turn) { this.ep[w * 2] = this.ep[i * 2]; this.ep[w * 2 + 1] = this.turn; w++; }
      this.epN = w; if (this.quiet >= 100) this.draw = true;
    }
    this.captured = 0; this.dice.fill(0); this.turn = 1 - this.turn; this.sp = 0;
  }
  /** Apply a validated move permanently (keeps nothing on the undo stack). */
  play(m) { this.make(m); this.sp = 0; }

  /**
   * Enumerate legal complete turns of the side to move with the current dice, one pass.
   * Bot convention: if a king capture is available, only that capture is kept at that node.
   * Returns { max, turns:[{moves:number[], win:boolean, key:number}] } — unique endpoints.
   */
  turns() {
    const leaves = [], path = [], seen = new Set(), memo = new Map(), mover = this.turn;
    const total0 = this.diceTotal(), self = this;
    function dfs(depth, spent) {
      const kk = self.key();
      if (seen.has(kk)) return memo.get(kk); seen.add(kk);
      const n = self.gen(depth), base = depth * MPD;
      if (!n) { leaves.push({ moves: path.slice(), win: false, used: spent, key: self.endKey(mover) }); memo.set(kk, 0); return 0; }
      let win = -1; for (let i = 0; i < n; i++) if (self.isKingAt(mTo(self.mv[base + i]))) { win = self.mv[base + i]; break; }
      if (win >= 0) {
        const best = self.maxSpend(memo, depth);
        leaves.push({ moves: [...path, win], win: true, used: spent + best, key: -1 });
        return best;
      }
      let best = 0;
      const list = self.mv.slice(base, base + n);
      for (let i = 0; i < n; i++) {
        const mvv = list[i], cost = mCost(mvv);
        self.make(mvv); path.push(mvv); const v = cost + dfs(depth + 1, spent + cost); path.pop(); self.unmake(mvv);
        if (v > best) best = v;
      }
      memo.set(kk, best); return best;
    }
    if (this.winner >= 0 || this.draw) return { max: 0, turns: [] };
    const max = dfs(0, 0); const out = [], keys = new Set();
    for (const l of leaves) {
      if (l.used !== max) continue;
      if (l.win) { out.push({ moves: l.moves, win: true, key: -1 }); continue; }
      if (keys.has(l.key)) continue; keys.add(l.key); out.push({ moves: l.moves, win: false, key: l.key });
    }
    void total0;
    return { max, turns: out };
  }
  /**
   * Fast scan of all legal complete turns without storing paths: calls leaf(win) with the
   * position at each candidate endpoint and returns the best value according to `better`.
   * Values are aggregated per spent-dice bucket and the bucket equal to the maximum is returned.
   * leafValue(win:boolean) -> number ; minimize=true picks the minimum.
   */
  scanBest(leafValue, minimize, stopValue) {
    // stopValue (optional): the best value that can possibly occur (e.g. 1 = king captured when
    // maximizing). Once a legal leaf reaches it the scan stops — the result is unchanged.
    const memo = new Map(), bucket = [NaN, NaN, NaN, NaN], self = this;
    let winTags = null, stop = false;
    const rootMax = stopValue === undefined ? -1 : this.maxSpend(memo, 0);
    function better(a, b) { return Number.isNaN(b) || (minimize ? a < b : a > b); }
    function dfs(depth, spent) {
      const kk = self.key(); const m = memo.get(kk);
      if (m !== undefined && (rootMax < 0 || self._seen.has(kk))) return m;
      if (rootMax >= 0) self._seen.add(kk);
      const n = self.gen(depth), base = depth * MPD;
      if (!n) { const v = leafValue(false, spent, bucket[spent]); if (better(v, bucket[spent])) bucket[spent] = v; if (spent === rootMax && v === stopValue) stop = true; memo.set(kk, 0); return 0; }
      for (let i = 0; i < n; i++) if (self.isKingAt(mTo(self.mv[base + i]))) {
        const best = self.maxSpend(memo, depth); (winTags ??= []).push(spent + best);
        if (rootMax >= 0 && spent + best === rootMax && leafValue(true) === stopValue) stop = true;
        return best;
      }
      // children use deeper regions of mv, so this depth's move list stays intact (no copy needed)
      let best = 0;
      for (let i = 0; i < n && !stop; i++) {
        const mvv = self.mv[base + i], cost = mCost(mvv);
        self.make(mvv); const v = cost + dfs(depth + 1, spent + cost); self.unmake(mvv);
        if (v > best) best = v;
      }
      if (!stop) memo.set(kk, best); return best;
    }
    if (rootMax >= 0) { (this._seen ??= new Set()).clear(); }
    const max = rootMax >= 0 ? (dfs(0, 0), rootMax) : dfs(0, 0);
    if (winTags && winTags.includes(max)) return { max, win: true, value: leafValue(true) };
    return { max, win: false, value: bucket[max] };
  }
}

// ---------- dice ----------
/** 56 unordered throws with their probability (multiplicity/216). */
export const ROLLS = (() => {
  const r = [];
  for (let a = 0; a < 6; a++) for (let b = a; b < 6; b++) for (let c = b; c < 6; c++) {
    const d = new Int8Array(6); d[a]++; d[b]++; d[c]++;
    r.push({ dice: d, faces: [a, b, c], w: (a === c ? 1 : a === b || b === c ? 3 : 6) / 216 });
  }
  return r;
})();
/** Mulberry32, identical to benchmarks/core.ts seededRandom in the original project. */
export function seededRandom(seed) {
  return () => {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
export const rollFaces = random => [0, 1, 2].map(() => Math.floor(random() * 6));

// ---------- compatibility with the original engine JSON ----------
export function fromGame(game) {
  const p = new Position(); p.rules = game.rulesVersion === 2 ? 2 : 1;
  for (let i = 0; i < 64; i++) { const q = game.board[i]; if (q) { p.C[i] = code(KINDS.indexOf(q.kind), q.color === 'white' ? 0 : 1); p.M[i] = q.moved ? 1 : 0; } }
  p.turn = game.turn === 'white' ? 0 : 1;
  for (const r of game.enPassant ?? []) { p.ep[p.epN * 2] = r.pawn; p.ep[p.epN * 2 + 1] = r.color === 'white' ? 0 : 1; p.epN++; }
  p.quiet = game.quietTurns ?? 0; p.captured = game.turnCaptured ? 1 : 0;
  if (game.phase === 'move') p.setDice(game.dice);
  p.winner = game.winner === 'white' ? 0 : game.winner === 'black' ? 1 : -1; p.draw = game.draw === 'fifty-moves';
  p.rehash(); return p;
}
export function toGame(p, extra = {}) {
  const board = Array.from(p.C, (c, i) => c ? { kind: KINDS[kindOf(c)], color: colorOf(c) ? 'black' : 'white', moved: !!p.M[i] } : null);
  const dice = []; for (let k = 0; k < 6; k++) for (let j = 0; j < p.dice[k]; j++) dice.push(KINDS[k]);
  const enPassant = []; for (let i = 0; i < p.epN; i++) { const pw = p.ep[i * 2], col = p.ep[i * 2 + 1]; enPassant.push({ pawn: pw, target: pw + (col === 0 ? 8 : -8), color: col ? 'black' : 'white' }); }
  const over = p.winner >= 0 || p.draw;
  return { ...(p.rules === 2 ? { rulesVersion: 2, enPassant, quietTurns: p.quiet, turnCaptured: !!p.captured, ...(p.draw ? { draw: 'fifty-moves' } : {}) } : {}),
    board, turn: p.turn ? 'black' : 'white', dice: over ? [] : dice, phase: over ? 'over' : dice.length ? 'move' : 'roll',
    winner: p.winner < 0 ? null : p.winner ? 'black' : 'white', turnNumber: extra.turnNumber ?? 1, log: [] };
}
/** Move -> original Action object (same key order as the original engine). */
export function moveToAction(p, m) {
  const from = mFrom(m), to = mTo(m), t = mType(m), kind = KINDS[kindOf(p.C[from])];
  if (t === T_CASTLE) { const side = to > from ? 1 : -1; return { from, to, cost: ['king', 'rook'], castle: { from: from + (side < 0 ? -4 : 3), to: from + side } }; }
  if (t >= 1 && t <= 4) return { from, to, cost: ['pawn'], promotion: KINDS[t] };
  if (t === T_EP) return { from, to, cost: ['pawn'], enPassant: to + (colorOf(p.C[from]) === 0 ? 8 : -8) };
  return { from, to, cost: [kind] };
}
export function actionToMove(a) {
  const type = a.castle ? T_CASTLE : a.promotion ? KINDS.indexOf(a.promotion) : a.enPassant !== undefined ? T_EP : 0;
  return a.from | a.to << 6 | type << 12;
}
export function moveName(p, m) {
  const from = mFrom(m), to = mTo(m), t = mType(m), cap = p.C[to] || t === T_EP;
  const sym = ['', 'N', 'B', 'R', 'Q', 'K'][kindOf(p.C[from])];
  if (t === T_CASTLE) return to > from ? 'O-O' : 'O-O-O';
  return sym + squareName(from) + (cap ? 'x' : '-') + squareName(to) + (t >= 1 && t <= 4 ? '=' + ['', 'N', 'B', 'R', 'Q'][t] : '') + (t === T_EP ? ' e.p.' : '');
}
