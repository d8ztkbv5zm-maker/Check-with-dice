# Writing a bot

A bot is one JavaScript module (ES module, Node.js 22 or newer) in its own folder: `bots/<your-name>/bot.mjs`.
Start by copying [`bots/example-random`](bots/example-random/bot.mjs).

## Interface

```js
// bots/<your-name>/bot.mjs
export default {
  name: 'My bot',
  choose(pos, { timeMs, turnNumber }) {
    // pos: Position from core/rules.mjs — it is your turn, the three dice are already thrown.
    // It is a copy: you may change it freely.
    return { moves: [m1, m2, m3] };   // the complete turn: moves in the order they are played
  },
};
```

- `choose` is called once per turn, only when at least one die can be used.
- The returned turn must use the **mandatory maximum of dice** (see [RULES.md](RULES.md)); castling counts as two. If a move captures the king, the game ends there and later moves are ignored.
- `timeMs` is your budget for this decision (1000 ms in standard matches). `turnNumber` counts side-turns from 1.
- `choose` must be synchronous and return the result directly.

## What loses the game

| Situation | Result |
|---|---|
| A move that is not legal at that moment | loss (`illegal`) |
| The turn ends with usable dice left (maximum not reached) | loss (`incomplete`) |
| `choose` throws, or returns something other than `{ moves: [...] }` | loss (`error`) |
| A decision longer than the forfeit limit (3000 ms by default) | loss (`time`) |
| A decision longer than the warning limit (1500 ms by default) | warning in the record, no penalty |

Every move is checked by the rules core before it is applied.

## Rules for bots in official matches

- **Imports:** only files from your own folder and the shared core `../../core/rules.mjs`, plus Node.js built-in modules for reading your own files (e.g. `node:fs` to load weights). Nothing else from this repository: put everything you need into your folder.
- **One thread:** no worker threads, child processes or network. The arena may run several games in parallel, each bot decision runs single-threaded.
- **No knowledge of the dice:** a bot must not try to predict future throws. In official matches the seed is derived from all submissions and unknown until every bot is committed (see [MATCH_PROTOCOL.md](MATCH_PROTOCOL.md)).
- **Size:** keep a bot's folder reasonable (a few tens of MB at most).
- A bot may keep state between calls (caches, opening book), but must not rely on games being played in any particular order.

## The rules core: `core/rules.mjs`

| What | Meaning |
|---|---|
| `pos.turn` | side to move: 0 white, 1 black |
| `pos.dice` | dice still available, counts by kind `[pawn, knight, bishop, rook, queen, king]` |
| `pos.C[0..63]` | board: 0 empty, 1–6 white P N B R Q K, 7–12 black P N B R Q K; square 0 = a8, 7 = h8, 56 = a1, 63 = h1 |
| `pos.M[0..63]` | 1 if the piece on that square has moved (castling) |
| `pos.turns()` | `{ max, turns: [{ moves, win }] }` — **all legal complete turns**, one per resulting position; `win` = captures the king |
| `pos.legalMoves()` | legal single moves right now (respecting the mandatory maximum) |
| `pos.play(m)` | play one move; `pos.clone()` copies; `pos.endTurn()` passes the turn |
| `pos.canContinue()` | true while a die can still be used this turn |
| `pos.winner` / `pos.draw` | −1 while the game goes on; 0 or 1 when a king was captured / true after the 100-turn rule |
| `ROLLS` | the 56 different throws with their probabilities — useful for expectimax search |

**Move encoding** (an integer): `from | to << 6 | type << 12`, where `type` is 0 normal, 1–4 promotion to knight / bishop / rook / queen, 5 castling (given as the king's move), 6 en passant. Helpers: `mFrom(m)`, `mTo(m)`, `mType(m)`, `moveName(pos, m)` → `"Ng1-f3"`, `squareName(sq)` → `"e4"`.

The simplest correct bot picks one element of `pos.turns().turns`. A stronger bot searches: for each candidate turn, consider the opponent's 56 possible throws (`ROLLS`) and their best replies.

## Testing your bot

```sh
node arena/run.mjs --a file:bots/<your-name>/bot.mjs --b random --games 100
node tools/verify.mjs results/<name-printed-by-the-arena>
```

The arena prints the score with a 95% confidence interval and the decision times (p50, p95, max). Before submitting, check that `max` stays well under the forfeit limit on the match machine.
