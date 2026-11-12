// Step 1: pull WD-40's sales and inventory from the SEC, work out growth,
// put a label on it, and save everything to data/WDFC.json.
// No numbers are typed in here. Everything comes from the SEC's companyfacts API.

import { writeFile } from "node:fs/promises";

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
const gaap = facts.facts["us-gaap"];

// ---------- 2. Pick the right facts ----------
// Companies tag the same idea with different names over the years.
// We try each name and keep whichever one has the most recent annual figure.
const SALES_TAGS = ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet"];
const INVENTORY_TAGS = ["InventoryNet"];

const days = (a, b) => (new Date(b) - new Date(a)) / 86_400_000;

function annualRows(tag, { instant }) {
  const rows = gaap?.[tag]?.units?.USD ?? [];
  const good = rows.filter(r =>
    r.form === "10-K" && r.fp === "FY" &&
    (instant ? !r.start : days(r.start, r.end) >= 350 && days(r.start, r.end) <= 380)
  );
  // A 10-K repeats last year's figure as a comparative. Keep one row per
  // period end, from the newest filing (restated figures win).
  const byEnd = new Map();
  for (const r of good) {
    const prev = byEnd.get(r.end);
    if (!prev || r.filed > prev.filed) byEnd.set(r.end, r);
  }
  return [...byEnd.values()].sort((a, b) => b.end.localeCompare(a.end)); // newest first
}

function pick(tags, opts) {
  let best = null;
  for (const tag of tags) {
    const rows = annualRows(tag, opts);
    if (rows.length >= 2 && (!best || rows[0].end > best.rows[0].end)) best = { tag, rows };
  }
  if (!best) throw new Error(`No two annual 10-K values found for any of: ${tags.join(", ")}`);
  return best;
}

const sales = pick(SALES_TAGS, { instant: false });
const inventory = pick(INVENTORY_TAGS, { instant: true });

// Both items must describe the same two fiscal years, or the comparison is meaningless.
if (sales.rows[0].end !== inventory.rows[0].end || sales.rows[1].end !== inventory.rows[1].end) {
  throw new Error(`Period ends differ. Sales: ${sales.rows[0].end}, ${sales.rows[1].end}. Inventory: ${inventory.rows[0].end}, ${inventory.rows[1].end}.`);
}

// ---------- 3. Compute, showing inputs, formula and result separately ----------
const filingUrl = r => `https://www.sec.gov/Archives/edgar/data/${Number(CIK)}/${r.accn.replace(/-/g, "")}/`;
const fyLabel = r => `FY${r.end.slice(0, 4)}`;
const round1 = x => Math.round(x * 10) / 10;
const UNIT = 1000; // the 10-K prints USD thousands, so we show the formula the same way
const fmt = n => Math.round(n / UNIT).toLocaleString("en-US");

function describe(name, picked, statement) {
  const [thisYear, lastYear] = picked.rows;
  const growth = round1((thisYear.val - lastYear.val) / lastYear.val * 100);
  return {
    item: name,
    tag: picked.tag,
    statement,
    this_year: { fy: fyLabel(thisYear), end: thisYear.end, usd: thisYear.val, accn: thisYear.accn, filed: thisYear.filed, url: filingUrl(thisYear) },
    last_year: { fy: fyLabel(lastYear), end: lastYear.end, usd: lastYear.val, accn: lastYear.accn, filed: lastYear.filed, url: filingUrl(lastYear) },
    unit: "USD thousands",
    formula: `(${fmt(thisYear.val)} − ${fmt(lastYear.val)}) ÷ ${fmt(lastYear.val)} × 100 = ${growth}%`,
    growth_pct: growth,
  };
}

const S = describe("Sales", sales, "Income statement");
const I = describe("Inventory", inventory, "Balance sheet");

// ---------- 4. Label, straight from the rule table in the brief ----------
const ABOUT_SAME_PP = 5; // "about the same rate" means within this many percentage points
function label(s, i) {
  const gap = round1(i - s);
  if (s > 0 && i < 0) return { name: "Most favourable", reason: `Sales rose ${s}%, inventory fell ${Math.abs(i)}%.` };
  if (s > 0 && i > 0 && i < s) return { name: "Good", reason: `Both rose, but inventory (${i}%) grew slower than sales (${s}%).` };
  if (s > 0 && i > 0 && i >= s) return { name: "Warning", reason: `Inventory grew ${i}%, sales grew ${s}%. Stock is piling up ${gap} percentage points faster than it sells.` };
  if (s < 0 && i > 0) return { name: "Risk rising", reason: `Sales fell ${Math.abs(s)}% while inventory rose ${i}%.` };
  if (s < 0 && i < 0 && Math.abs(gap) <= ABOUT_SAME_PP) return { name: "Neutral / watch", reason: `Both fell at about the same rate: sales ${s}%, inventory ${i}%.` };
  return { name: "No label yet", reason: `Sales ${s}%, inventory ${i}%. This pattern is not in the rule table.` };
}

const out = {
  ticker: TICKER,
  company: facts.entityName,
  cik: CIK,
  fetched_at: new Date().toISOString(),
  source_api: url,
  signal: "Inventory",
  rows: [S, I],
  gap_pp: round1(I.growth_pct - S.growth_pct),
  label: label(S.growth_pct, I.growth_pct),
  status: "Draft",
};

await writeFile(`data/${TICKER}.json`, JSON.stringify(out, null, 2));

// ---------- 5. Print what to check ----------
console.log(`${out.company} — Inventory — ${S.this_year.fy} vs ${S.last_year.fy}\n`);
for (const r of out.rows) {
  console.log(`${r.item} (${r.tag})`);
  console.log(`  ${r.this_year.fy} (${r.this_year.end}): ${fmt(r.this_year.usd)}`);
  console.log(`  ${r.last_year.fy} (${r.last_year.end}): ${fmt(r.last_year.usd)}`);
  console.log(`  ${r.formula}\n`);
}
console.log(`Label: ${out.label.name}. ${out.label.reason}`);
console.log(`\nCheck against the 10-K filed ${S.this_year.filed}: ${S.this_year.url}`);
console.log(`Saved to data/${TICKER}.json`);
