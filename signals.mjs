// Turns the SEC's companyfacts JSON into eight signal cards, for any company that files a 10-K.
// No network and no files here, so this part can be tested on its own.
// No numbers are typed in. Missing does not mean zero: a missing input makes the card say "Not found".

// ---------- 1. Which SEC tags mean what ----------
// Companies tag the same idea with different names. We try each name in order.
// instant: true  = a balance-sheet figure on one date.
// instant: false = a figure for the whole year.
// hint: used only to suggest look-alike tags when nothing on the list is found.
const CONCEPTS = {
  sales:       { name: "Sales",               statement: "Income statement",    instant: false, hint: /Revenue/,
                 tags: ["RevenueFromContractWithCustomerExcludingAssessedTax", "RevenueFromContractWithCustomerIncludingAssessedTax", "Revenues", "SalesRevenueNet", "SalesRevenueGoodsNet"] },
  cost:        { name: "Cost of sales",       statement: "Income statement",    instant: false, hint: /^Costs?Of/,
                 tags: ["CostOfGoodsAndServicesSold", "CostOfRevenue", "CostOfGoodsSold"] },
  gross:       { name: "Gross profit",        statement: "Income statement",    instant: false, hint: /^GrossProfit/,
                 tags: ["GrossProfit"] },
  inventory:   { name: "Inventory",           statement: "Balance sheet",       instant: true,  hint: /^Inventor/,
                 tags: ["InventoryNet"] },
  receivables: { name: "Accounts receivable", statement: "Balance sheet",       instant: true,  hint: /Receivable.*Current$/,
                 tags: ["AccountsReceivableNetCurrent", "AccountsAndOtherReceivablesNetCurrent", "ReceivablesNetCurrent"] },
  sga:         { name: "SG&A",                statement: "Income statement",    instant: false, hint: /Selling|GeneralAndAdministrative/,
                 tags: ["SellingGeneralAndAdministrativeExpense"] },
  rnd:         { name: "R&D",                 statement: "Income statement or notes", instant: false, hint: /ResearchAndDevelopment/,
                 tags: ["ResearchAndDevelopmentExpense"] },
  capex:       { name: "Capital expenditure", statement: "Cash flow statement", instant: false, hint: /^PaymentsToAcquire(Property|Productive)/,
                 tags: ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"] },
  tax:         { name: "Income tax",          statement: "Income statement",    instant: false, hint: /^IncomeTaxExpense/,
                 tags: ["IncomeTaxExpenseBenefit"] },
  pretax:      { name: "Pre-tax profit",      statement: "Income statement",    instant: false, hint: /BeforeIncomeTaxes/,
                 tags: ["IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest", "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments"] },
};

// Banks, insurers and other financial companies. The SEC gives every company an industry code (SIC).
const isFinancial = sic => Number(sic) >= 6000 && Number(sic) <= 6799;

// ---------- 2. Small helpers ----------
const days = (a, b) => (new Date(b) - new Date(a)) / 86_400_000;
const round1 = x => Math.round(x * 10) / 10;
const one = x => x.toFixed(1);                       // always one decimal: 11.0, not 11
const pct = x => `${one(Math.abs(x))}%`;             // size only; the words say rose or fell
const signed = x => `${x > 0 ? "+" : x < 0 ? "−" : ""}${one(Math.abs(x))}`;
const signedPct = x => `${signed(x)}%`;
const fyLabel = end => `FY${end.slice(0, 4)}`;

function annualRows(gaap, tag, instant) {
  const rows = gaap?.[tag]?.units?.USD ?? [];
  const good = rows.filter(r =>
    r.form === "10-K" && r.fp === "FY" &&
    (instant ? !r.start : r.start && days(r.start, r.end) >= 350 && days(r.start, r.end) <= 380)
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

// ---------- 3. Labels ----------
// A label is a first screen, not a verdict. Flat (exactly 0.0%) counts as "up" for sales.
// The voice: short sentences, the numbers first, then one blunt line. Facts only, never advice.
const up = x => `up ${pct(x)}`, down = x => `down ${pct(x)}`;

// Inventory, Receivables, SG&A (and later Labour force): is the item growing faster or slower than sales?
const ABOUT_SAME_PP = 5;  // "about the same rate" means within this many percentage points
const BIG_GAP_PP = 10;    // a Warning gets the stronger line when the item outruns sales by more than this
function paceLabel(s, i, w) {
  const gap = round1(i - s); // positive = item grew faster than sales
  if (s >= 0) {
    if (i <= 0) return { name: "Most favourable", reason: `Sales ${up(s)}. ${w.Noun} ${i < 0 ? down(i) : "flat"}. ${w.best}` };
    if (i < s) return { name: "Good", reason: `Sales ${up(s)}. ${w.Noun} ${up(i)}. ${w.good}` };
    return { name: "Warning", reason: `Sales grew ${pct(s)}. ${w.Noun} grew ${pct(i)}. ${gap > BIG_GAP_PP ? w.warnBig : w.warn}` };
  }
  if (i >= 0) return { name: "Risk rising", reason: `Sales ${down(s)}. ${w.Noun} ${i > 0 ? up(i) : "flat"}. ${w.risk}` };
  if (Math.abs(gap) <= ABOUT_SAME_PP) return { name: "Neutral / watch", reason: `Sales ${down(s)}. ${w.Noun} ${down(i)}. Shrinking in step. Nothing to see. Yet.` };
  if (gap < 0) return { name: "Good", reason: `Sales ${down(s)}. ${w.Noun} ${down(i)}. ${w.cutFast}` };
  return { name: "Warning", reason: `Sales ${down(s)}. ${w.Noun} down only ${pct(i)}. ${w.cutSlow}` };
}
const WORDS = {
  inventory: { Noun: "Inventory",
    best: "Selling more with less on the shelf. Beautiful.",
    good: "They're selling it faster than they're stacking it. That's how it should work.",
    warn: "The shelves are filling a little faster than they empty.",
    warnBig: "That's not a rounding error. That's a pile.",
    risk: "Less going out, more piling in. Wrong direction.",
    cutFast: "They cut stock faster than sales fell. Somebody's paying attention.",
    cutSlow: "The business is shrinking faster than the stockroom." },
  receivables: { Noun: "Receivables",
    best: "More sales, fewer unpaid bills. Customers are paying up.",
    good: "Sales are outrunning the unpaid bills. That's how it should work.",
    warn: "The IOUs are growing a bit faster than the sales.",
    warnBig: "The IOUs are growing much faster than the sales. Who hasn't paid?",
    risk: "Fewer sales, more unpaid bills. Wrong direction.",
    cutFast: "Unpaid bills fell faster than sales. Somebody's collecting.",
    cutSlow: "The business is shrinking faster than the unpaid bills." },
  sga: { Noun: "SG&A",
    best: "More sales, lower overheads. That almost never happens.",
    good: "Overheads are growing slower than the business. That's the whole trick.",
    warn: "Overheads are edging ahead of sales. Not a crisis. Not nothing.",
    warnBig: "Overheads are outrunning the business. That's backwards.",
    risk: "Smaller business, bigger overheads. Wrong direction.",
    cutFast: "They cut overheads faster than sales fell. Somebody's paying attention.",
    cutSlow: "The business is shrinking faster than its overheads." },
};

// R&D and Capital expenditure: spending more is not bad in itself.
// The warning is for cutting investment while sales grow.
const BIG_BET_TIMES = 2; // "a big bet" means growing more than this many times the sales rate
function investLabel(s, i, Noun) {
  if (s >= 0) {
    if (i < 0) return { name: "Warning", reason: `Sales ${up(s)}. ${Noun} ${down(i)}. Growing today, spending less on tomorrow. Ask why.` };
    if (i > BIG_BET_TIMES * s) return { name: "Neutral / watch", reason: `Sales ${up(s)}. ${Noun} ${up(i)}. That's a big bet. On what?` };
    return { name: "Good", reason: `Sales ${up(s)}. ${Noun} ${i > 0 ? up(i) : "flat"}. The business grows. The investment keeps going. Good.` };
  }
  if (i > 0) return { name: "Neutral / watch", reason: `Sales ${down(s)}. ${Noun} ${up(i)}. Spending into a dip. Brave or stubborn. Find out which.` };
  if (i < 0) return { name: "Neutral / watch", reason: `Sales ${down(s)}. ${Noun} ${down(i)}. Planned diet or forced cut? The filing will say.` };
  return { name: "Neutral / watch", reason: `Sales ${down(s)}. ${Noun} flat. Holding the line while sales fall. Worth a look.` };
}

// Gross profit: did the margin widen or narrow? Measured in percentage points.
const MARGIN_STEADY_PP = 0.5;
function marginLabel(s, change, thisM, lastM) {
  const moved = `${one(lastM)}% to ${one(thisM)}% (${signed(change)} points)`;
  if (Math.abs(change) <= MARGIN_STEADY_PP) return { name: "Neutral / watch", reason: `Gross margin: ${one(lastM)}% last year, ${one(thisM)}% now. Steady. Boring. Boring is fine.` };
  if (change > 0) return s >= 0
    ? { name: "Most favourable", reason: `Gross margin went from ${moved}. Sales ${up(s)} too. Selling more and keeping more of each sale. That's the dream.` }
    : { name: "Good", reason: `Gross margin went from ${moved}, with sales ${down(s)}. Smaller, but richer per sale.` };
  return s < 0
    ? { name: "Risk rising", reason: `Gross margin slipped from ${moved}. Sales ${down(s)}. Fewer sales, thinner sales. Wrong direction, twice.` }
    : { name: "Warning", reason: `Gross margin slipped from ${moved} while sales grew ${pct(s)}. Selling more. Keeping less of each sale.` };
}

// Effective tax rate: steady is good. A big drop flatters profit and may not repeat.
const TAX_STEADY_PP = 2;
function taxLabel(change, thisR, lastR) {
  const moved = `${one(lastR)}% to ${one(thisR)}% (${signed(change)} points)`;
  if (Math.abs(change) <= TAX_STEADY_PP) return { name: "Good", reason: `Tax rate: ${one(lastR)}% last year, ${one(thisR)}% now. Steady. Nothing to see here.` };
  if (change < 0) return { name: "Neutral / watch", reason: `Tax rate fell from ${moved}. Profit got a lift from a smaller tax bill. That kind of lift doesn't always repeat.` };
  return { name: "Warning", reason: `Tax rate jumped from ${moved}. Either this year is high or last year was low. Find out which.` };
}

// ---------- 4. Build the cards ----------
// info: { sic, sicDescription } from the SEC's company record. Optional.
export function buildCards(facts, cik, info = {}) {
  const gaap = facts.facts?.["us-gaap"];
  const filingUrl = r => `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${r.accn.replace(/-/g, "")}/`;

  // Sales sets the two fiscal years. Use the sales tag with the most recent annual figure.
  // If two tags cover the same year, the larger one is total revenue (the other is a part of it).
  let anchor = null, anchorTag = null;
  for (const tag of CONCEPTS.sales.tags) {
    const rows = annualRows(gaap, tag, false);
    if (rows.length < 2) continue;
    if (!anchor || rows[0].end > anchor[0].end || (rows[0].end === anchor[0].end && rows[0].val > anchor[0].val)) { anchor = rows; anchorTag = tag; }
  }
  if (!anchor) throw new Error("No two years of annual sales found in this company's 10-K data. It may file a different form (foreign companies do), or be too new.");
  const [thisEnd, lastEnd] = [anchor[0].end, anchor[1].end];
  const gapDays = days(lastEnd, thisEnd);
  if (gapDays < 350 || gapDays > 380) throw new Error(`The two latest sales years are not one year apart: ${thisEnd} and ${lastEnd}.`);

  // Every other item must have a value for those same two year-ends, from one tag.
  const side = r => ({ fy: fyLabel(r.end), end: r.end, usd: r.val, accn: r.accn, filed: r.filed, url: filingUrl(r) });
  function find(key) {
    const c = CONCEPTS[key];
    for (const tag of key === "sales" ? [anchorTag] : c.tags) {
      const rows = annualRows(gaap, tag, c.instant);
      const a = rows.find(r => r.end === thisEnd), b = rows.find(r => r.end === lastEnd);
      if (a && b) return { key, item: c.name, tag, statement: c.statement, this_year: side(a), last_year: side(b) };
    }
    return null;
  }
  const F = Object.fromEntries(Object.keys(CONCEPTS).map(k => [k, find(k)]));
  const found = Object.values(F).filter(Boolean);

  // Show numbers the way the 10-K prints them: millions if every figure is a whole million, else thousands.
  const inMillions = found.every(f => f.this_year.usd % 1e6 === 0 && f.last_year.usd % 1e6 === 0);
  const UNIT = inMillions ? 1e6 : 1e3;
  const unit = inMillions ? "USD millions" : "USD thousands";
  const fmt = usd => Math.round(usd / UNIT).toLocaleString("en-US");

  // One table row: item, this year, last year, formula and result, source.
  const inputRow = (f, formula = []) => ({
    item: f.item, tag: f.tag, statement: f.statement, url: f.this_year.url,
    this_year: fmt(f.this_year.usd), last_year: fmt(f.last_year.usd), formula,
  });
  const growthRow = f => {
    const [a, b] = [f.this_year.usd, f.last_year.usd];
    if (b === 0) return { ...inputRow(f, ["Last year was zero, so there is no growth rate."]), growth_pct: null };
    const g = round1((a - b) / Math.abs(b) * 100);
    return { ...inputRow(f, [`(${fmt(a)} − ${fmt(b)}) ÷ ${fmt(b)} × 100 = ${g < 0 ? "−" : ""}${one(Math.abs(g))}%`]), growth_pct: g };
  };
  const industry = info.sicDescription ? ` (SEC industry: ${info.sicDescription})` : "";
  const noCard = (signal, state, note) => ({ signal, state, rows: [], label: null, status: "Draft", note, big: "—", small: "" });
  // A missing item is "Doesn't apply" only where we know why; otherwise it is "Not found".
  const missingCard = (signal, missing, financialNote) => financialNote && isFinancial(info.sic)
    ? noCard(signal, "Doesn't apply", `${financialNote}${industry}.`)
    : noCard(signal, "Not found", `Not found in the SEC data for these two years: ${missing.join(", ")}. The company may not report it as its own line. Missing does not mean zero.`);
  // big and small: the one number shown on the tile, and the line under it.
  const card = (signal, rows, label, extra = {}) => ({ signal, state: "OK", rows, label, status: "Draft", big: "—", small: "", ...extra });

  const salesRow = growthRow(F.sales);
  const s = salesRow.growth_pct;

  // Item growth against sales growth.
  function versusSales(signal, key, labeller, financialNote) {
    if (!F[key]) return missingCard(signal, [CONCEPTS[key].name], financialNote);
    const row = growthRow(F[key]);
    if (s === null || row.growth_pct === null) return card(signal, [salesRow, row], null, { state: "No label", note: "A growth rate could not be worked out because last year's figure was zero." });
    return card(signal, [salesRow, row], labeller(s, row.growth_pct), { gap_pp: round1(row.growth_pct - s), big: signedPct(row.growth_pct), small: `vs sales ${signedPct(s)}` });
  }

  function grossProfit() {
    if (!F.cost && !F.gross) return missingCard("Gross profit", ["Cost of sales", "Gross profit"], "Banks and insurers have no cost of sales. No cost of sales, no gross profit");
    const [sa, sb] = [F.sales.this_year.usd, F.sales.last_year.usd];
    let ga, gb, rows;
    if (F.cost) { // gross profit = sales − cost of sales, so every step can be checked
      const [ca, cb] = [F.cost.this_year.usd, F.cost.last_year.usd];
      [ga, gb] = [sa - ca, sb - cb];
      rows = [salesRow, inputRow(F.cost), { item: "Gross profit", statement: "Worked out here", this_year: fmt(ga), last_year: fmt(gb),
        formula: [`${fmt(sa)} − ${fmt(ca)} = ${fmt(ga)}`, `${fmt(sb)} − ${fmt(cb)} = ${fmt(gb)}`] }];
    } else {      // no cost of sales line, but the filing gives gross profit itself
      [ga, gb] = [F.gross.this_year.usd, F.gross.last_year.usd];
      rows = [salesRow, inputRow(F.gross)];
    }
    const [ma, mb] = [round1(ga / sa * 100), round1(gb / sb * 100)];
    const change = round1(ma - mb);
    rows.push({ item: "Gross margin", statement: "Worked out here", this_year: `${one(ma)}%`, last_year: `${one(mb)}%`,
      formula: [`${fmt(ga)} ÷ ${fmt(sa)} × 100 = ${one(ma)}%`, `${fmt(gb)} ÷ ${fmt(sb)} × 100 = ${one(mb)}%`, `${one(ma)} − ${one(mb)} = ${signed(change)} percentage points`] });
    return card("Gross profit", rows, s === null ? null : marginLabel(s, change, ma, mb), { change_pp: change, big: `${one(ma)}%`, small: `${signed(change)} points on last year` });
  }

  function taxRate() {
    const missing = ["tax", "pretax"].filter(k => !F[k]).map(k => CONCEPTS[k].name);
    if (missing.length) return missingCard("Effective tax rate", missing);
    const [ta, tb, pa, pb] = [F.tax.this_year.usd, F.tax.last_year.usd, F.pretax.this_year.usd, F.pretax.last_year.usd];
    const rows = [inputRow(F.tax), inputRow(F.pretax)];
    if (pa <= 0 || pb <= 0) return card("Effective tax rate", rows, null, { state: "Doesn't apply", note: "Pre-tax profit was zero or a loss in one of the two years, so a tax rate would mislead." });
    const [ra, rb] = [round1(ta / pa * 100), round1(tb / pb * 100)];
    const change = round1(ra - rb);
    rows.push({ item: "Effective tax rate", statement: "Worked out here", this_year: `${one(ra)}%`, last_year: `${one(rb)}%`,
      formula: [`${fmt(ta)} ÷ ${fmt(pa)} × 100 = ${one(ra)}%`, `${fmt(tb)} ÷ ${fmt(pb)} × 100 = ${one(rb)}%`, `${one(ra)} − ${one(rb)} = ${signed(change)} percentage points`] });
    return card("Effective tax rate", rows, taxLabel(change, ra, rb), { change_pp: change, big: `${one(ra)}%`, small: `${signed(change)} points on last year` });
  }

  const cards = [
    versusSales("Inventory", "inventory", (a, b) => paceLabel(a, b, WORDS.inventory), "Banks and insurers don't hold stock to sell. Nothing to read here"),
    versusSales("Accounts receivable", "receivables", (a, b) => paceLabel(a, b, WORDS.receivables), "Banks and insurers lend money rather than bill customers. Trade receivables are the wrong yardstick"),
    versusSales("Capital expenditure", "capex", (a, b) => investLabel(a, b, "Capital spending")),
    versusSales("Research and development", "rnd", (a, b) => investLabel(a, b, "R&D")),
    grossProfit(),
    versusSales("SG&A", "sga", (a, b) => paceLabel(a, b, WORDS.sga)),
    taxRate(),
    noCard("Labour force", "Not found", "The SEC's number feed does not carry headcount; it sits in the 10-K text (Item 1, Human Capital). It will be read from there in a later step."),
  ];

  // For anything missing, list look-alike tags the company did use this year. Helps fix the tag lists above.
  const lookalikes = {};
  for (const [k, c] of Object.entries(CONCEPTS)) {
    if (F[k] || (k === "gross" && F.cost)) continue;
    const hits = Object.keys(gaap ?? {}).filter(t => c.hint.test(t))
      .map(t => ({ tag: t, row: annualRows(gaap, t, c.instant).find(r => r.end === thisEnd) }))
      .filter(h => h.row).map(h => `${h.tag} = ${fmt(h.row.val)}`).slice(0, 8);
    if (hits.length) lookalikes[c.name] = hits;
  }

  return {
    company: facts.entityName,
    industry: info.sicDescription ?? null,
    fiscal: { this_year: { fy: fyLabel(thisEnd), end: thisEnd }, last_year: { fy: fyLabel(lastEnd), end: lastEnd } },
    filing: { accn: F.sales.this_year.accn, filed: F.sales.this_year.filed, url: F.sales.this_year.url },
    unit,
    // The raw inputs, each once, for checking against the filing.
    inputs: found.filter(f => !(f.key === "gross" && F.cost)).map(f => ({ item: f.item, tag: f.tag, statement: f.statement, this_year: f.this_year, last_year: f.last_year, shown: [fmt(f.this_year.usd), fmt(f.last_year.usd)] })),
    missing: Object.keys(F).filter(k => !F[k] && k !== "gross" && !(k === "cost" && F.gross)).map(k => CONCEPTS[k].name).concat("Headcount"),
    lookalikes,
    cards,
  };
}
