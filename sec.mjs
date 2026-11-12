// Everything that talks to the SEC, and the saved copies in data/.
// The SEC is free and needs no key, but every request must say who is asking (SEC_USER_AGENT in .env).

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { buildCards } from "./signals.mjs";

// Bump when the saved shape changes, so old saved files are refetched. Bump PAGE_VERSION in
// public/index.html to the same number: an open page that is older than the data reloads itself.
export const VERSION = 11;
const TICKER_LIST = "https://www.sec.gov/files/company_tickers.json";
const HOURS = 3_600_000;
// Where saved copies go. On your computer: the data/ folder. On Vercel the project folder is
// read-only, so they go in /tmp, which is wiped now and then. They are only a speed-up, so that is fine.
const DIR = process.env.VERCEL ? "/tmp/signal-cards" : "data";

// An error whose message is safe and useful to show to the person using the app.
export class Friendly extends Error { constructor(msg, status = 400) { super(msg); this.status = status; } }

// "brk.b" -> "BRK-B". The SEC writes share classes with a dash.
export function cleanTicker(raw) {
  const t = String(raw ?? "").trim().toUpperCase().replace(/\./g, "-");
  if (!/^[A-Z0-9-]{1,10}$/.test(t)) throw new Friendly("Type a company name or a ticker, like Apple or AAPL.");
  return t;
}

// The SEC writes many names in capitals: "COSTCO WHOLESALE CORP /NEW". Make them calm: "Costco Wholesale Corp".
// This is a best guess. Names it gets wrong are fixed by hand in BY_HAND.
const BY_HAND = { JPM: "JPMorgan Chase & Co", NVDA: "NVIDIA Corp", WDFC: "WD-40 Company" };
const SMALL = new Set(["AND", "OF", "THE", "FOR", "IN", "DE"]);
const ORDINARY = new Set(["INC", "CO", "LTD", "NEW", "PLC", "CORP", "GAP", "BOX", "AIR", "OIL", "GAS", "ONE", "TWO", "BIG", "LAS", "SAN", "LOS"]);
export function tidyName(name, ticker) {
  if (BY_HAND[ticker]) return BY_HAND[ticker];
  const base = String(name).replace(/\s*\/[A-Z]{2,4}\/?\s*$/, "").trim(); // drop endings like " /NEW" or "/DE/"
  return base.split(" ").map((w, n) => {
    const bare = w.replace(/[.,]/g, "");
    if (/[a-z0-9&]/.test(w)) return w;                                    // already normal (Apple), or 3M, AT&T
    if (SMALL.has(bare) && n > 0) return w.toLowerCase();
    if (bare.length <= 3 && !ORDINARY.has(bare) && !SMALL.has(bare)) return w; // IBM, HP, UPS stay in capitals
    return w.split("-").map(p => p.charAt(0) + p.slice(1).toLowerCase()).join("-");
  }).join(" ");
}

