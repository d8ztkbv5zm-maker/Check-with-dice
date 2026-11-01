// Bot loading. A bot id is either a built-in name or 'file:<path>' to a bot.mjs inside this repository.
//   file:bots/example-random/bot.mjs   — default export { name, choose(pos, { timeMs, turnNumber }) }
import { resolve, sep } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, '');

export async function loadBot(id) {
  const base = id.replace(/#\d+$/, ''); // 'x#2' = the same bot under a second id (a bot against itself)
  const path = base === 'random' ? 'bots/example-random/bot.mjs' : base.startsWith('file:') ? base.slice(5) : null;
  if (!path) throw new Error(`Unknown bot "${id}". Use file:bots/<name>/bot.mjs or "random".`);
  const f = resolve(root, path);
  if (!f.startsWith(root + sep)) throw new Error(`${id}: bot file must be inside the repository`);
  const mod = await import(pathToFileURL(f).href), bot = mod.default;
  if (!bot || typeof bot.choose !== 'function') throw new Error(`${id}: default export must have choose(pos, opts)`);
  return { ...bot, id, name: bot.name ?? id, choose: (pos, opts) => bot.choose.call(bot, pos, opts) };
}
