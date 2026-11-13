// AVATAR: three analysts read the same card and may label it differently.
//   owl  = the lender:          "Just pay me back."
//   bull = the growth investor: "Think bigger."
//   bear = the sceptic:         "Prove it."
// These rulebooks are a simplification written for learning. They are not an industry standard,
// and a label is still a first screen, not a verdict. No numbers are typed in here: each rule reads
// the numbers the card already worked out from the filing (card.nums). Nothing here is advice.
//
// Words used below:  s = sales growth %,  g = the item's growth %,  d = g − s (percentage points),
//                    level = this year's rate %,  change = this year's rate − last year's (points).

export const AVATARS = {
  owl:  { name: "The Owl",  role: "Lender",          says: "Just pay me back.", story: "You lent this company money. You only want it back, with interest." },
  bull: { name: "The Bull", role: "Growth investor", says: "Think bigger.",     story: "You own a piece of the company and want it far bigger in five years." },
  bear: { name: "The Bear", role: "Sceptic",         says: "Prove it.",         story: "You assume the numbers are flattering until shown otherwise." },
};
export const TONE_NAME = { good: "Good", watch: "Watch", warn: "Warning" };

const G = "good", W = "watch", X = "warn";
const gap = n => n.g - n.s;
const far = n => Math.abs(n.g - n.s);
const k = n => n.steady ?? 1; // banks earn about 1% on assets, so their cut-offs shrink
// A boom year: sales grew by more than half. Costs and stock always lag in a year like that, so the
// sceptic stops flagging things for merely growing slower than sales, and looks only at what outran them.
const boom = n => n.s > 50;
const UNLESS = "(not counted when sales grew over 50%)";

