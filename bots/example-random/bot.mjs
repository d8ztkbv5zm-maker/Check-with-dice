// Example bot: plays a random legal full turn. Copy this folder to start your own bot (see BOT_SPEC.md).
// A bot may import files from its own folder and the shared rules core, nothing else from this repository.
import { moveName } from '../../core/rules.mjs';

export default {
  name: 'Random (example)',
  /**
   * @param pos  Position from core/rules.mjs: it is your turn and the dice are already thrown (pos.dice).
   *             It is a copy: you may change it freely.
   * @param opts { timeMs, turnNumber }
   * @returns    { moves: number[] } — the complete turn, moves in order.
   */
  choose(pos, { timeMs, turnNumber }) {
    const { turns } = pos.turns();                       // every legal complete turn (one per resulting position)
    const win = turns.find(t => t.win);                  // capturing the king ends the game at once
    const pick = win ?? turns[Math.floor(Math.random() * turns.length)];
    // moveName(pos, m) gives a readable name ("Ng1-f3") for a move legal in the current position — handy for logs.
    return { moves: pick.moves };
  },
};
