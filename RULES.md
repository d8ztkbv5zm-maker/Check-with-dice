# Check with Dice — rules (version 2)

*Russian version: [RULES.ru.md](RULES.ru.md).*

Check with Dice is chess where three dice decide which pieces may move. There is no check and no mate: you win by capturing the king.

## Board and pieces

1. Standard 8×8 board and the standard chess starting position. White moves first.
2. Pieces move and capture as in chess, but nothing is checked about the safety of the king: a king may move into attack, kings may stand next to each other. You cannot capture your own piece; only the knight jumps over pieces. A pawn moves forward, captures diagonally and may make a double step from its starting rank if both squares are free.

## Dice

3. At the start of every turn the player throws **three dice**. Each die has six equally likely faces: **pawn, knight, bishop, rook, queen, king**. Throws are independent; there are no re-throws.
4. Each die allows one move of a piece of that type. During the turn the dice may be used **in any order**. If two or three dice show the same face, the same piece may move several times.
5. **Mandatory maximum.** The player must use the **largest possible number of dice** this throw allows, counting the whole turn. A move after which that maximum can no longer be reached is not allowed. Among equally long options the player chooses freely. If no die can be used, the turn passes.
6. **Capturing the king ends the game at once** with a win for the capturing side, even if other dice remain.

## Special moves

7. **Castling** uses **two dice: king and rook**. The king and that rook must not have moved, and the squares between them must be empty. Attacked squares do not prevent castling (there is no check). Castling counts as two used dice for the mandatory maximum.
8. **Promotion** uses **only the pawn die**. The pawn becomes a knight, bishop, rook or queen; a die of the new piece is not needed. Only promotions that still allow the mandatory maximum are allowed. The new piece may use the remaining dice of its type in the same turn. Several queens are allowed. Capturing the king while promoting ends the game at once.
9. **En passant**: a pawn's double step can be taken en passant until the end of the opponent's next full turn. The opponent may first move other pieces and then capture. The capture uses one pawn die; the destination square must be empty. If the double-stepped pawn moves again or is captured, the right disappears.

## End of the game

10. **Win** — by capturing the king.
11. **Draw** — automatically after **100 completed side-turns (50 pairs) without a capture**. A forced pass counts as a turn. A pawn move without capture does not reset the counter; any capture, including en passant, does.
12. Stalemate, threefold repetition and insufficient material do **not** end the game.

### Example of the mandatory maximum

White: Ke1, Rh1 (both unmoved, path free), Rb2 blocking the bishop on a1. Dice: king, rook, bishop. Castling uses two dice, but then the bishop stays blocked: only two dice used. Instead Rb2–b3, Ba1–b2 and Ke1–f1 use all three dice. So castling is **not** allowed in this position. If the bishop were free to use the third die after castling, castling would be allowed.

### Example of promotion

Pawn on a7; dice pawn, knight, knight; White has no other knights. After a7–a8=N both remaining knight dice can be used, so promoting to queen, rook or bishop (which would leave them unused) is not allowed. With only one pawn die and no other limits, all four promotions are allowed.

## In the arena

The arena plays single games with these rules. Matches with a doubling cube exist in the app but are not part of the arena. An arena game that reaches 400 side-turns is stopped and scored as half a point for each side (`limit`); in practice games are far shorter.

## Game record

One side-turn is a throw and all the moves made with it. Example: dice ♘ ♘ ♙, moves `♘g1–f3 ♘f3–e5 ♙d2–d4`. Castling is one action that moves two pieces: `♔e1–g1 / ♖h1–f1`. In the arena's JSON records, each move is an object `{ from, to, cost, ... }` with squares numbered 0 = a8 … 63 = h1 (see [BOT_SPEC.md](BOT_SPEC.md)).
