// Checks that the label rules and the card maths do what the README says.
// Run with: npm test
// Every number in this file is MADE UP for testing. None of it is real company data.

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCards } from "../signals.mjs";
import { tidyName, cleanTicker } from "../sec.mjs";

// ---------- A tiny made-up company ----------
const THIS = "2026-12-31", LAST = "2025-12-31", OLDER = "2024-12-31";
const year = (end, val, filed = "2027-02-01") => ({ start: `${end.slice(0, 4)}-01-01`, end, val, form: "10-K", fp: "FY", filed, accn: "0000000001-27-000001" });
const date = (end, val, filed = "2027-02-01") => ({ end, val, form: "10-K", fp: "FY", filed, accn: "0000000001-27-000001" });
const TAGS = {
  sales: ["RevenueFromContractWithCustomerExcludingAssessedTax", year], cost: ["CostOfGoodsAndServicesSold", year],
  inventory: ["InventoryNet", date], receivables: ["AccountsReceivableNetCurrent", date], sga: ["SellingGeneralAndAdministrativeExpense", year],
  rnd: ["ResearchAndDevelopmentExpense", year], capex: ["PaymentsToAcquirePropertyPlantAndEquipment", year], tax: ["IncomeTaxExpenseBenefit", year],
  pretax: ["IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest", year],
};
// company({ sales: [110, 100], inventory: [52, 50] }) -> this year first, last year second, in thousands of dollars.
function company(items, extra = {}) {
  const gaap = { ...extra };
  for (const [key, [now, before]] of Object.entries(items)) {
    const [tag, make] = TAGS[key];
    gaap[tag] = { units: { USD: [make(THIS, now * 1000), make(LAST, before * 1000)] } };
  }
  return { entityName: "MADE UP CO", facts: { "us-gaap": gaap } };
}
const cardsOf = (items, info, extra) => Object.fromEntries(buildCards(company(items, extra), "1", info).cards.map(c => [c.signal, c]));
const label = (signal, items, info) => cardsOf(items, info)[signal].label?.name;
// Sales go from 1,000 to 1,000 + s%; the item goes from 1,000 to 1,000 + i%.
const pace = (signal, key, s, i) => label(signal, { sales: [1000 + s * 10, 1000], [key]: [1000 + i * 10, 1000] });

// ---------- Inventory, Accounts receivable, SG&A: growth against sales ----------
test("item falls while sales rise: Most favourable", () => assert.equal(pace("Inventory", "inventory", 10, -5), "Most favourable"));
test("item flat while sales rise: Most favourable", () => assert.equal(pace("Inventory", "inventory", 10, 0), "Most favourable"));
test("item grows more than 2 points slower than sales: Good", () => assert.equal(pace("Inventory", "inventory", 11, 4.3), "Good"));
test("item within 2 points of sales, either side: Neutral / watch", () => {
  assert.equal(pace("SG&A", "sga", 11, 12.6), "Neutral / watch");
  assert.equal(pace("SG&A", "sga", 10.1, 8.9), "Neutral / watch");
  assert.equal(pace("SG&A", "sga", 10, 12), "Neutral / watch"); // exactly 2 points
});
test("item grows more than 2 points faster than sales: Warning", () => assert.equal(pace("Accounts receivable", "receivables", 10, 23.6), "Warning"));
test("sales fall, item rises or stays flat: Risk rising", () => {
  assert.equal(pace("Inventory", "inventory", -5, 3), "Risk rising");
  assert.equal(pace("Inventory", "inventory", -5, 0), "Risk rising");
});
test("both fall within 5 points: Neutral / watch", () => assert.equal(pace("Inventory", "inventory", -10, -7), "Neutral / watch"));
test("both fall, item more than 5 points faster: Good", () => assert.equal(pace("Inventory", "inventory", -10, -20), "Good"));
test("both fall, item more than 5 points slower: Warning", () => assert.equal(pace("Inventory", "inventory", -20, -5), "Warning"));

// ---------- R&D and Capital expenditure: investing ----------
test("sales up, investment cut: Warning", () => assert.equal(pace("Research and development", "rnd", 11, -6.9), "Warning"));
test("sales up, investment up no more than double the sales rate: Good", () => assert.equal(pace("Capital expenditure", "capex", 10, 17), "Good"));
test("sales up, investment up more than double the sales rate: Neutral / watch", () => assert.equal(pace("Capital expenditure", "capex", 11, 63.5), "Neutral / watch"));
test("sales down, whatever investment does: Neutral / watch", () => {
  for (const i of [20, 0, -30]) assert.equal(pace("Research and development", "rnd", -10, i), "Neutral / watch");
});

