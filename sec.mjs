// Everything that talks to the SEC, and the saved copies in data/.
// The SEC is free and needs no key, but every request must say who is asking (SEC_USER_AGENT in .env).

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { buildCards } from "./signals.mjs";

const VERSION = 7;                       // bump when the saved shape changes, so old saved files are refetched
const TICKER_LIST = "https://www.sec.gov/files/company_tickers.json";
const HOURS = 3_600_000;

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
  if (!UA) throw new Friendly("Missing SEC_USER_AGENT. Copy .env.example to .env and fill it in.", 500);
  let res;
  try { res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Encoding": "gzip, deflate" } }); }
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
  await mkdir("data", { recursive: true });
  await writeFile(file, JSON.stringify(obj, null, 2));
}

// The SEC's list of every US-listed company: ticker, company id (CIK) and name.
// It comes roughly biggest company first. Saved for a week, and kept in memory while the server runs.
let memo = null;
async function companies(UA) {
  if (memo && Date.now() - new Date(memo.fetched_at) < 24 * 7 * HOURS) return memo.list;
  const file = "data/_tickers.json";
  let saved = await readSaved(file, 24 * 7);
  if (!saved) {
    const raw = await getJson(TICKER_LIST, UA);
    if (!raw) throw new Friendly("The SEC's ticker list was not found.", 502);
    const list = Object.values(raw).map(c => { const ticker = String(c.ticker).toUpperCase(); return { ticker, cik: c.cik_str, name: tidyName(c.title, ticker) }; });
    saved = { version: VERSION, fetched_at: new Date().toISOString(), list };
    await save(file, saved);
  }
  memo = saved;
  return saved.list;
}

// Find companies by ticker or by name. Best matches first: the exact ticker, tickers that start
// with what you typed, names that start with it, then names that contain it as the start of a word.
export async function search(rawQuery, UA, limit = 8) {
  const q = String(rawQuery ?? "").trim().toUpperCase().slice(0, 40);
  if (!q) return [];
  const qt = q.replace(/\./g, "-");
  const rank = c => {
    const name = c.name.toUpperCase();
    if (c.ticker === qt) return 0;
    if (name.startsWith(q)) return q.length < 3 && !c.ticker.startsWith(qt) ? 3 : 1;
    if (c.ticker.startsWith(qt)) return 2;
    if (q.length >= 3 && name.includes(" " + q)) return 3;
    return 9;
  };
  const seen = new Set(); // one row per company, even if it has several share classes
  return (await companies(UA)).map((c, order) => ({ c, r: rank(c), order })).filter(x => x.r < 9)
    .sort((a, b) => a.r - b.r || a.order - b.order)
    .filter(x => (x.r === 0 || !seen.has(x.c.cik)) && seen.add(x.c.cik))
    .slice(0, limit).map(x => ({ ticker: x.c.ticker, name: x.c.name }));
}

// The eight cards for one ticker. Uses the saved copy if it is under a day old, unless fresh is true.
export async function cardsFor(rawTicker, UA, { fresh = false } = {}) {
  const ticker = cleanTicker(rawTicker);
  const file = `data/${ticker}.json`;
  if (!fresh) {
    const saved = await readSaved(file, 24);
    if (saved) return saved;
  }
  const hit = (await companies(UA)).find(c => c.ticker === ticker);
  if (!hit) throw new Friendly(`No company with the ticker ${ticker} in the SEC's list. Check the spelling. Only US-listed companies are covered so far.`, 404);
  const cik = String(hit.cik).padStart(10, "0");
  const source_api = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
  const facts = await getJson(source_api, UA);
  if (!facts) throw new Friendly(`The SEC has no financial data for ${hit.name} (${ticker}).`, 404);
  const sub = await getJson(`https://data.sec.gov/submissions/CIK${cik}.json`, UA); // industry code; fine if missing
  let built;
  try { built = buildCards(facts, cik, { sic: sub?.sic, sicDescription: sub?.sicDescription }); }
  catch (e) { throw new Friendly(`${hit.name} (${ticker}): ${e.message}`, 422); }
  const out = { version: VERSION, ticker, cik, fetched_at: new Date().toISOString(), source_api, ...built, company: hit.name, company_sec: facts.entityName };
  await save(file, out);
  return out;
}
