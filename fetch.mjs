// Step 2: pull WD-40's numbers from the SEC, build all eight signal cards,
// and save everything to data/WDFC.json.
// No numbers are typed in here. Everything comes from the SEC's companyfacts API.
// The card logic lives in signals.mjs.

import { mkdir, writeFile } from "node:fs/promises";
import { buildCards } from "./signals.mjs";

const TICKER = "WDFC";
const CIK = "0000105132"; // WD-40 Company's SEC id, padded to 10 digits

const UA = process.env.SEC_USER_AGENT;
if (!UA) {
  console.error("Missing SEC_USER_AGENT. Copy .env.example to .env and fill it in.");
  process.exit(1);
}

// ---------- 1. Fetch ----------
const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${CIK}.json`;
const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Encoding": "gzip, deflate" } });
if (!res.ok) throw new Error(`SEC answered ${res.status} for ${url}`);
const facts = await res.json();

// ---------- 2. Build and save ----------
const out = { ticker: TICKER, cik: CIK, fetched_at: new Date().toISOString(), source_api: url, ...buildCards(facts, CIK) };
await mkdir("data", { recursive: true });
await writeFile(`data/${TICKER}.json`, JSON.stringify(out, null, 2));

// ---------- 3. Print the cards ----------
const { this_year: T, last_year: L } = out.fiscal;
console.log(`${out.company} — ${T.fy} (ends ${T.end}) vs ${L.fy} (ends ${L.end}) — ${out.unit}\n`);
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

// ---------- 4. Print what to check ----------
console.log(`CHECK THESE AGAINST THE 10-K filed ${out.filing.filed}: ${out.filing.url}`);
console.log(`Tip: press Cmd+F and search for the number itself, then check the row name beside it.\n`);
const pad = (s, n) => String(s).padEnd(n);
console.log(`   ${pad("Item", 22)}${pad(T.fy, 12)}${pad(L.fy, 12)}Where`);
for (const i of out.inputs) {
  console.log(`   ${pad(i.item, 22)}${pad(Math.round(i.this_year.usd / 1000).toLocaleString("en-US"), 12)}${pad(Math.round(i.last_year.usd / 1000).toLocaleString("en-US"), 12)}${i.statement}`);
}
console.log(`\nNot found in the SEC data: ${out.missing.join(", ")}`);
console.log(`Saved to data/${TICKER}.json`);