async function getJson(url, UA) {
  if (!UA) throw new Friendly(process.env.VERCEL
    ? "Missing SEC_USER_AGENT. Add it under Environment Variables in the Vercel project settings, then redeploy."
    : "Missing SEC_USER_AGENT. Copy .env.example to .env and fill it in.", 500);
  let res;
  try { res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Encoding": "gzip, deflate" }, signal: AbortSignal.timeout(12_000) }); }
  catch { throw new Friendly("Could not reach the SEC. Check your internet connection and try again.", 502); }
  if (res.status === 404) return null;
  if (!res.ok) throw new Friendly(`The SEC answered ${res.status}. Wait a minute and try again.`, 502);
  return res.json();
}

async function readSaved(file, maxAgeHours) {
  try {
    const saved = JSON.parse(await readFile(file, "utf8"));
    if (saved.version === VERSION && Date.now() - new Date(saved.fetched_at) < maxAgeHours * HOURS) return saved;
  } catch {}
  return null;
}
async function save(file, obj) {
  try {
    await mkdir(DIR, { recursive: true });
    await writeFile(file, JSON.stringify(obj, null, 2));
  } catch {} // a saved copy is a speed-up, never a requirement
}

// The SEC's list of every US-listed company: ticker, company id (CIK) and name.
// It comes roughly biggest company first. Saved for a week, and kept in memory while the server runs.
let memo = null;
async function companies(UA) {
  if (memo && Date.now() - new Date(memo.fetched_at) < 24 * 7 * HOURS) return memo.list;
  const file = `${DIR}/_tickers.json`;
  let saved = await readSaved(file, 24 * 7);
  if (!saved) {
    const raw = await getJson(TICKER_LIST, UA);
    if (!raw) throw new Friendly("The SEC's ticker list was not found.", 502);
    const list = Object.values(raw).map(c => { const ticker = String(c.ticker).toUpperCase(); return { ticker, cik: c.cik_str, name: tidyName(c.title, ticker) }; });
    saved = { version: VERSION, fetched_at: new Date().toISOString(), list };
    await save(file, saved);
  }
  // Worked out once per run, not saved: each name with punctuation removed, for matching.
  for (const c of saved.list) { c.sq = squash(c.name); c.sp = " " + spaced(c.name); }
  memo = saved;
  return saved.list;
}

// People search by the name they know, which is often a brand, not the company's legal name.
// Each entry: what people type, and the ticker it belongs to. Add more here as they turn up.
const ALSO_KNOWN_AS = [
  ["Google", "GOOGL"], ["YouTube", "GOOGL"], ["Android", "GOOGL"], ["Gmail", "GOOGL"], ["Waymo", "GOOGL"],
  ["Facebook", "META"], ["Instagram", "META"], ["WhatsApp", "META"],
  ["AWS", "AMZN"], ["Whole Foods", "AMZN"],
  ["Windows", "MSFT"], ["Xbox", "MSFT"], ["LinkedIn", "MSFT"], ["GitHub", "MSFT"],
  ["iPhone", "AAPL"], ["Coke", "KO"], ["Amex", "AXP"], ["BofA", "BAC"], ["J&J", "JNJ"],
  ["KFC", "YUM"], ["Taco Bell", "YUM"], ["Pizza Hut", "YUM"], ["Snapchat", "SNAP"], ["Marvel", "DIS"], ["Pixar", "DIS"], ["ESPN", "DIS"],
  ["Gillette", "PG"], ["Tide", "PG"], ["Frito-Lay", "PEP"], ["Gatorade", "PEP"], ["Oreo", "MDLZ"], ["Cadbury", "MDLZ"],
  ["Jordan", "NKE"], ["Converse", "NKE"], ["Sam's Club", "WMT"], ["Chase", "JPM"], ["Venmo", "PYPL"],
];
// "Coca-Cola" and "coca cola" and "cocacola" should all match, so compare with punctuation and spaces removed.
const squash = s => String(s).toUpperCase().replace(/[^A-Z0-9]/g, "");
const spaced = s => String(s).toUpperCase().replace(/[^A-Z0-9 ]/g, "").replace(/\s+/g, " ").trim();

// Find companies by ticker, by name, or by a well-known brand. Best matches first: the exact ticker,
// a brand, names that start with what you typed, tickers that start with it, then names that
// contain it as the start of a word.
export async function search(rawQuery, UA, limit = 8) {
  const q = String(rawQuery ?? "").trim().slice(0, 40);
  const sq = squash(q), sp = spaced(q), qt = q.toUpperCase().replace(/\./g, "-");
  if (!sq) return [];
  const brands = new Map(); // ticker -> the brand that matched
  if (sq.length >= 3) for (const [brand, ticker] of ALSO_KNOWN_AS) if (squash(brand).startsWith(sq) && !brands.has(ticker)) brands.set(ticker, brand);
  const rank = c => {
    if (c.ticker === qt) return 0;
    if (brands.has(c.ticker)) return 0.5;
    if (c.sq.startsWith(sq)) return sq.length < 3 && !c.ticker.startsWith(qt) ? 3 : 1;
    if (c.ticker.startsWith(qt)) return 2;
    if (sq.length >= 3 && c.sp.includes(" " + sp)) return 3;
    return 9;
  };
  const seen = new Set(); // one row per company, even if it has several share classes
  return (await companies(UA)).map((c, order) => ({ c, r: rank(c), order })).filter(x => x.r < 9)
    .sort((a, b) => a.r - b.r || a.order - b.order)
    .filter(x => (x.r === 0 || !seen.has(x.c.cik)) && seen.add(x.c.cik))
    .slice(0, limit).map(x => ({ ticker: x.c.ticker, name: x.c.name, ...(brands.has(x.c.ticker) && { aka: brands.get(x.c.ticker) }) }));
}

// Big companies whose annual report landed most recently: fresh numbers worth reading.
// The SEC's company list comes roughly biggest first, so we take the first hundred or so, look up
// each one's latest 10-K date, and return the newest few. Worked out at most twice a day.
const BIG = 100;          // how many of the biggest companies to look at
const AT_ONCE = 6;        // lookups in flight at a time; the SEC asks for no more than 10 a second
export async function fresh(UA, limit = 12) {
  const file = `${DIR}/_fresh.json`;
  const saved = await readSaved(file, 12);
  if (saved) return saved.list.slice(0, limit);
  const seen = new Set();
  const big = (await companies(UA)).filter(c => !seen.has(c.cik) && seen.add(c.cik)).slice(0, BIG);
  const found = [];
  let next = 0;
  await Promise.all(Array.from({ length: AT_ONCE }, async () => {
    while (next < big.length) {
      const c = big[next++];
      try {
        const sub = await getJson(`https://data.sec.gov/submissions/CIK${String(c.cik).padStart(10, "0")}.json`, UA);
        const r = sub?.filings?.recent;
        const i = Array.isArray(r?.form) ? r.form.indexOf("10-K") : -1; // filings come newest first
        if (i >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(r.filingDate?.[i] ?? "")) found.push({ ticker: c.ticker, name: c.name, filed: r.filingDate[i] });
      } catch {} // one company failing should not sink the list
    }
  }));
  if (!found.length) throw new Friendly("Could not work out which annual reports are newest. Try again later.", 502);
  const list = found.sort((a, b) => b.filed.localeCompare(a.filed)).slice(0, 12);
  await save(file, { version: VERSION, fetched_at: new Date().toISOString(), list });
  return list.slice(0, limit);
}

// The eight cards for one ticker. Uses the saved copy if it is under a day old, unless fresh is true.
export async function cardsFor(rawTicker, UA, { fresh = false } = {}) {
  const ticker = cleanTicker(rawTicker);
  const file = `${DIR}/${ticker}.json`;
  if (!fresh) {
    const saved = await readSaved(file, 24);
    if (saved) return saved;
  }
  const hit = (await companies(UA)).find(c => c.ticker === ticker);
  if (!hit) throw new Friendly(`No company with the ticker ${ticker} in the SEC's list. Check the spelling. Only US-listed companies are covered so far.`, 404);
  const cik = String(hit.cik).padStart(10, "0");
  const source_api = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
  const facts = await getJson(source_api, UA);
  const sub = await getJson(`https://data.sec.gov/submissions/CIK${cik}.json`, UA); // industry code, forms and document names; fine if missing
  // Companies based outside the US file a 20-F or 40-F, not a 10-K, and follow different accounting rules.
  const forms = Array.isArray(sub?.filings?.recent?.form) ? sub.filings.recent.form : [];
  const abroad = !forms.includes("10-K") && forms.find(f => f === "20-F" || f === "40-F");
  const elsewhere = `${hit.name} is based outside the US and reports under different rules (it files a ${abroad}, not a 10-K). Companies like this are on the way, along with Singapore and India.`;
  if (!facts) throw new Friendly(abroad ? elsewhere : `The SEC has no financial data for ${hit.name} (${ticker}).`, 404);
  // For each recent filing, the name of its main document, so cards can link straight into the 10-K.
  const recent = sub?.filings?.recent, docs = {};
  if (Array.isArray(recent?.accessionNumber) && Array.isArray(recent?.primaryDocument)) {
    recent.accessionNumber.forEach((accn, i) => { const doc = recent.primaryDocument[i]; if (/^[\w.-]+\.html?$/i.test(doc ?? "")) docs[accn] = doc; });
  }
  let built;
  try { built = buildCards(facts, cik, { sic: sub?.sic, sicDescription: sub?.sicDescription, docs }); }
  catch (e) { throw new Friendly(abroad ? elsewhere : `${hit.name} (${ticker}): ${e.message}`, 422); }
  const out = { version: VERSION, ticker, cik, fetched_at: new Date().toISOString(), source_api, ...built, company: hit.name, company_sec: facts.entityName };
  await save(file, out);
  return out;
}
