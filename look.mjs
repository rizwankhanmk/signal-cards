// A look under the bonnet, for when a company cannot be read.
//   npm run look XOM
// It prints what the SEC holds for that ticker: which company record it points at, any other records
// with a similar name, the recent annual filings, and every sales-like figure. Nothing is saved or changed.

const UA = process.env.SEC_USER_AGENT;
if (!UA) { console.log("Missing SEC_USER_AGENT in .env"); process.exit(1); }
const get = async url => { const r = await fetch(url, { headers: { "User-Agent": UA } }); return r.ok ? r.json() : (console.log(`   (${r.status} from ${url})`), null); };
const pad = n => String(n).padStart(10, "0");
const money = v => Math.round(v / 1e6).toLocaleString("en-US") + "m";
const days = (a, b) => Math.round((new Date(b) - new Date(a)) / 86_400_000);

const ticker = (process.argv[2] || "XOM").toUpperCase();
const list = Object.values(await get("https://www.sec.gov/files/company_tickers.json") ?? {});
const hit = list.find(c => c.ticker === ticker);
if (!hit) { console.log(`No ${ticker} in the SEC's list.`); process.exit(1); }

const word = hit.title.split(/[\s,.]+/)[0].replace(/mobil$/i, "").toLowerCase(); // "exxon" from "ExxonMobil"
const alike = list.filter(c => c.title.toLowerCase().includes(word));
console.log(`\n${ticker} points at record ${hit.cik_str}: ${hit.title}`);
console.log(`Records in the SEC's ticker list with "${word}" in the name:`);
for (const c of alike) console.log(`   ${c.cik_str}  ${c.ticker}  ${c.title}`);

async function look(cik) {
  console.log(`\n${"=".repeat(60)}\nRecord ${cik}`);
  const sub = await get(`https://data.sec.gov/submissions/CIK${pad(cik)}.json`);
  if (sub) {
    console.log(`Name: ${sub.name}   Tickers: ${(sub.tickers ?? []).join(", ") || "none"}   Industry: ${sub.sic} ${sub.sicDescription}`);
    console.log(`Former names: ${(sub.formerNames ?? []).map(f => `${f.name} (until ${String(f.to).slice(0, 10)})`).join("; ") || "none"}`);
    const r = sub.filings?.recent ?? {};
    const annual = (r.form ?? []).map((f, i) => ({ f, d: r.filingDate[i], p: r.reportDate[i], a: r.accessionNumber[i] })).filter(x => /^(10-K|20-F|40-F|8-K12B|15-12)/.test(x.f)).slice(0, 8);
    console.log(`Recent annual and succession filings: ${annual.map(x => `${x.f} filed ${x.d}${x.p ? ` for ${x.p}` : ""}`).join("; ") || "none"}`);
    console.log(`Number of filings listed: ${(r.form ?? []).length}. Oldest listed: ${(r.filingDate ?? []).at(-1) ?? "?"}`);
  }
  const facts = await get(`https://data.sec.gov/api/xbrl/companyfacts/CIK${pad(cik)}.json`);
  if (!facts) return console.log("No number feed (companyfacts) for this record.");
  console.log(`Number feed name: ${facts.entityName}. Taxonomies: ${Object.keys(facts.facts ?? {}).join(", ")}`);
  const gaap = facts.facts?.["us-gaap"] ?? {};
  const tags = Object.keys(gaap).filter(t => /^(Revenues?$|RevenueFromContract|SalesRevenue|RevenuesAndOther|.*TotalRevenues)/.test(t) || t === "NetIncomeLoss" || t === "Assets");
  for (const t of tags) {
    const rows = gaap[t].units?.USD ?? [];
    const forms = [...new Set(rows.map(r => `${r.form}/${r.fp}`))].join(", ");
    const year = rows.filter(r => !r.start || (days(r.start, r.end) >= 350 && days(r.start, r.end) <= 380));
    const byEnd = new Map(); for (const r of year) { const p = byEnd.get(r.end); if (!p || r.filed > p.filed) byEnd.set(r.end, r); }
    const last = [...byEnd.values()].sort((a, b) => b.end.localeCompare(a.end)).slice(0, 4);
    console.log(`\n   ${t}: ${rows.length} figures. Forms: ${forms}`);
    for (const r of last) console.log(`      year to ${r.end}: ${money(r.val)}   from ${r.form} (${r.fp}) filed ${r.filed}`);
  }
}

for (const cik of [...new Set([hit.cik_str, ...alike.map(c => c.cik_str)])].slice(0, 4)) await look(cik);
console.log("\nPaste all of this back.");
