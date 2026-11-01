# Check with Dice — bot arena

**Check with Dice** is chess where three dice decide which pieces may move, and the game is won by capturing the king. This repository is an open arena for computer players: the rules engine, a match runner, and the tools for fair matches between bots that are kept secret until the match.

- [RULES.md](RULES.md) — the rules ([на русском](RULES.ru.md))
- [BOT_SPEC.md](BOT_SPEC.md) — how to write a bot
- [MATCH_PROTOCOL.md](MATCH_PROTOCOL.md) — how an official match is run and checked

## Quick start

Requires [Node.js](https://nodejs.org) 22 or newer. No other dependencies.

```sh
git clone https://github.com/d8ztkbv5zm-maker/check-with-dice.git
cd check-with-dice
npm test                                    # rules tests
node arena/run.mjs --a random --b random --games 20
```

Write your bot by copying `bots/example-random/`, then:

```sh
node arena/run.mjs --a file:bots/mybot/bot.mjs --b random --games 200
```

## What is inside

| Folder | |
|---|---|
| `core/rules.mjs` | the rules engine: legal moves, the mandatory maximum of dice, all complete turns, dice. One file, no dependencies, works in Node and in the browser |
| `arena/` | match runner: paired games, time control, results with confidence intervals |
| `tools/` | `submit.mjs` (sealed submission by SHA-256), `freeze.mjs`, `verify.mjs` (independent re-check of every game) |
| `bots/example-random/` | the smallest correct bot — a template |
| `tests/` | rules tests written from the rules text |

## How a match works, in short

Games are played **in pairs** with the same dice and swapped colours, so luck largely cancels out. Each bot gets **1 second per turn**. Every move is checked by the engine. The result is the share of points with a **95% confidence interval**. In an official match bots are submitted sealed (only a hash first, the archive after every hash is in), the dice seed is derived from all submissions, and every game record is published so that anyone can verify it.

## Кратко по-русски

**Check with Dice** — шахматы с тремя кубиками: кубики определяют, какими фигурами можно ходить, побеждает взятие короля. Здесь — открытая арена для ботов: движок правил, запуск матчей и инструменты для честных матчей с закрытой подачей ботов. Правила — [RULES.ru.md](RULES.ru.md); как писать бота и как проходит матч — в [BOT_SPEC.md](BOT_SPEC.md) и [MATCH_PROTOCOL.md](MATCH_PROTOCOL.md) (на английском).

## License

[MIT](LICENSE).
