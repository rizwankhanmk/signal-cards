// Turns the SEC's companyfacts JSON into eight signal cards, for any company that files a 10-K.
// No network and no files here, so this part can be tested on its own.
// No numbers are typed in. Missing does not mean zero: a missing input makes the card say "Not found".

// ---------- 1. Which SEC tags mean what ----------
// Companies tag the same idea with different names. We try each name in order.
// instant: true  = a balance-sheet figure on one date.
// instant: false = a figure for the whole year.
// hint: used only to suggest look-alike tags when nothing on the list is found.
const CONCEPTS = {
  sales:       { name: "Sales", plain: "Sales",               statement: "Income statement",    instant: false, hint: /Revenue/,
                 tags: ["RevenueFromContractWithCustomerExcludingAssessedTax", "RevenueFromContractWithCustomerIncludingAssessedTax", "Revenues", "SalesRevenueNet", "SalesRevenueGoodsNet"] },
  cost:        { name: "Cost of sales", plain: "Cost of what was sold",       statement: "Income statement",    instant: false, hint: /^Costs?Of/,
                 tags: ["CostOfGoodsAndServicesSold", "CostOfRevenue", "CostOfGoodsSold"] },
  gross:       { name: "Gross profit", plain: "Profit after direct costs",        statement: "Income statement",    instant: false, hint: /^GrossProfit/,
                 tags: ["GrossProfit"] },
  inventory:   { name: "Inventory", plain: "Unsold stock",           statement: "Balance sheet",       instant: true,  hint: /^Inventor/,
                 // Nike files its whole inventory as finished goods, so that tag is the fallback.
                 // totalFirst: if the company reports the total at all, never fall back to a part of it.
                 totalFirst: true, tags: ["InventoryNet", "InventoryFinishedGoodsNetOfReserves"] },
  receivables: { name: "Accounts receivable", plain: "Unpaid customer bills", statement: "Balance sheet",       instant: true,  hint: /Receivable.*Current$/,
                 tags: ["AccountsReceivableNetCurrent", "AccountsAndOtherReceivablesNetCurrent", "ReceivablesNetCurrent"] },
  sga:         { name: "SG&A", plain: "Overheads",                statement: "Income statement",    instant: false, hint: /Selling|GeneralAndAdministrative/,
                 tags: ["SellingGeneralAndAdministrativeExpense"] },
  rnd:         { name: "R&D", plain: "Research spending",                 statement: "Income statement or notes", instant: false, hint: /ResearchAndDevelopment/,
                 tags: ["ResearchAndDevelopmentExpense"] },
  capex:       { name: "Capital expenditure", plain: "Spending on buildings and equipment", statement: "Cash flow statement", instant: false, hint: /^PaymentsToAcquire(Property|Productive)/,
                 tags: ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"] },
  tax:         { name: "Income tax", plain: "Tax bill",          statement: "Income statement",    instant: false, hint: /^IncomeTaxExpense/,
                 tags: ["IncomeTaxExpenseBenefit"] },
  pretax:      { name: "Pre-tax profit", plain: "Profit before tax",      statement: "Income statement",    instant: false, hint: /BeforeIncomeTaxes/,
                 tags: ["IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest", "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments"] },
  // For the cash and debt cards, and the ratios an analyst would quote.
  ocf:         { name: "Cash from operations", plain: "Cash the business brought in", statement: "Cash flow statement", instant: false, hint: /^NetCashProvidedByUsedInOperating/,
                 tags: ["NetCashProvidedByUsedInOperatingActivities", "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"] },
  netincome:   { name: "Net income", plain: "Profit after everything", statement: "Income statement", instant: false, hint: /^(NetIncomeLoss|ProfitLoss)$/,
                 tags: ["NetIncomeLoss", "ProfitLoss"] },
  assets:      { name: "Total assets", plain: "Everything it owns", statement: "Balance sheet", instant: true, hint: /^Assets$/,
                 tags: ["Assets"] },
  equity:      { name: "Total equity", plain: "The owners' share", statement: "Balance sheet", instant: true, hint: /^StockholdersEquity/,
                 tags: ["StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest", "StockholdersEquity"] },
  depreciation:{ name: "Depreciation and amortisation", plain: "Wear and tear charged this year", statement: "Cash flow statement", instant: false, hint: /^Depreciation/,
                 tags: ["DepreciationDepletionAndAmortization", "DepreciationAndAmortization", "DepreciationAmortizationAndAccretionNet", "Depreciation"] },
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
// Every line is written twice: once with the accounting word, once with the plain-English word.
const up = x => `up ${pct(x)}`, down = x => `down ${pct(x)}`;
const both = (name, say, w) => ({ name, reason: say(w.Noun), plain: say(w.Plain) });

// Inventory, Receivables, SG&A (and later Labour force): is the item growing faster or slower than sales?
const ABOUT_SAME_PP = 5;  // "about the same rate" means within this many percentage points
const BIG_GAP_PP = 10;    // a Warning gets the stronger line when the item outruns sales by more than this
const KEEPING_PACE_PP = 2; // both rising within this many points of each other is "keeping pace", not Good or Warning
function paceLabel(s, i, w) {
  const gap = round1(i - s); // positive = item grew faster than sales
  if (s >= 0) {
    if (i <= 0) return both("Most favourable", N => `Sales ${up(s)}. ${N} ${i < 0 ? down(i) : "flat"}. ${w.best}`, w);
    if (Math.abs(gap) <= KEEPING_PACE_PP) return both("Neutral / watch", N => `Sales ${up(s)}. ${N} ${up(i)}. Keeping pace with sales. Nothing to see. Yet.`, w);
    if (i < s) return both("Good", N => `Sales ${up(s)}. ${N} ${up(i)}. ${w.good}`, w);
    return both("Warning", N => `Sales grew ${pct(s)}. ${N} grew ${pct(i)}. ${gap > BIG_GAP_PP ? w.warnBig : w.warn}`, w);
  }
  if (i >= 0) return both("Risk rising", N => `Sales ${down(s)}. ${N} ${i > 0 ? up(i) : "flat"}. ${w.risk}`, w);
  if (Math.abs(gap) <= ABOUT_SAME_PP) return both("Neutral / watch", N => `Sales ${down(s)}. ${N} ${down(i)}. Shrinking in step. Nothing to see. Yet.`, w);
  if (gap < 0) return both("Good", N => `Sales ${down(s)}. ${N} ${down(i)}. ${w.cutFast}`, w);
  return both("Warning", N => `Sales ${down(s)}. ${N} down only ${pct(i)}. ${w.cutSlow}`, w);
}
const WORDS = {
  inventory: { Noun: "Inventory", Plain: "Unsold stock",
    best: "Selling more with less on the shelf. Beautiful.",
    good: "They're selling it faster than they're stacking it. That's how it should work.",
    warn: "The shelves are filling a little faster than they empty.",
    warnBig: "That's not a rounding error. That's a pile.",
    risk: "Less going out, more piling in. Wrong direction.",
    cutFast: "They cut stock faster than sales fell. Somebody's paying attention.",
    cutSlow: "The business is shrinking faster than the stockroom." },
  receivables: { Noun: "Receivables", Plain: "Unpaid customer bills",
    best: "More sales, fewer unpaid bills. Customers are paying up.",
    good: "Sales are outrunning the unpaid bills. That's how it should work.",
    warn: "The IOUs are growing a bit faster than the sales.",
    warnBig: "The IOUs are growing much faster than the sales. Who hasn't paid?",
    risk: "Fewer sales, more unpaid bills. Wrong direction.",
    cutFast: "Unpaid bills fell faster than sales. Somebody's collecting.",
    cutSlow: "The business is shrinking faster than the unpaid bills." },
  sga: { Noun: "SG&A", Plain: "Overheads",
    best: "More sales, lower overheads. That almost never happens.",
    good: "Overheads are growing slower than the business. That's the whole trick.",
    warn: "Overheads are edging ahead of sales. Not a crisis. Not nothing.",
    warnBig: "Overheads are outrunning the business. That's backwards.",
    risk: "Smaller business, bigger overheads. Wrong direction.",
    cutFast: "They cut overheads faster than sales fell. Somebody's paying attention.",
    cutSlow: "The business is shrinking faster than its overheads." },
  capex:  { Noun: "Capital spending", Plain: "Spending on buildings and equipment" },
  rnd:    { Noun: "R&D", Plain: "Research spending" },
  margin: { Noun: "Gross margin", Plain: "The slice of each sale kept after direct costs" },
  tax:    { Noun: "Tax rate", Plain: "Tax rate" },
};

// R&D and Capital expenditure: spending more is not bad in itself.
// The warning is for cutting investment while sales grow.
const BIG_BET_TIMES = 2; // "a big bet" means growing more than this many times the sales rate
function investLabel(s, i, w) {
  if (s >= 0) {
    if (i < 0) return both("Warning", N => `Sales ${up(s)}. ${N} ${down(i)}. Growing today, spending less on tomorrow. Ask why.`, w);
    if (i > BIG_BET_TIMES * s) return both("Neutral / watch", N => `Sales ${up(s)}. ${N} ${up(i)}. That's a big bet. On what?`, w);
    return both("Good", N => `Sales ${up(s)}. ${N} ${i > 0 ? up(i) : "flat"}. The business grows. The investment keeps going. Good.`, w);
  }
  if (i > 0) return both("Neutral / watch", N => `Sales ${down(s)}. ${N} ${up(i)}. Spending into a dip. Brave or stubborn. Find out which.`, w);
  if (i < 0) return both("Neutral / watch", N => `Sales ${down(s)}. ${N} ${down(i)}. Planned diet or forced cut? The filing will say.`, w);
  return both("Neutral / watch", N => `Sales ${down(s)}. ${N} flat. Holding the line while sales fall. Worth a look.`, w);
}

// Gross profit: did the margin widen or narrow? Measured in percentage points.
const MARGIN_STEADY_PP = 0.5;
function marginLabel(s, change, thisM, lastM) {
  const w = WORDS.margin, moved = `${one(lastM)}% to ${one(thisM)}% (${signed(change)} points)`;
  if (Math.abs(change) <= MARGIN_STEADY_PP) return both("Neutral / watch", N => `${N}: ${one(lastM)}% last year, ${one(thisM)}% now. Steady. Boring. Boring is fine.`, w);
  if (change > 0) return s >= 0
    ? both("Most favourable", N => `${N} went from ${moved}. Sales ${up(s)} too. Selling more and keeping more of each sale. That's the dream.`, w)
    : both("Good", N => `${N} went from ${moved}, with sales ${down(s)}. Smaller, but richer per sale.`, w);
  return s < 0
    ? both("Risk rising", N => `${N} slipped from ${moved}. Sales ${down(s)}. Fewer sales, thinner sales. Wrong direction, twice.`, w)
    : both("Warning", N => `${N} slipped from ${moved} while sales grew ${pct(s)}. Selling more. Keeping less of each sale.`, w);
}

// Effective tax rate: steady is good. A big drop flatters profit and may not repeat.
const TAX_STEADY_PP = 2;
function taxLabel(change, thisR, lastR) {
  const w = WORDS.tax, moved = `${one(lastR)}% to ${one(thisR)}% (${signed(change)} points)`;
  if (Math.abs(change) <= TAX_STEADY_PP) return both("Good", N => `${N}: ${one(lastR)}% last year, ${one(thisR)}% now. Steady. Nothing to see here.`, w);
  if (change < 0) return both("Neutral / watch", N => `${N} fell from ${moved}. Profit got a lift from a smaller tax bill. That kind of lift doesn't always repeat.`, w);
  return both("Warning", N => `${N} jumped from ${moved}. Either this year is high or last year was low. Find out which.`, w);
}

// ---------- Cash and debt: four more cards, with their own rules ----------
// These lines have no accounting jargon to translate, so the plain version is the same.
const same = (name, reason) => ({ name, reason, plain: reason });
const money = x => `$${one(Math.abs(x))}`;

// Cash from profit: for every $100 of profit, how much cash came in from running the business?
const CASH_GOOD = 100, CASH_WATCH = 80;
function cashLabel(r) {
  if (r >= CASH_GOOD) return same("Good", `${money(r)} of cash came in for every $100 of profit. The profit is real money.`);
  if (r >= CASH_WATCH) return same("Neutral / watch", `${money(r)} of cash came in for every $100 of profit. Some of that profit is still an IOU.`);
  return same("Warning", `${r < 0 ? "Cash went out while the accounts showed a profit." : `Only ${money(r)} of cash came in for every $100 of profit.`} Profit on paper, less in the bank. Ask where it went.`);
}

// Free cash flow: cash from operations minus capital expenditure, as a share of sales.
const FCF_THINNER_PP = 2;
function fcfLabel(change, thisM, lastM) {
  if (thisM <= 0) return same("Warning", `The business spent more cash than it brought in. Free cash flow was ${one(thisM).replace("-", "−")}% of sales. Somebody has to fund that.`);
  if (change < -FCF_THINNER_PP) return same("Neutral / watch", `${one(thisM)} cents of every sales dollar was left over as free cash, down from ${one(lastM)}. Still positive. Thinner.`);
  return same("Good", `${one(thisM)} cents of every sales dollar was left over as free cash. Last year: ${one(lastM)}. That's money with no strings on it.`);
}

// What it owes: liabilities as a share of assets. The label looks at the direction, not the level.
const OWES_STEADY_PP = 2;
function owesLabel(change, thisR, lastR) {
  if (thisR >= 100) return same("Warning", `It owes more than it owns: liabilities are ${one(thisR)}% of assets. The owners' share is below zero.`);
  if (change > OWES_STEADY_PP) return same("Warning", `Other people's money funds ${one(thisR)}% of the assets, up from ${one(lastR)}%. Leaning harder on borrowing and credit.`);
  if (change < -OWES_STEADY_PP) return same("Good", `Other people's money funds ${one(thisR)}% of the assets, down from ${one(lastR)}%. Leaning less on borrowing and credit.`);
  return same("Neutral / watch", `Other people's money funds ${one(thisR)}% of the assets. Last year: ${one(lastR)}%. No real change.`);
}

// Return on assets: profit for every $100 of assets. Banks earn about $1, so they get a finer threshold.
function roaLabel(change, thisR, lastR, steady) {
  if (thisR <= 0) return same("Warning", `It lost ${money(thisR)} for every $100 of assets. The assets are not paying their way.`);
  if (change > steady) return same("Good", `It earned ${money(thisR)} for every $100 of assets, up from ${money(lastR)}. The assets are working harder.`);
  if (change < -steady) return same("Warning", `It earned ${money(thisR)} for every $100 of assets, down from ${money(lastR)}. The assets are earning less.`);
  return same("Neutral / watch", `It earned ${money(thisR)} for every $100 of assets. Last year: ${money(lastR)}. Steady.`);
}

// The last line of a card, one for each reader. Same card, different question.
// Investor: what to check in the filing before trusting the number. CFO: what to ask inside the business.
// Never buy or sell advice. Order: [investor, cfo] for good, watch, warn.
const NEXT = {
  "Inventory": {
    good:  ["Check the inventory note. Lean stock is only good if the shelves weren't empty.", "Ask whether anything ran out. Lean is good. Empty is not."],
    watch: ["Check next quarter's inventory. One year in step proves little.", "Ask which lines are building stock and which are running down."],
    warn:  ["Read the inventory note: raw materials, or finished goods nobody bought?", "Ask which products are piling up, and how much cash is tied up in them."] },
  "Accounts receivable": {
    good:  ["Check the bad-debt allowance. Fast collection should not come from writing bills off.", "Ask what changed in collections, and keep doing it."],
    watch: ["Check how long customers take to pay, in the notes. Steady is the goal.", "Ask whether any big customer is paying later than last year."],
    warn:  ["Read the receivables note: a few big customers, or everyone paying late?", "Ask who owes the most, and how old the oldest bills are."] },
  "Capital expenditure": {
    good:  ["Check the cash flow statement. What was the money spent on?", "Ask which projects got the money, and when they pay back."],
    watch: ["Check what management says the spending is for (MD&A, Liquidity).", "Ask for the business case behind the biggest project."],
    warn:  ["Check whether spending still covers wear and tear. Compare it with depreciation.", "Ask what was postponed, and what breaks if it stays postponed."] },
  "Research and development": {
    good:  ["Check what the R&D is aimed at. The filing usually names the programmes.", "Ask which projects are closest to launch."],
    watch: ["Check what the bigger budget is for, and whether it is a one-off.", "Ask what the extra money is buying, and by when."],
    warn:  ["Check why it fell: projects finished, or projects cancelled?", "Ask which projects were cut, and what they would have become."] },
  "Gross profit": {
    good:  ["Check why the margin widened: prices up, costs down, or a richer mix?", "Ask which products drove the gain, and whether it will last."],
    watch: ["Check margin by segment. A steady total can hide two moving parts.", "Ask which product lines gained margin and which lost it."],
    warn:  ["Check what squeezed the margin: input costs, discounts, or a cheaper mix?", "Ask where the squeeze came from: suppliers, pricing or mix."] },
  "SG&A": {
    good:  ["Check the saving isn't a one-off, like a pause in advertising.", "Ask what was cut, and whether sales will miss it."],
    watch: ["Check the breakdown: selling, marketing, head office.", "Ask which overhead line grew fastest."],
    warn:  ["Check what grew: people, advertising, or one-off costs?", "Ask which budgets overran, and what the money bought."] },
  "Cash from profit": {
    good:  ["Check it isn't a one-off, like stretching payments to suppliers.", "Ask what brought the cash in, and whether it can happen again."],
    watch: ["Check the cash flow statement: which working-capital line took the cash?", "Ask which of stock, customer bills or supplier payments soaked up the cash."],
    warn:  ["Read the cash flow statement line by line. Where did the profit go?", "Ask for cash collected against sales booked, by business line."] },
  "Free cash flow": {
    good:  ["Check what the free cash is used for: dividends, buybacks, debt or deals.", "Ask what the plan is for the spare cash."],
    watch: ["Check whether cash from operations fell or capital spending rose.", "Ask whether the squeeze is a planned investment or a slipping business."],
    warn:  ["Check how the gap was funded: borrowing, new shares, or cash in the bank.", "Ask how many months the current cash covers at this rate."] },
  "What it owes": {
    good:  ["Check what was paid down, and what it cost to do so.", "Ask whether paying down debt beat investing the money."],
    watch: ["Check the debt note for what falls due in the next two years.", "Ask what refinancing is coming, and at what rate."],
    warn:  ["Read the debt note: what was borrowed, at what rate, due when?", "Ask what the new borrowing paid for, and what conditions the lenders set."] },
  "Return on assets": {
    good:  ["Check whether profit rose or assets shrank. They are not the same story.", "Ask which assets earn the most, and how to get more of them."],
    watch: ["Check the return by segment, if the filing gives it.", "Ask which parts of the business earn their keep and which do not."],
    warn:  ["Check for write-downs or a big purchase that swelled the assets.", "Ask which assets are not earning, and what happens to them."] },
  "Effective tax rate": {
    good:  ["Check the tax note anyway. A steady rate can hide one-offs that cancel out.", "Ask your tax team whether anything in the tax note is about to change."],
    watch: ["Read the tax rate reconciliation in the notes. Find the one-off.", "Ask your tax team what lowered the rate, and whether it repeats."],
    warn:  ["Read the tax rate reconciliation in the notes. Which year was the odd one?", "Ask your tax team what raised the rate, and whether it stays."] },
};
const PLAIN_SIGNAL = {
  "Inventory": "Unsold stock", "Accounts receivable": "Unpaid customer bills", "Capital expenditure": "Buildings and equipment",
  "Research and development": "Research spending", "Gross profit": "Profit after direct costs", "SG&A": "Overheads",
  "Effective tax rate": "Share of profit paid in tax", "Labour force": "People employed",
  "Cash from profit": "Did profit turn into cash?", "Free cash flow": "Cash left over", "What it owes": "What it owes", "Return on assets": "What the assets earn",
};

// A label's tone, for the small mark beside it: hollow = good, half = watch, filled = warning.
const TONE = { "Most favourable": "good", "Good": "good", "Neutral / watch": "watch", "Warning": "warn", "Risk rising": "warn" };

// One plain line on what each signal is and why it matters.
const WHAT = {
  "Inventory": "Goods the company has bought or made but not yet sold. If it grows faster than sales, stock may be piling up.",
  "Accounts receivable": "Money customers owe for things already sold to them. If it grows faster than sales, customers may be taking longer to pay.",
  "Capital expenditure": "Money spent on long-lasting things like buildings and machines. It shows how much the company is investing in its future.",
  "Research and development": "Money spent inventing and improving products. Cutting it lifts profit today and can cost sales later.",
  "Gross profit": "Sales minus the direct cost of what was sold. Gross margin is how many cents of each sales dollar are left after that cost.",
  "SG&A": "Selling, general and administrative costs: the overheads of running the business, such as salaries, offices and advertising.",
  "Effective tax rate": "The share of pre-tax profit that goes to income tax. Big swings often come from one-off items.",
  "Labour force": "How many people the company employs. Set against sales, it shows whether each person is producing more.",
  "Cash from profit": "Profit is an opinion; cash is a fact. This sets the cash the business actually brought in against the profit it reported.",
  "Free cash flow": "Cash from running the business, minus what was spent on buildings and equipment. It is what is left to pay lenders and owners.",
  "What it owes": "Everything the company owes (loans, bills, promises) as a share of everything it owns. The rest belongs to the shareholders.",
  "Return on assets": "Profit for every $100 of assets. It shows how hard the company's buildings, stock and cash are working.",
};

// ---------- 4. Build the cards ----------
// info: { sic, sicDescription } from the SEC's company record. Optional.
export function buildCards(facts, cik, info = {}) {
  const gaap = facts.facts?.["us-gaap"];
  // Where a number can be checked. If we know the name of the 10-K document inside the filing, link
  // straight to it; otherwise link to the filing's folder.
  const filingUrl = r => `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${r.accn.replace(/-/g, "")}/${info.docs?.[r.accn] ?? ""}`;
  // A link that opens the 10-K scrolled to a number and highlights it, e.g. ...htm#:~:text=83,292.
  // Browsers that don't support this just open the document at the top.
  const atNumber = (r, shown) => info.docs?.[r.accn] ? `${filingUrl(r)}#:~:text=${encodeURIComponent(shown)}` : null;

  // Sales sets the two fiscal years. Use the sales tag with the most recent annual figure.
  // If two tags cover the same year, the larger one is total revenue (the other is a part of it).
  let anchor = null, anchorTag = null;
  for (const tag of CONCEPTS.sales.tags) {
    const rows = annualRows(gaap, tag, false);
    if (rows.length < 2) continue;
    if (!anchor || rows[0].end > anchor[0].end || (rows[0].end === anchor[0].end && rows[0].val > anchor[0].val)) { anchor = rows; anchorTag = tag; }
  }
  if (!anchor) throw new Error("There are not two years of annual sales in its SEC data yet. It may be newly listed, or report its sales in an unusual way.");
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
      if (c.totalFirst && (a || b)) return null; // the total exists for one year only: say Not found, don't use a part
    }
    return null;
  }
  const F = Object.fromEntries(Object.keys(CONCEPTS).map(k => [k, find(k)]));
  const found = Object.values(F).filter(Boolean);

  // Show numbers the way the 10-K prints them: millions if every figure is a whole million, else thousands.
  const inMillions = found.every(f => f.this_year.usd % 1e6 === 0 && f.last_year.usd % 1e6 === 0);
  const UNIT = inMillions ? 1e6 : 1e3;
  const unit = inMillions ? "USD millions" : "USD thousands";
  const fmt = usd => { const n = Math.round(usd / UNIT); return `${n < 0 ? "−" : ""}${Math.abs(n).toLocaleString("en-US")}`; };

  // One table row: item, this year, last year, formula and result, source.
  const inputRow = (f, formula = []) => ({
    item: f.item, item_plain: CONCEPTS[f.key].plain, tag: f.tag, statement: f.statement, url: f.this_year.url,
    this_year: fmt(f.this_year.usd), last_year: fmt(f.last_year.usd), formula,
    this_link: atNumber(f.this_year, fmt(Math.abs(f.this_year.usd))), last_link: atNumber(f.last_year, fmt(Math.abs(f.last_year.usd))),
  });
  const growthRow = f => {
    const [a, b] = [f.this_year.usd, f.last_year.usd];
    if (b === 0) return { ...inputRow(f, ["Last year was zero, so there is no growth rate."]), growth_pct: null };
    const g = round1((a - b) / Math.abs(b) * 100);
    return { ...inputRow(f, [`(${fmt(a)} − ${fmt(b)}) ÷ ${fmt(b)} × 100 = ${g < 0 ? "−" : ""}${one(Math.abs(g))}%`]), growth_pct: g };
  };
  const industry = info.sicDescription ? ` (SEC industry: ${info.sicDescription})` : "";
  const noCard = (signal, state, note) => ({ signal, signal_plain: PLAIN_SIGNAL[signal], next: null, what: WHAT[signal], state, rows: [], label: null, tone: null, trend: null, ratios: [], status: "Draft", note, big: "—", small: "" });
  // A missing item is "Doesn't apply" only where we know why; otherwise it is "Not found".
  const missingCard = (signal, missing, financialNote) => financialNote && isFinancial(info.sic)
    ? noCard(signal, "Doesn't apply", `${financialNote}${industry}.`)
    : noCard(signal, "Not found", `Not found in the SEC data for these two years: ${missing.join(", ")}. The company may not report it as its own line. Missing does not mean zero.`);
  // big and small: the one number shown on the tile, and the line under it.
  const nextFor = (signal, label) => { const pair = label && NEXT[signal]?.[TONE[label.name]]; return pair ? { investor: pair[0], cfo: pair[1] } : null; };
  const card = (signal, rows, label, extra = {}) => ({ signal, signal_plain: PLAIN_SIGNAL[signal], next: nextFor(signal, label), what: WHAT[signal], state: "OK", rows, label, tone: label ? TONE[label.name] : null, trend: null, ratios: [], status: "Draft", big: "—", small: "", ...extra });

  // 7. The last few years, for context. The label still comes from the latest two years only.
  // Each trend row compares one year with the year before, using the same rules as the label.
  const ends = [anchor[0].end];
  for (let k = 1; k < anchor.length && ends.length < 6; k++) {
    const d = days(anchor[k].end, anchor[k - 1].end);
    if (d < 350 || d > 380) break;
    ends.push(anchor[k].end);
  }
  const seriesOf = f => { const rows = annualRows(gaap, f.tag, CONCEPTS[f.key].instant); return ends.map(e => rows.find(r => r.end === e)?.val ?? null); };
  const growthOf = (a, b) => a === null || b === null || b === 0 ? null : round1((a - b) / Math.abs(b) * 100);
  const salesSeries = seriesOf(F.sales);
  const salesGrowth = k => growthOf(salesSeries[k], salesSeries[k + 1]);
  // rowFor(k) returns the cells for year k against year k+1, or null where the history runs out.
  function trendTable(columns, rowFor, plainColumns = columns) {
    const rows = [];
    for (let k = 0; k + 1 < ends.length; k++) { const r = rowFor(k); if (!r) break; rows.push([fyLabel(ends[k]), ...r]); }
    return rows.length > 1 ? { columns: ["Year", ...columns], columns_plain: ["Year", ...plainColumns], rows } : null;
  }
  const paceTrend = (key, labeller) => {
    const it = seriesOf(F[key]);
    return trendTable(["Sales growth", `${CONCEPTS[key].name} growth`, "Label"], k => {
      const sg = salesGrowth(k), ig = growthOf(it[k], it[k + 1]);
      return sg === null || ig === null ? null : [signedPct(sg), signedPct(ig), labeller(sg, ig).name];
    }, ["Sales growth", `${CONCEPTS[key].plain} growth`, "Label"]);
  };
  const rateTrend = (name, plainName, rates, labelFor) => trendTable([name, "Change", "Label"], k => {
    const [a, b] = [rates[k], rates[k + 1]];
    if (a === null || b === null) return null;
    const change = round1(a - b);
    return [`${one(a)}%`, `${signed(change)} points`, labelFor(k, change, a, b)];
  }, [plainName, "Change", "Label"]);

  const salesRow = growthRow(F.sales);
  const s = salesRow.growth_pct;

  // The ratio an analyst would quote for each item, beside the growth rate. Uses year-end balances, as printed.
  function ratiosFor(key) {
    const [a, b] = [F[key].this_year.usd, F[key].last_year.usd], [sa, sb] = [F.sales.this_year.usd, F.sales.last_year.usd];
    const share = (name, plain, reading) => {
      const [pa, pb] = [round1(a / sa * 100), round1(b / sb * 100)];
      return { name, name_plain: plain, this_year: `${one(pa)}%`, last_year: `${one(pb)}%`,
        formula: [`${fmt(a)} ÷ ${fmt(sa)} × 100 = ${one(pa)}%`, `${fmt(b)} ÷ ${fmt(sb)} × 100 = ${one(pb)}%`], reading: reading(one(pa), one(pb)) };
    };
    const daysOf = (name, plain, over, reading) => {
      const [oa, ob] = [over.this_year.usd, over.last_year.usd];
      if (oa <= 0 || ob <= 0) return null;
      const [da, db] = [Math.round(a / oa * 365), Math.round(b / ob * 365)];
      return { name, name_plain: plain, this_year: `${da} days`, last_year: `${db} days`,
        formula: [`${fmt(a)} ÷ ${fmt(oa)} × 365 = ${da} days`, `${fmt(b)} ÷ ${fmt(ob)} × 365 = ${db} days`], reading: reading(da, db) };
    };
    const out = [];
    if (key === "inventory" && F.cost) out.push(daysOf("Days of inventory", "Days of stock on hand", F.cost, (x, y) => `At this year's pace, the stock on hand would last ${x} days. Last year: ${y}.`));
    if (key === "receivables") out.push(daysOf("Days to collect", "Days customers take to pay", F.sales, (x, y) => `Customers take about ${x} days to pay. Last year: ${y}.`));
    if (key === "sga") out.push(share("SG&A as a share of sales", "Overheads as a share of sales", (x, y) => `Overheads take ${x} cents of every sales dollar. Last year: ${y}.`));
    if (key === "rnd") out.push(share("R&D as a share of sales", "Research as a share of sales", (x, y) => `${x} cents of every sales dollar goes back into research. Last year: ${y}.`));
    if (key === "capex") {
      out.push(share("Capex as a share of sales", "Buildings and equipment as a share of sales", (x, y) => `${x} cents of every sales dollar goes into buildings and equipment. Last year: ${y}.`));
      const [da, db] = F.depreciation ? [F.depreciation.this_year.usd, F.depreciation.last_year.usd] : [0, 0];
      if (da > 0 && db > 0) {
        const [ta, tb] = [round1(a / da), round1(b / db)];
        out.push({ name: "Capex against depreciation", name_plain: "New spending against wear and tear", this_year: `${one(ta)}×`, last_year: `${one(tb)}×`,
          formula: [`${fmt(a)} ÷ ${fmt(da)} = ${one(ta)}×`, `${fmt(b)} ÷ ${fmt(db)} = ${one(tb)}×`],
          reading: ta >= 1 ? `It is spending ${one(ta)} times what wears out each year. The asset base is growing.` : `It is spending ${one(ta)} times what wears out each year. Below 1×, the asset base is shrinking.` });
      }
    }
    return out.filter(Boolean);
  }

  // Item growth against sales growth.
  function versusSales(signal, key, labeller, financialNote) {
    if (!F[key]) return missingCard(signal, [CONCEPTS[key].name], financialNote);
    const row = growthRow(F[key]);
    if (s === null || row.growth_pct === null) return card(signal, [salesRow, row], null, { state: "No label", note: "A growth rate could not be worked out because last year's figure was zero." });
    return card(signal, [salesRow, row], labeller(s, row.growth_pct), { gap_pp: round1(row.growth_pct - s), big: signedPct(row.growth_pct), small: `vs sales ${signedPct(s)}`, trend: paceTrend(key, labeller), ratios: ratiosFor(key) });
  }

  function grossProfit() {
    if (!F.cost && !F.gross) return missingCard("Gross profit", ["Cost of sales", "Gross profit"], "Banks and insurers have no cost of sales. No cost of sales, no gross profit");
    const [sa, sb] = [F.sales.this_year.usd, F.sales.last_year.usd];
    let ga, gb, rows;
    if (F.cost) { // gross profit = sales − cost of sales, so every step can be checked
      const [ca, cb] = [F.cost.this_year.usd, F.cost.last_year.usd];
      [ga, gb] = [sa - ca, sb - cb];
      rows = [salesRow, inputRow(F.cost), { item: "Gross profit", item_plain: "Profit after direct costs", statement: "Worked out here", this_year: fmt(ga), last_year: fmt(gb),
        formula: [`${fmt(sa)} − ${fmt(ca)} = ${fmt(ga)}`, `${fmt(sb)} − ${fmt(cb)} = ${fmt(gb)}`] }];
    } else {      // no cost of sales line, but the filing gives gross profit itself
      [ga, gb] = [F.gross.this_year.usd, F.gross.last_year.usd];
      rows = [salesRow, inputRow(F.gross)];
    }
    const [ma, mb] = [round1(ga / sa * 100), round1(gb / sb * 100)];
    const change = round1(ma - mb);
    rows.push({ item: "Gross margin", item_plain: "Kept from each sales dollar", statement: "Worked out here", this_year: `${one(ma)}%`, last_year: `${one(mb)}%`,
      formula: [`${fmt(ga)} ÷ ${fmt(sa)} × 100 = ${one(ma)}%`, `${fmt(gb)} ÷ ${fmt(sb)} × 100 = ${one(mb)}%`, `${one(ma)} − ${one(mb)} = ${signed(change)} percentage points`] });
    const grossSeries = F.cost ? seriesOf(F.cost).map((c, k) => c === null ? null : salesSeries[k] - c) : seriesOf(F.gross);
    const margins = grossSeries.map((g, k) => g === null ? null : round1(g / salesSeries[k] * 100));
    const trend = rateTrend("Gross margin", "Kept from each sales dollar", margins, (k, ch, a, b) => salesGrowth(k) === null ? "—" : marginLabel(salesGrowth(k), ch, a, b).name);
    return card("Gross profit", rows, s === null ? null : marginLabel(s, change, ma, mb), { change_pp: change, big: `${one(ma)}%`, small: `${signed(change)} points on last year`, trend });
  }

  function taxRate() {
    const missing = ["tax", "pretax"].filter(k => !F[k]).map(k => CONCEPTS[k].name);
    if (missing.length) return missingCard("Effective tax rate", missing);
    const [ta, tb, pa, pb] = [F.tax.this_year.usd, F.tax.last_year.usd, F.pretax.this_year.usd, F.pretax.last_year.usd];
    const rows = [inputRow(F.tax), inputRow(F.pretax)];
    if (pa <= 0 || pb <= 0) return card("Effective tax rate", rows, null, { state: "Doesn't apply", note: "Pre-tax profit was zero or a loss in one of the two years, so a tax rate would mislead." });
    const [ra, rb] = [round1(ta / pa * 100), round1(tb / pb * 100)];
    const change = round1(ra - rb);
    rows.push({ item: "Effective tax rate", item_plain: "Share of profit paid in tax", statement: "Worked out here", this_year: `${one(ra)}%`, last_year: `${one(rb)}%`,
      formula: [`${fmt(ta)} ÷ ${fmt(pa)} × 100 = ${one(ra)}%`, `${fmt(tb)} ÷ ${fmt(pb)} × 100 = ${one(rb)}%`, `${one(ra)} − ${one(rb)} = ${signed(change)} percentage points`] });
    const [taxes, pretaxes] = [seriesOf(F.tax), seriesOf(F.pretax)];
    const rates = taxes.map((t, k) => t === null || pretaxes[k] === null || pretaxes[k] <= 0 ? null : round1(t / pretaxes[k] * 100));
    const trend = rateTrend("Effective tax rate", "Share of profit paid in tax", rates, (k, ch, a, b) => taxLabel(ch, a, b).name);
    return card("Effective tax rate", rows, taxLabel(change, ra, rb), { change_pp: change, big: `${one(ra)}%`, small: `${signed(change)} points on last year`, trend });
  }

  // ---------- Cash and debt ----------
  const worked = (item, plain, a, b, formula) => ({ item, item_plain: plain, statement: "Worked out here", this_year: a, last_year: b, formula });
  const need = (signal, keys, financialNote) => {
    if (financialNote && isFinancial(info.sic)) return noCard(signal, "Doesn't apply", `${financialNote}${industry}.`);
    const missing = keys.filter(k => !F[k]).map(k => CONCEPTS[k].name);
    return missing.length ? missingCard(signal, missing) : null;
  };
  const pair = k => [F[k].this_year.usd, F[k].last_year.usd];
  const neg = x => one(x).replace("-", "−");               // −1.5, with a proper minus
  const inBrackets = x => (x < 0 ? `(${neg(x)})` : neg(x)); // so a subtraction reads 1.0 − (−1.5)
  // The last row of a rate card: the rate for each year, how it was worked out, and the change.
  const rateCard = (signal, rows, name, plain, a, b, howA, howB, small, label, series, labelFor) => {
    const change = round1(a - b);
    rows.push(worked(name, plain, `${neg(a)}%`, `${neg(b)}%`, [`${howA} = ${neg(a)}%`, `${howB} = ${neg(b)}%`, `${neg(a)} − ${inBrackets(b)} = ${signed(change)} percentage points`]));
    return card(signal, rows, label(change), { change_pp: change, big: `${neg(a)}%`, small: `${signed(change)} points on last year`, measure: small, trend: rateTrend(name, plain, series, labelFor) });
  };

  function cashFromProfit() {
    const no = need("Cash from profit", ["ocf", "netincome"], "A bank's cash flows are mostly customers' money moving in and out, so cash against profit says little");
    if (no) return no;
    const [ca, cb] = pair("ocf"), [na, nb] = pair("netincome");
    const rows = [inputRow(F.ocf), inputRow(F.netincome)];
    if (na <= 0 || nb <= 0) return card("Cash from profit", rows, null, { state: "Doesn't apply", note: "The company made a loss in one of the two years, so cash per $100 of profit would mislead. Read the two numbers above side by side." });
    const [ra, rb] = [round1(ca / na * 100), round1(cb / nb * 100)];
    const [cs, ns] = [seriesOf(F.ocf), seriesOf(F.netincome)];
    const series = cs.map((c, k) => c === null || ns[k] === null || ns[k] <= 0 ? null : round1(c / ns[k] * 100));
    return rateCard("Cash from profit", rows, "Cash against profit", "Cash as a share of profit", ra, rb, `${fmt(ca)} ÷ ${fmt(na)} × 100`, `${fmt(cb)} ÷ ${fmt(nb)} × 100`, "of profit came in as cash", () => cashLabel(ra), series, (k, ch, a) => cashLabel(a).name);
  }

  function freeCashFlow() {
    const no = need("Free cash flow", ["ocf", "capex"], "A bank's cash flows are mostly customers' money moving in and out, so free cash flow says little");
    if (no) return no;
    const [ca, cb] = pair("ocf"), [xa, xb] = pair("capex"), [sa, sb] = pair("sales");
    const [fa, fb] = [ca - xa, cb - xb];
    const [ma, mb] = [round1(fa / sa * 100), round1(fb / sb * 100)];
    const rows = [inputRow(F.ocf), inputRow(F.capex), salesRow,
      worked("Free cash flow", "Cash left over", fmt(fa), fmt(fb), [`${fmt(ca)} − ${fmt(xa)} = ${fmt(fa)}`, `${fmt(cb)} − ${fmt(xb)} = ${fmt(fb)}`])];
    const [cs, xs] = [seriesOf(F.ocf), seriesOf(F.capex)];
    const series = cs.map((c, k) => c === null || xs[k] === null ? null : round1((c - xs[k]) / salesSeries[k] * 100));
    return rateCard("Free cash flow", rows, "Free cash flow margin", "Cash left over as a share of sales", ma, mb, `${fmt(fa)} ÷ ${fmt(sa)} × 100`, `${fmt(fb)} ÷ ${fmt(sb)} × 100`, "of sales left as free cash", ch => fcfLabel(ch, ma, mb), series, (k, ch, a, b) => fcfLabel(ch, a, b).name);
  }

  function whatItOwes() {
    const no = need("What it owes", ["assets", "equity"], "Banks run on borrowed money by design: deposits are their raw material. This yardstick is for other companies");
    if (no) return no;
    const [aa, ab] = pair("assets"), [ea, eb] = pair("equity");
    const [la, lb] = [aa - ea, ab - eb];
    const [ra, rb] = [round1(la / aa * 100), round1(lb / ab * 100)];
    const rows = [inputRow(F.assets), inputRow(F.equity),
      worked("Liabilities", "Everything it owes", fmt(la), fmt(lb), [`${fmt(aa)} − ${ea < 0 ? `(${fmt(ea)})` : fmt(ea)} = ${fmt(la)}`, `${fmt(ab)} − ${eb < 0 ? `(${fmt(eb)})` : fmt(eb)} = ${fmt(lb)}`])];
    const [as, es] = [seriesOf(F.assets), seriesOf(F.equity)];
    const series = as.map((a, k) => a === null || es[k] === null || a <= 0 ? null : round1((a - es[k]) / a * 100));
    return rateCard("What it owes", rows, "Liabilities as a share of assets", "Share of assets funded by what it owes", ra, rb, `${fmt(la)} ÷ ${fmt(aa)} × 100`, `${fmt(lb)} ÷ ${fmt(ab)} × 100`, "of assets funded by what it owes", ch => owesLabel(ch, ra, rb), series, (k, ch, a, b) => owesLabel(ch, a, b).name);
  }

  function returnOnAssets() {
    const no = need("Return on assets", ["netincome", "assets"]);
    if (no) return no;
    const steady = isFinancial(info.sic) ? 0.2 : 1; // points; banks earn about 1%, so small moves matter
    const [na, nb] = pair("netincome"), [aa, ab] = pair("assets");
    const [ra, rb] = [round1(na / aa * 100), round1(nb / ab * 100)];
    const rows = [inputRow(F.netincome), inputRow(F.assets)];
    const [ns, as] = [seriesOf(F.netincome), seriesOf(F.assets)];
    const series = ns.map((n, k) => n === null || as[k] === null || as[k] <= 0 ? null : round1(n / as[k] * 100));
    return rateCard("Return on assets", rows, "Return on assets", "What the assets earn", ra, rb, `${fmt(na)} ÷ ${fmt(aa)} × 100`, `${fmt(nb)} ÷ ${fmt(ab)} × 100`, "earned on its assets", ch => roaLabel(ch, ra, rb, steady), series, (k, ch, a, b) => roaLabel(ch, a, b, steady).name);
  }

  const cards = [
    versusSales("Inventory", "inventory", (a, b) => paceLabel(a, b, WORDS.inventory), "Banks and insurers don't hold stock to sell. Nothing to read here"),
    versusSales("Accounts receivable", "receivables", (a, b) => paceLabel(a, b, WORDS.receivables), "Banks and insurers lend money rather than bill customers. Trade receivables are the wrong yardstick"),
    versusSales("Capital expenditure", "capex", (a, b) => investLabel(a, b, WORDS.capex)),
    versusSales("Research and development", "rnd", (a, b) => investLabel(a, b, WORDS.rnd)),
    grossProfit(),
    versusSales("SG&A", "sga", (a, b) => paceLabel(a, b, WORDS.sga)),
    taxRate(),
    noCard("Labour force", "Not found", "The SEC's number feed does not carry headcount; it sits in the 10-K text (Item 1, Human Capital). It will be read from there in a later step."),
    cashFromProfit(), freeCashFlow(), whatItOwes(), returnOnAssets(),
  ];
  cards.forEach((c, i) => { c.deck = i < 8 ? "The eight signals" : "Cash and debt"; });

  // For anything missing, list look-alike tags the company did use this year. Helps fix the tag lists above.
  const lookalikes = {};
  for (const [k, c] of Object.entries(CONCEPTS)) {
    if (F[k] || (k === "gross" && F.cost)) continue;
    const hits = Object.keys(gaap ?? {}).filter(t => c.hint.test(t))
      .map(t => ({ tag: t, row: annualRows(gaap, t, c.instant).find(r => r.end === thisEnd) }))
      .filter(h => h.row).map(h => `${h.tag} = ${fmt(h.row.val)}`).slice(0, 8);
    if (hits.length) lookalikes[c.name] = hits;
  }

  const live = cards.slice(0, 8).filter(c => c.label).length;
  const note = isFinancial(info.sic)
    ? `Banks and insurers don't make or sell goods. These eight signals are built for companies that do, so ${live === 0 ? "none of them applies" : live === 1 ? "only one applies" : `only ${live} apply`} here.`
    : null;

  return {
    note,
    company: facts.entityName,
    industry: info.sicDescription ?? null,
    fiscal: { this_year: { fy: fyLabel(thisEnd), end: thisEnd }, last_year: { fy: fyLabel(lastEnd), end: lastEnd } },
    filing: { accn: F.sales.this_year.accn, filed: F.sales.this_year.filed, url: F.sales.this_year.url },
    unit,
    rules: "US GAAP", // the accounting rules the filing follows; two companies on different rules are not comparable
    // The raw inputs, each once, for checking against the filing.
    inputs: found.filter(f => !(f.key === "gross" && F.cost)).map(f => ({ item: f.item, tag: f.tag, statement: f.statement, this_year: f.this_year, last_year: f.last_year, shown: [fmt(f.this_year.usd), fmt(f.last_year.usd)] })),
    missing: Object.keys(F).filter(k => !F[k] && k !== "gross" && !(k === "cost" && F.gross)).map(k => CONCEPTS[k].name).concat("Headcount"),
    lookalikes,
    cards,
  };
}