// Each rulebook is a list of rows, read top to bottom. The first row that fits gives the label.
// A row is [test, tone, when (shown in the rule table), why (the avatar's one-line reason)].
// The last row has no test: it is what is left when nothing above fits.
const RULES = {
  "Inventory": {
    owl: [
      [n => n.s <= 0 && n.g > 0, X, "Sales fell while inventory rose", "Stock is piling up while sales shrink. That is cash sitting on a shelf."],
      [n => gap(n) > 2, X, "Inventory grew more than 2 points faster than sales", "More cash is tied up in stock than the sales justify."],
      [n => gap(n) > 0, W, "Inventory grew a little faster than sales", "A little more cash is tied up in stock. Keep an eye on it."],
      [null, G, "Inventory grew no faster than sales", "Stock is not eating the cash you want back."]],
    bull: [
      [n => n.s <= 0 && n.g > 0, X, "Sales fell while inventory rose", "Stocking up for demand that is not there."],
      [n => n.s <= 0, W, "Sales fell", "There is no growth to stock up for."],
      [n => gap(n) > 25, X, "Inventory grew more than 25 points faster than sales", "Even a growing company can overstock."],
      [n => gap(n) > 10, W, "Inventory grew 10 to 25 points faster than sales", "Stocking up ahead of demand. Fine, if the demand comes."],
      [null, G, "Sales grew, and inventory stayed within 10 points of them", "Stock is keeping up with the growth."]],
    bear: [
      [n => gap(n) > 10, X, "Inventory grew more than 10 points faster than sales", "Stock is piling up faster than it sells."],
      [n => gap(n) > 5, W, "Inventory grew 5 to 10 points faster than sales", "Running ahead of sales. Find out why."],
      [n => !boom(n) && gap(n) < -10, X, `Inventory grew more than 10 points slower than sales ${UNLESS}`, "A gap this wide needs explaining. Is it running short?"],
      [n => !boom(n) && gap(n) < -5, W, `Inventory grew 5 to 10 points slower than sales ${UNLESS}`, "Not in step. Find out why."],
      [null, G, "Nothing above applies", "Nothing here to question."]],
  },
  "Accounts receivable": {
    owl: [
      [n => n.s <= 0 && n.g > 0, X, "Sales fell while receivables rose", "Fewer sales, more unpaid bills. The cash is not coming in."],
      [n => gap(n) > 2, X, "Receivables grew more than 2 points faster than sales", "Customers are taking longer to pay. You want that cash in."],
      [n => gap(n) > 0, W, "Receivables grew a little faster than sales", "Collections are slipping slightly."],
      [null, G, "Receivables grew no faster than sales", "Customers are paying on time."]],
    bull: [
      [n => n.s <= 0 && n.g > 0, X, "Sales fell while receivables rose", "Unpaid bills are growing without any growth to show for it."],
      [n => n.s <= 0, W, "Sales fell", "No growth this year."],
      [n => gap(n) > 25, X, "Receivables grew more than 25 points faster than sales", "Growth that nobody has paid for yet."],
      [n => gap(n) > 10, W, "Receivables grew 10 to 25 points faster than sales", "Fast growth brings unpaid invoices. Watch that they get paid."],
      [null, G, "Sales grew, and receivables stayed within 10 points of them", "Unpaid invoices are a normal price of growth."]],
    bear: [
      [n => gap(n) > 5, X, "Receivables grew more than 5 points faster than sales", "Were sales booked before customers were ready to pay?"],
      [n => gap(n) > 2, W, "Receivables grew 2 to 5 points faster than sales", "Drifting ahead of sales. Check how long customers take to pay."],
      [n => !boom(n) && gap(n) < -10, W, `Receivables grew more than 10 points slower than sales ${UNLESS}`, "Unusually good. Ask what changed."],
      [null, G, "Nothing above applies", "Nothing here to question."]],
  },
  "Capital expenditure": {
    owl: [
      [n => n.g > 100, X, "Spending more than doubled", "A very large commitment of cash."],
      [n => n.g > 25 && n.g > n.s, W, "Spending rose more than 25%, and faster than sales", "Big spending ahead of sales. Where is the cash coming from?"],
      [null, G, "Spending did not jump", "No big new call on the cash."]],
    bull: [
      [n => n.g < -25 && n.s > 0, X, "Spending was cut by more than 25% while sales grew", "Starving the future to flatter today."],
      [n => n.g <= 0, W, "Spending did not rise", "No new investment. Growth has to come from somewhere."],
      [null, G, "Spending rose", "Investing for growth."]],
    bear: [
      [n => n.g > 100 && n.g > n.s, X, "Spending more than doubled, and grew faster than sales", "Bets this big often disappoint."],
      [n => n.g > 50 && n.g > n.s, W, "Spending rose more than 50%, and faster than sales", "A big step up. What is it buying?"],
      [n => n.g < -25, W, "Spending was cut by more than 25%", "A sharp cut. Is cash tight?"],
      [null, G, "Nothing above applies", "No sudden move."]],
  },
  "Research and development": {
    owl: [
      [n => gap(n) > 10, W, "Research grew more than 10 points faster than sales", "Costly now, and the payoff is years away."],
      [null, G, "Research is not outrunning sales", "Not your worry."]],
    bull: [
      [n => n.g < 0, X, "Research spending was cut", "Cutting research cuts the future."],
      [n => gap(n) < -10, W, "Research grew more than 10 points slower than sales", "Research is falling behind the business."],
      [null, G, "Research kept pace with sales", "The future is being paid for."]],
    bear: [
      [n => n.g < 0 && n.s > 0, X, "Research was cut while sales grew", "A cut like this makes profit look better than it is."],
      [n => gap(n) > 10, W, "Research grew more than 10 points faster than sales", "Running well ahead of sales. Find out why."],
      [n => !boom(n) && gap(n) < -10, W, `Research grew more than 10 points slower than sales ${UNLESS}`, "Research is falling behind the business."],
      [null, G, "Nothing above applies", "Nothing here to question."]],
  },
  "Gross profit": {
    owl: [
      [n => n.change < -2, X, "The margin fell more than 2 points", "Less profit on each sale to pay you with."],
      [n => n.change < -0.5, W, "The margin fell 0.5 to 2 points", "A thinner cushion than last year."],
      [null, G, "The margin held or rose", "The cushion on each sale is intact."]],
    bull: [
      [n => n.change < -0.5, X, "The margin fell more than 0.5 points", "Losing pricing power."],
      [n => n.change <= 0.5, W, "The margin was flat (within 0.5 points)", "Flat is not growth."],
      [null, G, "The margin rose more than 0.5 points", "Keeping more of every sale."]],
    bear: [
      [n => n.change < -0.5, X, "The margin fell more than 0.5 points", "Costs are rising faster than prices."],
      [n => n.change > 5, W, "The margin jumped more than 5 points", "Too good. What changed?"],
      [null, G, "The margin was steady or up modestly", "Steady. Nothing odd."]],
  },
  "SG&A": {
    owl: [
      [n => gap(n) > 5, X, "Overheads grew more than 5 points faster than sales", "Overheads are eating the profit that pays you."],
      [n => gap(n) > 0, W, "Overheads grew a little faster than sales", "Costs are creeping ahead of sales."],
      [null, G, "Overheads grew no faster than sales", "Costs are under control."]],
    bull: [
      [n => n.s <= 0 && n.g > 0, X, "Sales fell while overheads rose", "Spending more to sell less."],
      [n => n.s <= 0, W, "Sales fell", "No growth this year."],
      [n => gap(n) > 15, X, "Overheads grew more than 15 points faster than sales", "Spending far ahead of the growth."],
      [n => gap(n) > 5, W, "Overheads grew 5 to 15 points faster than sales", "Hiring ahead of sales. Fine, if the sales follow."],
      [null, G, "Sales grew, and overheads stayed within 5 points of them", "Hiring to grow is fine."]],
    bear: [
      [n => gap(n) > 5, X, "Overheads grew more than 5 points faster than sales", "Costs are running away from sales."],
      [n => gap(n) > 2, W, "Overheads grew 2 to 5 points faster than sales", "Drifting ahead of sales."],
      [n => !boom(n) && gap(n) < -10, W, `Overheads grew more than 10 points slower than sales ${UNLESS}`, "Cuts this deep may not last."],
      [null, G, "Nothing above applies", "Nothing here to question."]],
  },
  "Effective tax rate": {
    owl: [
      [n => n.change > 10, X, "The rate rose more than 10 points", "A much bigger tax bill comes out before you are paid."],
      [n => n.change > 5, W, "The rate rose 5 to 10 points", "A bigger tax bill than last year."],
      [null, G, "The rate did not jump", "Tax is not the story here."]],
    bull: [
      [n => n.change > 10, X, "The rate rose more than 10 points", "Much more of the profit is going to tax."],
      [n => n.change > 5, W, "The rate rose 5 to 10 points", "More of the profit is going to tax."],
      [null, G, "The rate did not jump", "Tax is not the story here."]],
    bear: [
      [n => Math.abs(n.change) > 4, X, "The rate moved more than 4 points, either way", "A swing in the tax rate moves profit without the business changing."],
      [n => n.level < 15, W, "The rate is under 15%", "A rate this low may not last."],
      [null, G, "The rate is steady and not unusually low", "Steady. Nothing odd."]],
  },
  "Cash from profit": {
    owl: [
      [n => n.level < 80, X, "Under 80% of the profit arrived as cash", "Profit on paper does not repay a loan."],
      [n => n.level < 100, W, "80% to 100% of the profit arrived as cash", "Not all of the profit turned into cash."],
      [null, G, "All of the profit, or more, arrived as cash", "The profit is real money."]],
    bull: [
      [n => n.level < 50, X, "Under half of the profit arrived as cash", "Too little of the profit is real money."],
      [n => n.level < 80, W, "50% to 80% of the profit arrived as cash", "Growth is soaking up cash. Watch it."],
      [null, G, "At least 80% of the profit arrived as cash", "Growing companies run a little short of cash. This is fine."]],
    bear: [
      [n => n.level < 80, X, "Under 80% of the profit arrived as cash", "Where did the rest of the profit go?"],
      [n => n.level < 100, W, "80% to 100% of the profit arrived as cash", "Some of the profit is not cash yet."],
      [n => n.change < -20, W, "It fell more than 20 points on last year", "Still above 100%, but a big drop. Why?"],
      [null, G, "All of the profit arrived as cash, with no big drop", "The profit is backed by cash."]],
  },
  "Free cash flow": {
    owl: [
      [n => n.level < 0, X, "Free cash flow is negative", "Nothing is left over to repay you."],
      [n => n.change < -2, W, "The margin fell more than 2 points", "Less is left over than last year."],
      [null, G, "Positive, and not much thinner", "Cash is left over after the bills."]],
    bull: [
      [n => n.level < 0 && !(n.capex_growth > 0), X, "Negative, and not because investment rose", "Burning cash without building anything."],
      [n => n.level < 0, W, "Negative while investment rose", "Spending the cash on growth. Watch that it pays off."],
      [n => n.change < -5, W, "The margin fell more than 5 points", "Much less is left over than last year."],
      [null, G, "Positive, and not much thinner", "The business pays for its own growth."]],
    bear: [
      [n => n.level < 0, X, "Free cash flow is negative", "It spends more than it brings in."],
      [n => n.change < -5, W, "The margin fell more than 5 points", "Much less is left over. Find out what moved."],
      [null, G, "Positive, and not much thinner", "Nothing here to question."]],
  },
  "What it owes": {
    owl: [
      [n => n.level > 75, X, "It owes more than 75% of what it owns", "Too many others are ahead of you in the queue."],
      [n => n.level > 60, W, "It owes 60% to 75% of what it owns", "Plenty of other lenders already."],
      [n => n.change > 2, W, "The share it owes rose more than 2 points", "Debt is building."],
      [null, G, "It owes under 60%, and that is not rising", "Room to repay you."]],
    bull: [
      [n => n.level > 90, X, "It owes more than 90% of what it owns", "Almost nothing left for the owners."],
      [n => n.change > 5, W, "The share it owes rose more than 5 points", "Borrowing fast. Is it buying growth?"],
      [null, G, "Debt is not jumping", "Borrowing to grow is fine."]],
    bear: [
      [n => n.change > 10, X, "The share it owes rose more than 10 points", "Debt is piling up fast."],
      [n => n.change > 5, W, "The share it owes rose 5 to 10 points", "Debt is building. What is it paying for?"],
      [n => n.level > 75, W, "It owes more than 75% of what it owns", "Little room for error."],
      [null, G, "Not rising fast, and under 75%", "Nothing here to question."]],
  },
  "Return on assets": {
    owl: [
      [n => n.level < 0, X, "The company made a loss", "A loss repays nobody."],
      [n => n.change < -2 * k(n), W, n => `It fell more than ${2 * k(n)} points`, "The assets are earning less than last year."],
      [null, G, "Positive, and not falling much", "The assets earn their keep."]],
    bull: [
      [n => n.level < 0, X, "The company made a loss", "The assets are losing money."],
      [n => n.change < -2 * k(n), X, n => `It fell more than ${2 * k(n)} points`, "Each dollar invested earns much less."],
      [n => n.change < -0.5 * k(n), W, n => `It fell ${0.5 * k(n)} to ${2 * k(n)} points`, "Each dollar invested earns a little less."],
      [null, G, "It held or rose", "The assets are earning as much or more."]],
    bear: [
      [n => n.level < 0, X, "The company made a loss", "The assets are losing money."],
      [n => n.change < -2 * k(n), X, n => `It fell more than ${2 * k(n)} points`, "A sharp fall in what the assets earn."],
      [n => n.change < -1 * k(n), W, n => `It fell ${1 * k(n)} to ${2 * k(n)} points`, "Slipping."],
      [n => n.change > 10 * k(n), W, n => `It jumped more than ${10 * k(n)} points`, "Too good. What changed?"],
      [null, G, "Steady", "Steady. Nothing odd."]],
  },
};

