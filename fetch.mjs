// Pull one or more companies from the SEC, print their eight signal cards, and save them in data/.
//   npm run fetch              -> WD-40 (WDFC)
//   npm run fetch AAPL COST    -> Apple and Costco
// No numbers are typed in here. The card logic lives in signals.mjs, the SEC calls in sec.mjs.

import { cardsFor } from "./sec.mjs";

const tickers = process.argv.slice(2).length ? process.argv.slice(2) : ["WDFC"];
const pad = (s, n) => String(s).padEnd(n);
let failed = 0;

for (const t of tickers) {
  let out;
  try { out = await cardsFor(t, process.env.SEC_USER_AGENT, { fresh: true }); }
  catch (e) { failed++; console.log(`\n${"=".repeat(70)}\n${t.toUpperCase()}: ${e.message}\n`); continue; }

  const { this_year: T, last_year: L } = out.fiscal;
  console.log(`\n${"=".repeat(70)}`);
  console.log(`${out.ticker} — ${out.company} — ${T.fy} (ends ${T.end}) vs ${L.fy} (ends ${L.end}) — ${out.unit}`);
  if (out.industry) console.log(`SEC industry: ${out.industry}`);
  console.log("");
  out.cards.forEach((c, n) => {
    console.log(`${n + 1}. ${c.signal.toUpperCase()}`);
    for (const r of c.rows) {
      console.log(`   ${r.item}: ${r.this_year} vs ${r.last_year}`);
      for (const line of r.formula) console.log(`      ${line}`);
    }
    if (c.label) console.log(`   Label: ${c.label.name}. ${c.label.reason}`);
    else console.log(`   ${c.state}. ${c.note}`);
    console.log("");
  });

  console.log(`CHECK THESE AGAINST THE 10-K filed ${out.filing.filed}: ${out.filing.url}`);
  console.log(`Tip: press Cmd+F and search for the number itself, then check the row name beside it.\n`);
  console.log(`   ${pad("Item", 22)}${pad(T.fy, 12)}${pad(L.fy, 12)}${pad("Where", 26)}SEC tag`);
  for (const i of out.inputs) console.log(`   ${pad(i.item, 22)}${pad(i.shown[0], 12)}${pad(i.shown[1], 12)}${pad(i.statement, 26)}${i.tag}`);
  console.log(`\nNot found in the SEC data: ${out.missing.join(", ")}`);
  for (const [item, tags] of Object.entries(out.lookalikes)) console.log(`   Look-alike tags for ${item}: ${tags.join("; ")}`);
  console.log(`Saved to data/${out.ticker}.json`);
}
process.exit(failed ? 1 : 0);
