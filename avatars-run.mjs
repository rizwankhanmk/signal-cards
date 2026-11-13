// AVATAR test run: how often do the three analysts disagree on real companies?
//   npm run avatars                 -> a spread of twenty well-known companies
//   npm run avatars AAPL COST NKE   -> the ones you name
// It prints one table per company and a summary at the end. Nothing is saved or changed.
// The aim: the three should disagree on roughly a third of cards. Far more, and the game is noise.
// Far fewer, and the avatars are decoration.

import { cardsFor } from "./sec.mjs";
import { readCompany, AVATARS } from "./avatars.mjs";

const SPREAD = ["AAPL", "MSFT", "NVDA", "COST", "WMT", "NKE", "WDFC", "KO", "MCD", "PG", "TSLA", "F", "BA", "CAT", "PFE", "INTC", "AMZN", "DIS", "T", "XOM"];
const tickers = process.argv.slice(2).length ? process.argv.slice(2) : SPREAD;
const WORD = { good: "Good", watch: "Watch", warn: "Warning" };
const pad = (s, n) => String(s ?? "").padEnd(n);
const who = Object.keys(AVATARS);

const all = [];
for (const t of tickers) {
  let out;
  try { out = await cardsFor(t, process.env.SEC_USER_AGENT, { fresh: true }); }
  catch (e) { console.log(`\n${t.toUpperCase()}: ${e.message}`); continue; }
  const rows = readCompany(out.cards);
  if (!rows.length) { console.log(`\n${out.ticker} — ${out.company}: no cards with a label.`); continue; }
  console.log(`\n${out.ticker} — ${out.company} — ${out.fiscal.this_year.fy}`);
  console.log(`   ${pad("Card", 26)}${pad("Today", 10)}${pad("Owl", 10)}${pad("Bull", 10)}${pad("Bear", 10)}`);
  for (const r of rows) console.log(`   ${pad(r.signal, 26)}${pad(WORD[r.house], 10)}${who.map(a => pad(WORD[r[a]], 10)).join("")}${r.agree ? "" : "split"}`);
  const split = rows.filter(r => !r.agree).length;
  console.log(`   ${split} of ${rows.length} cards split.`);
  all.push(...rows.map(r => ({ ...r, ticker: out.ticker })));
}

if (all.length) {
  const pct = n => `${Math.round(n / all.length * 100)}%`;
  const split = all.filter(r => !r.agree);
  console.log(`\n${"=".repeat(60)}\nSUMMARY: ${all.length} cards across ${new Set(all.map(r => r.ticker)).size} companies`);
  console.log(`Cards where the three disagree: ${split.length} (${pct(split.length)}). Aim: about a third.`);
  console.log(`Cards where they are as far apart as possible (one Good, one Warning): ${all.filter(r => who.some(a => r[a] === "good") && who.some(a => r[a] === "warn")).length}`);
  for (const a of who) console.log(`   ${pad(AVATARS[a].name, 10)} Good ${pct(all.filter(r => r[a] === "good").length)}, Watch ${pct(all.filter(r => r[a] === "watch").length)}, Warning ${pct(all.filter(r => r[a] === "warn").length)}, differs from today's label on ${pct(all.filter(r => r[a] !== r.house).length)}`);
  console.log(`\nSplit rate by card:`);
  for (const s of [...new Set(all.map(r => r.signal))]) { const of = all.filter(r => r.signal === s); console.log(`   ${pad(s, 26)}${of.filter(r => !r.agree).length} of ${of.length}`); }
}