// The numbers in one sentence, the same for all three avatars. w picks accounting or plain words.
const one = x => Math.abs(x).toFixed(1);
const moved = x => x > 0 ? `up ${one(x)}%` : x < 0 ? `down ${one(x)}%` : "flat";
function facts(card, plain) {
  const n = card.nums, name = (plain && card.signal_plain) || card.signal;
  if (n.g !== undefined) return `Sales ${moved(n.s)}. ${name} ${moved(n.g)}.`;
  const what = (plain && card.caption_plain) || card.caption || name;
  const turn = n.change > 0 ? `up ${one(n.change)} points` : n.change < 0 ? `down ${one(n.change)} points` : "the same as last year";
  return `${what}: ${n.level.toFixed(1).replace("-", "−")}%, ${turn}.`;
}

// What one avatar makes of one card: the label, the reason, and its rule table with the row that applied.
function reading(card, rows) {
  const hit = rows.findIndex(([test]) => !test || test(card.nums));
  const [, tone, , why] = rows[hit];
  return { tone, name: TONE_NAME[tone], reason: `${facts(card, false)} ${why}`, plain: `${facts(card, true)} ${why}`,
    rule: { rows: rows.map(([, t, when]) => [typeof when === "function" ? when(card.nums) : when, TONE_NAME[t]]), hit } };
}

// All three avatars on one card: { owl, bull, bear }. Null when the card has no label to give
// (not found, doesn't apply, no growth rate).
export function avatarsFor(card) {
  const rules = RULES[card.signal];
  if (!rules || !card.nums || !card.tone) return null;
  return Object.fromEntries(Object.keys(AVATARS).map(a => [a, reading(card, rules[a])]));
}

// Just the three tones, for the test run and the tests.
export function readings(card) {
  const all = avatarsFor(card);
  return all && Object.fromEntries(Object.entries(all).map(([a, r]) => [a, r.tone]));
}

// For a whole company: one line per card, and whether the three agree.
export function readCompany(cards) {
  return cards.map(c => ({ signal: c.signal, house: c.tone, ...readings(c) })).filter(r => r.owl)
    .map(r => ({ ...r, agree: r.owl === r.bull && r.bull === r.bear }));
}