// ---------- Gross profit: change in margin ----------
const margin = (salesNow, costNow, salesBefore, costBefore) => cardsOf({ sales: [salesNow, salesBefore], cost: [costNow, costBefore] })["Gross profit"];
test("margin within 0.5 points: Neutral / watch", () => assert.equal(margin(1100, 550, 1000, 502).label.name, "Neutral / watch"));
test("margin up, sales up: Most favourable", () => assert.equal(margin(1100, 500, 1000, 500).label.name, "Most favourable"));
test("margin up, sales down: Good", () => assert.equal(margin(900, 400, 1000, 500).label.name, "Good"));
test("margin down, sales up: Warning", () => assert.equal(margin(1100, 600, 1000, 500).label.name, "Warning"));
test("margin down, sales down: Risk rising", () => assert.equal(margin(900, 500, 1000, 500).label.name, "Risk rising"));
test("gross profit is sales minus cost of sales, and the steps are shown", () => {
  const c = margin(1100, 500, 1000, 500);
  assert.equal(c.big, "54.5%");
  assert.deepEqual(c.rows.find(r => r.item === "Gross profit").formula, ["1,100 − 500 = 600", "1,000 − 500 = 500"]);
  assert.equal(c.rows.find(r => r.item === "Gross margin").formula.at(-1), "54.5 − 50.0 = +4.5 percentage points");
});

// ---------- Effective tax rate ----------
const tax = (taxNow, pretaxNow, taxBefore, pretaxBefore) => cardsOf({ sales: [1100, 1000], tax: [taxNow, taxBefore], pretax: [pretaxNow, pretaxBefore] })["Effective tax rate"];
test("tax rate within 2 points: Good", () => assert.equal(tax(214, 1000, 221, 1000).label.name, "Good"));
test("tax rate down more than 2 points: Neutral / watch", () => assert.equal(tax(150, 1000, 220, 1000).label.name, "Neutral / watch"));
test("tax rate up more than 2 points: Warning", () => assert.equal(tax(227, 1000, 105, 1000).label.name, "Warning"));
test("a pre-tax loss in either year: Doesn't apply", () => {
  const c = tax(50, -100, 220, 1000);
  assert.equal(c.state, "Doesn't apply"); assert.equal(c.label, null);
});

// ---------- Missing does not mean zero ----------
test("an item the company does not report says Not found, with no label", () => {
  const c = cardsOf({ sales: [1100, 1000] })["Inventory"];
  assert.equal(c.state, "Not found"); assert.equal(c.label, null); assert.equal(c.big, "—");
});
test("a bank gets Doesn't apply for Inventory, Receivables and Gross profit, and a note", () => {
  const info = { sic: "6021", sicDescription: "National Commercial Banks" };
  const cards = cardsOf({ sales: [1100, 1000], tax: [200, 190], pretax: [1000, 950] }, info);
  for (const s of ["Inventory", "Accounts receivable", "Gross profit"]) assert.equal(cards[s].state, "Doesn't apply");
  assert.equal(cards["SG&A"].state, "Not found");
  assert.match(buildCards(company({ sales: [1100, 1000], tax: [200, 190], pretax: [1000, 950] }), "1", info).note, /only one applies/);
});
test("last year zero: no growth rate and no label", () => {
  const c = cardsOf({ sales: [1100, 1000], capex: [50, 0] })["Capital expenditure"];
  assert.equal(c.state, "No label"); assert.equal(c.label, null);
});
test("Labour force is Not found for now", () => assert.equal(cardsOf({ sales: [1100, 1000] })["Labour force"].state, "Not found"));

