# Official match protocol

How two (or more) participants play a fair match when they do not want to show each other their bots in advance, and how anyone can check the result afterwards.

## Standard conditions

| | |
|---|---|
| Games | agreed in advance; at least 1000 recommended, always an even number |
| Pairing | games are played in pairs: both games of a pair have the same sequence of throws, the bots swap colours. Luck with the dice largely cancels out |
| Time | 1000 ms per decision, not accumulated; > 1500 ms — warning; > 3000 ms — loss of that game |
| Bots | single-threaded, see [BOT_SPEC.md](BOT_SPEC.md) |
| Result | share of points of each bot with a 95% confidence interval over pairs |

## Steps

1. **Agree** on the number of games, the deadline and who runs the match (the *organiser*). The organiser publishes the version (git commit) of this repository that will be used.
2. **Commit.** At the deadline every participant sends the organiser the **SHA-256 of the archive** of their bot (zip or tar.gz) — one line of text, e.g. from `shasum -a 256 mybot.tar.gz`. The organiser records it:
   ```sh
   node tools/submit.mjs commit <name> <sha256>
   ```
   A recorded commitment cannot be changed. Nobody can learn anything about a bot from its hash.
3. **Reveal.** Once **every** hash is in, each participant sends the **same archive, unchanged**. The organiser puts it as delivered into `match/submissions/<name>.tar.gz` (or `.zip`). It is checked byte for byte: repacking the same files usually gives a different hash, so the original file must be sent.
4. **Verify, unpack and freeze:**
   ```sh
   node tools/submit.mjs unpack      # every archive must match its commitment
   node tools/freeze.mjs --check     # nothing changed since the freeze
   ```
   `unpack` copies each bot to `bots/<name>/`, records the SHA-256 of every bot and arena file in `match/freeze.json`, and prints the match seed.
5. **Seed.** The dice seed is derived from all commitments together (`node tools/submit.mjs seed`). Nobody knows it before the last hash is in, and nobody can choose it alone.
6. **Run:**
   ```sh
   node arena/run.mjs --a file:bots/<name1>/bot.mjs --b file:bots/<name2>/bot.mjs --games 3000 --seed-from-commitments --out match-<date>
   ```
7. **Publish** the folder `results/match-<date>/` (every game record, `run.json`, `summary.md`) together with `match/commitments.json` and `match/freeze.json`. Participants may publish their bots afterwards.

## Checking a published match

Anyone can check a match without running the bots:

```sh
node tools/verify.mjs results/match-<date>
```

It re-creates the dice of every game from the seed, replays every recorded move through the rules core and checks that it was legal, that every turn used the mandatory maximum, that each result follows from the moves, and that the summary is correct. It also compares the arena files with the SHA-256 stored in `run.json`.

If the bots are published, anyone can also re-run the match with the same seed. The moves will usually be the same; small differences are possible where a bot's decision depends on how much it managed to compute in the time available.

## What this protects against — and what it does not

- **Changing a bot after seeing the opponent's:** impossible, the archive must match the hash sent before.
- **Tuning a bot to known dice:** impossible, the seed is unknown until all hashes are in.
- **Quietly changing the arena or a result:** visible, the arena files are hashed in `run.json`, and `verify.mjs` recomputes everything from the records.
- **The organiser's machine:** decision times depend on the computer. The organiser publishes the CPU (it is recorded in `run.json`); participants should leave a safe margin under the time limits.
- **Trust in the organiser running exactly these bots:** if both bots are published after the match, anyone can re-run it.
