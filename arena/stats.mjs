// Match statistics for paired games (same throws, swapped colours).
// The confidence interval is computed over pairs: each pair's mean score is one observation.
export function summarize(games, a, b) {
  const s = { a, b, games: games.length, aWins: 0, bWins: 0, draws: 0, unfinished: 0, errors: 0, timeLoss: { [a]: 0, [b]: 0 }, slow: { [a]: 0, [b]: 0 }, aWhiteWins: 0, aBlackWins: 0, whiteWins: 0, turns: 0, ms: { [a]: [], [b]: [] } };
  const pairs = new Map();
  for (const g of games) {
    const r = g.result, aColor = g.white === a ? 'white' : 'black';
    let pts;
    if (r.winner === null) { if (r.reason === 'draw') s.draws++; else s.unfinished++; pts = 0.5; }
    else if (r.winner === aColor) { s.aWins++; pts = 1; if (aColor === 'white') s.aWhiteWins++; else s.aBlackWins++; }
    else { s.bWins++; pts = 0; }
    if (r.winner === 'white') s.whiteWins++;
    if (['error', 'illegal', 'incomplete'].includes(r.reason)) s.errors++;
    if (r.reason === 'time') { const loser = r.winner === 'white' ? g.black : g.white; if (loser in s.timeLoss) s.timeLoss[loser]++; }
    for (const t of g.turns) if (t.slow) { const who = t.color === 'white' ? g.white : g.black; if (who in s.slow) s.slow[who]++; }
    s.turns += g.turns.length;
    for (const t of g.turns) if (t.actions.length) s.ms[t.color === 'white' ? g.white : g.black]?.push(t.ms);
    const p = pairs.get(g.pair) ?? []; p.push(pts); pairs.set(g.pair, p);
  }
  const n = s.games, score = (s.aWins + 0.5 * (s.draws + s.unfinished)) / Math.max(1, n);
  const pm = [...pairs.values()].filter(p => p.length === 2).map(p => (p[0] + p[1]) / 2);
  const mean = pm.reduce((x, y) => x + y, 0) / Math.max(1, pm.length);
  const sd = Math.sqrt(pm.reduce((x, y) => x + (y - mean) ** 2, 0) / Math.max(1, pm.length - 1));
  const se = pm.length > 1 ? sd / Math.sqrt(pm.length) : NaN;
  const elo = x => x <= 0 ? -Infinity : x >= 1 ? Infinity : -400 * Math.log10(1 / x - 1);
  const q = (arr, p) => { if (!arr.length) return null; const v = [...arr].sort((x, y) => x - y); return v[Math.min(v.length - 1, Math.floor(p * v.length))]; };
  return {
    ...s, ms: undefined, score: +score.toFixed(4), pairs: pm.length,
    ci95: pm.length > 1 ? [+Math.max(0, mean - 1.96 * se).toFixed(4), +Math.min(1, mean + 1.96 * se).toFixed(4)] : null,
    eloDiff: Number.isFinite(elo(score)) ? Math.round(elo(score)) : null,
    avgTurns: +(s.turns / Math.max(1, n)).toFixed(1),
    timing: Object.fromEntries([a, b].map(id => [id, { decisions: s.ms[id].length, p50: q(s.ms[id], .5), p95: q(s.ms[id], .95), max: q(s.ms[id], 1) }])),
    verdict: pm.length > 1 ? (mean - 1.96 * se > 0.5 ? `${a} is stronger (95%)` : mean + 1.96 * se < 0.5 ? `${b} is stronger (95%)` : 'difference not proven') : 'not enough games',
  };
}

export function markdown(sum, meta) {
  const pct = x => (x * 100).toFixed(1) + '%';
  return `# ${sum.a} vs ${sum.b}

${meta}

| | |
|---|---|
| Games | ${sum.games} (pairs: ${sum.pairs}) |
| Wins ${sum.a} | ${sum.aWins} (as white ${sum.aWhiteWins}, as black ${sum.aBlackWins}) |
| Wins ${sum.b} | ${sum.bWins} |
| Draws / unfinished / bot errors | ${sum.draws} / ${sum.unfinished} / ${sum.errors} |
| Score ${sum.a} | **${pct(sum.score)}** |
| 95% CI (over pairs) | ${sum.ci95 ? sum.ci95.map(pct).join(' – ') : '—'} |
| Elo difference (estimate) | ${sum.eloDiff ?? '—'} |
| Verdict | **${sum.verdict}** |
| Losses on time | ${sum.a}: ${sum.timeLoss[sum.a]}, ${sum.b}: ${sum.timeLoss[sum.b]} |
| Slow-move warnings | ${sum.a}: ${sum.slow[sum.a]}, ${sum.b}: ${sum.slow[sum.b]} |
| White wins (all games) | ${sum.whiteWins} |
| Average length, side-turns | ${sum.avgTurns} |

| Bot | decisions | p50, ms | p95, ms | max, ms |
|---|---:|---:|---:|---:|
${Object.entries(sum.timing).map(([id, t]) => `| ${id} | ${t.decisions} | ${t.p50?.toFixed(1) ?? '—'} | ${t.p95?.toFixed(1) ?? '—'} | ${t.max?.toFixed(1) ?? '—'} |`).join('\n')}
`;
}
