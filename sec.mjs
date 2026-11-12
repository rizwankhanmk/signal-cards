// Everything that talks to the SEC, and the saved copies in data/.
// The SEC is free and needs no key, but every request must say who is asking (SEC_USER_AGENT in .env).

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { buildCards } from "./signals.mjs";

const VERSION = 5;                       // bump when the saved shape changes, so old saved files are refetched
const TICKER_LIST = "https://www.sec.gov/files/company_tickers.json";
const HOURS = 3_600_000;

// An error whose message is safe and useful to show to the person using the app.
export class Friendly extends Error { constructor(msg, status = 400) { super(msg); this.status = status; } }

// "brk.b" -> "BRK-B". The SEC writes share classes with a dash.
export function cleanTicker(raw) {
  const t = String(raw ?? "").trim().toUpperCase().replace(/\./g, "-");
  if (!/^[A-Z0-9-]{1,10}$/.test(t)) throw new Friendly("Type a ticker, like WDFC or AAPL: letters and numbers only.");
  return t;
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
    if (Date.now() - new Date(saved.fetched_at) < maxAgeHours * HOURS) return saved;
  } catch {}
  return null;
}
async function save(file, obj) {
  await mkdir("data", { recursive: true });
  await writeFile(file, JSON.stringify(obj, null, 2));
}

// Ticker -> the SEC's company id (CIK). The SEC's list is saved for a week.
async function lookup(ticker, UA) {
  const file = "data/_tickers.json";
  let list = await readSaved(file, 24 * 7);
  if (!list) {
    const raw = await getJson(TICKER_LIST, UA);
    if (!raw) throw new Friendly("The SEC's ticker list was not found.", 502);
    list = { fetched_at: new Date().toISOString(), tickers: Object.fromEntries(Object.values(raw).map(c => [c.ticker.toUpperCase(), { cik: c.cik_str, title: c.title }])) };
    await save(file, list);
  }
  const hit = list.tickers[ticker];
  if (!hit) throw new Friendly(`No company with the ticker ${ticker} in the SEC's list. Check the spelling. Only US-listed companies are covered so far.`, 404);
  return { cik: String(hit.cik).padStart(10, "0"), title: hit.title };
}

// The eight cards for one ticker. Uses the saved copy if it is under a day old, unless fresh is true.
export async function cardsFor(rawTicker, UA, { fresh = false } = {}) {
  const ticker = cleanTicker(rawTicker);
  const file = `data/${ticker}.json`;
  if (!fresh) {
    const saved = await readSaved(file, 24);
    if (saved?.version === VERSION) return saved;
  }
  const { cik, title } = await lookup(ticker, UA);
  const source_api = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
  const facts = await getJson(source_api, UA);
  if (!facts) throw new Friendly(`The SEC has no financial data for ${title} (${ticker}).`, 404);
  const sub = await getJson(`https://data.sec.gov/submissions/CIK${cik}.json`, UA); // industry code; fine if missing
  let built;
  try { built = buildCards(facts, cik, { sic: sub?.sic, sicDescription: sub?.sicDescription }); }
  catch (e) { throw new Friendly(`${title} (${ticker}): ${e.message}`, 422); }
  const out = { version: VERSION, ticker, cik, fetched_at: new Date().toISOString(), source_api, ...built };
  await save(file, out);
  return out;
}
