// AVATAR (experiment, not in the app yet).
// Three analysts read the same card and may label it differently:
//   owl  = the lender:          "Just pay me back."
//   bull = the growth investor: "Think bigger."
//   bear = the sceptic:         "Prove it."
// These rulebooks are a simplification written for learning. They are not an industry standard,
// and a label is still a first screen, not a verdict. No numbers are typed in here: each rule reads
// the numbers the card already worked out from the filing (card.nums).
//
// Words used below:  s = sales growth %,  g = the item's growth %,  d = g − s (percentage points),
//                    level = this year's rate %,  change = this year's rate − last year's (points).

export const AVATARS = {
  owl:  { name: "The Owl",  role: "Lender",          says: "Just pay me back." },
  bull: { name: "The Bull", role: "Growth investor", says: "Think bigger." },
  bear: { name: "The Bear", role: "Sceptic",         says: "Prove it." },
};

const G = "good", W = "watch", X = "warn";

// The first test that fits, reading down, gives the tone.
const first = (...steps) => { for (const [fits, tone] of steps) if (fits) return tone; return G; };

const RULES = {
  // Stock on the shelves is cash the lender cannot reach. The bull lets stock build ahead of demand.
  // The bear distrusts a big gap either way: piling up, or running short.
  "Inventory": {
    owl:  ({ s, g }) => first([s <= 0 && g > 0, X], [g - s > 2, X], [g - s > 0, W]),
    bull: ({ s, g }) => s <= 0 ? (g > 0 ? X : W) : first([g - s > 25, X], [g - s > 10, W]),
    bear: ({ s, g }) => first([Math.abs(g - s) > 10, X], [Math.abs(g - s) > 5, W]),
  },
  // Unpaid invoices. The lender wants the cash in. The bull accepts them as the price of fast growth.
  // The bear asks whether sales were pulled forward.
  "Accounts receivable": {
    owl:  ({ s, g }) => first([s <= 0 && g > 0, X], [g - s > 2, X], [g - s > 0, W]),
    bull: ({ s, g }) => s <= 0 ? (g > 0 ? X : W) : first([g - s > 25, X], [g - s > 10, W]),
    bear: ({ s, g }) => first([g - s > 5, X], [g - s > 2, W], [g - s < -10, W]),
  },
  // Spending on buildings and equipment. The lender dislikes a big jump. The bull likes it rising.
  "Capital expenditure": {
    owl:  ({ s, g }) => first([g > 100, X], [g > 25 && g > s, W]),
    bull: ({ s, g }) => first([g < -25 && s > 0, X], [g <= 0, W]),
    bear: ({ g }) => first([g > 100, X], [g > 50, W], [g < -25, W]),
  },
  // Research. The lender barely minds. The bull wants it fed. The bear suspects a cut that flatters profit.
  "Research and development": {
    owl:  ({ s, g }) => first([g - s > 10, W]),
    bull: ({ s, g }) => first([g < 0, X], [g - s < -10, W]),
    bear: ({ s, g }) => first([g < 0 && s > 0, X], [Math.abs(g - s) > 10, W]),
  },
  // Gross margin. The lender wants it held. The bull wants it rising. The bear asks why it jumped.
  "Gross profit": {
    owl:  ({ change }) => first([change < -2, X], [change < -0.5, W]),
    bull: ({ change }) => first([change < -0.5, X], [change <= 0.5, W]),
    bear: ({ change }) => first([change < -0.5, X], [change > 5, W]),
  },
  // Overheads. The bull allows hiring ahead of sales. The bear doubts cuts that look too good.
  "SG&A": {
    owl:  ({ s, g }) => first([g - s > 5, X], [g - s > 0, W]),
    bull: ({ s, g }) => s <= 0 ? (g > 0 ? X : W) : first([g - s > 15, X], [g - s > 5, W]),
    bear: ({ s, g }) => first([g - s > 5, X], [g - s > 2, W], [g - s < -10, W]),
  },
  // Tax. Only the bear cares much: any real move, or a rate that looks too low to last.
  "Effective tax rate": {
    owl:  ({ change }) => first([change > 10, X], [change > 5, W]),
    bull: ({ change }) => first([change > 10, X], [change > 5, W]),
    bear: ({ level, change }) => first([Math.abs(change) > 2, X], [level < 15, W]),
  },
  // Did the profit arrive as cash? The lender is strict, the bull relaxed, the bear wary of swings.
  "Cash from profit": {
    owl:  ({ level }) => first([level < 80, X], [level < 100, W]),
    bull: ({ level }) => first([level < 50, X], [level < 80, W]),
    bear: ({ level, change }) => first([level < 80, X], [level < 100, W], [change < -20, W], [level > 150, W]),
  },
  // Cash left after spending. The bull forgives a negative number while investment is rising.
  "Free cash flow": {
    owl:  ({ level, change }) => first([level < 0, X], [change < -2, W]),
    bull: ({ level, change, capex_growth }) => first([level < 0 && !(capex_growth > 0), X], [level < 0, W], [change < -5, W]),
    bear: ({ level, change }) => first([level < 0, X], [Math.abs(change) > 5, W]),
  },
  // Debt. The lender judges the level. The bull only minds a jump. The bear minds any big move.
  "What it owes": {
    owl:  ({ level, change }) => first([level > 75, X], [level > 60, W], [change > 2, W]),
    bull: ({ level, change }) => first([level > 90, X], [change > 5, W]),
    bear: ({ level, change }) => first([change > 10, X], [Math.abs(change) > 5, W], [level > 75, W]),
  },
  // What the assets earn. "k" shrinks the cut-offs for banks, where one point is a big move.
  "Return on assets": {
    owl:  ({ level, change, steady: k = 1 }) => first([level < 0, X], [change < -2 * k, W]),
    bull: ({ level, change, steady: k = 1 }) => first([level < 0, X], [change < -2 * k, X], [change <= 0.5 * k, W]),
    bear: ({ level, change, steady: k = 1 }) => first([level < 0, X], [change < -2 * k, X], [change < -1 * k, W], [change > 10 * k, W]),
  },
};

// What each avatar says about one card: { owl, bull, bear }, each "good", "watch" or "warn".
// Null when the card has no label to give (not found, doesn't apply) or is one all three read alike.
export function readings(card) {
  const rules = RULES[card.signal];
  if (!rules || !card.nums || !card.tone) return null;
  return { owl: rules.owl(card.nums), bull: rules.bull(card.nums), bear: rules.bear(card.nums) };
}

// For a whole company: one line per card, and whether the three agree.
export function readCompany(cards) {
  return cards.map(c => ({ signal: c.signal, house: c.tone, ...readings(c) })).filter(r => r.owl)
    .map(r => ({ ...r, agree: r.owl === r.bull && r.bull === r.bear }));
}