// ---------- The numbers themselves ----------
test("growth formula shows inputs, formula and result, to one decimal", () => {
  const row = cardsOf({ sales: [687993, 619985], inventory: [83292, 79871] })["Inventory"].rows;
  assert.equal(row[0].formula[0], "(687,993 − 619,985) ÷ 619,985 × 100 = 11.0%");
  assert.equal(row[1].formula[0], "(83,292 − 79,871) ÷ 79,871 × 100 = 4.3%");
});
test("a fall is written with a proper minus sign", () => {
  assert.match(cardsOf({ sales: [1100, 1000], rnd: [8100, 8700] })["Research and development"].rows[1].formula[0], /= −6\.9%$/);
});
test("units follow the filing: thousands unless every figure is a whole million", () => {
  assert.equal(buildCards(company({ sales: [687993, 619985] }), "1").unit, "USD thousands");
  assert.equal(buildCards(company({ sales: [478834000, 416161000] }), "1").unit, "USD millions");
});
test("a restated figure from the newer filing wins", () => {
  const f = company({ sales: [1100, 1000], inventory: [520, 500] });
  f.facts["us-gaap"].InventoryNet.units.USD.push(date(LAST, 480_000, "2026-02-01")); // what last year's filing said
  assert.equal(cardsOf({}, undefined, f.facts["us-gaap"])["Inventory"].rows[1].last_year, "500");
});
test("quarterly figures are ignored", () => {
  const f = company({ sales: [1100, 1000] });
  f.facts["us-gaap"][TAGS.sales[0]].units.USD.push({ start: "2026-10-01", end: THIS, val: 300_000, form: "10-K", fp: "FY", filed: "2027-02-01", accn: "x" });
  assert.equal(buildCards(f, "1").inputs[0].shown[0], "1,100");
});
test("inventory falls back to finished goods only when the total is absent in both years", () => {
  const sales = company({ sales: [1100, 1000] }).facts["us-gaap"];
  const part = { InventoryFinishedGoodsNetOfReserves: { units: { USD: [date(THIS, 750_000), date(LAST, 740_000)] } } };
  assert.equal(cardsOf({}, undefined, { ...sales, ...part })["Inventory"].rows[1].this_year, "750");
  const totalOneYear = { InventoryNet: { units: { USD: [date(THIS, 900_000)] } } };
  assert.equal(cardsOf({}, undefined, { ...sales, ...part, ...totalOneYear })["Inventory"].state, "Not found");
});
test("the trend table compares each year with the one before, by the same rules", () => {
  const f = company({ sales: [1100, 1000], inventory: [520, 500] });
  f.facts["us-gaap"][TAGS.sales[0]].units.USD.push(year(OLDER, 900_000));
  f.facts["us-gaap"].InventoryNet.units.USD.push(date(OLDER, 600_000));
  const t = buildCards(f, "1").cards[0].trend;
  assert.deepEqual(t.rows, [["FY2026", "+10.0%", "+4.0%", "Good"], ["FY2025", "+11.1%", "−16.7%", "Most favourable"]]);
});
test("number links open the 10-K at the number when the document name is known", () => {
  const docs = { "0000000001-27-000001": "made-up-20261231.htm" };
  const row = cardsOf({ sales: [1100, 1000], inventory: [83292, 79871] }, { docs })["Inventory"].rows[1];
  assert.equal(row.this_link, "https://www.sec.gov/Archives/edgar/data/1/000000000127000001/made-up-20261231.htm#:~:text=83%2C292");
  assert.equal(cardsOf({ sales: [1100, 1000], inventory: [520, 500] })["Inventory"].rows[1].this_link, null);
});
test("every label line has a plain-English version and a line for each reader", () => {
  for (const c of Object.values(cardsOf({ sales: [1100, 1000], cost: [500, 480], inventory: [520, 500], receivables: [300, 250], sga: [200, 190], rnd: [80, 87], capex: [70, 40], tax: [120, 110], pretax: [500, 480] }))) {
    if (!c.label) continue;
    assert.ok(c.label.plain.length > 10, c.signal); assert.ok(c.next.investor && c.next.cfo, c.signal);
    assert.doesNotMatch(c.label.reason + c.next.investor + c.next.cfo, /\b(buy|sell)\b/i, `${c.signal}: no buy or sell advice`);
  }
});
test("a company with under two years of sales is refused clearly", () => {
  assert.throws(() => buildCards({ entityName: "X", facts: { "us-gaap": {} } }, "1"), /not two years of annual sales/);
});

// ---------- Names and tickers ----------
test("company names are tidied", () => {
  assert.equal(tidyName("COSTCO WHOLESALE CORP /NEW", "COST"), "Costco Wholesale Corp");
  assert.equal(tidyName("Apple Inc.", "AAPL"), "Apple Inc.");
  assert.equal(tidyName("JPMORGAN CHASE & CO", "JPM"), "JPMorgan Chase & Co");
  assert.equal(tidyName("BANK OF AMERICA CORP /DE/", "BAC"), "Bank of America Corp");
  assert.equal(tidyName("AT&T INC.", "T"), "AT&T Inc.");
});
test("tickers are cleaned, and anything that is not a ticker is refused", () => {
  assert.equal(cleanTicker(" brk.b "), "BRK-B");
  for (const bad of ["", "../../etc/passwd", "a b", "x;rm"]) assert.throws(() => cleanTicker(bad));
});
