# Signal Cards

Read a company's annual report like an investor or a CFO, one signal at a time.
Educational, not financial advice.

## Run it (any US ticker)

1. Copy `.env.example` to `.env` and put your name and contact email in it. The SEC asks for this on every request.
2. `npm start`, open http://localhost:3000, type a company name or a ticker and pick from the list.
3. Or in the Terminal: `npm run fetch AAPL COST JPM` prints the twelve cards for each company, plus a checklist of the numbers to verify in its 10-K. With no ticker it fetches WD-40 (WDFC).

The eight signals: Inventory, Accounts receivable, Capital expenditure, Research and development,
Gross profit, SG&A, Effective tax rate, Labour force.

Four more cards cover what the eight signals leave out, cash and debt: Cash from profit, Free cash flow,
What it owes, Return on assets. The cards that compare an item with sales also show the ratio an analyst
would quote, such as days of inventory or SG&A as a share of sales.

How it works:
- `sec.mjs` finds the company in the SEC's ticker list, pulls its numbers and saves them in `data/` for a day.
- `signals.mjs` turns those numbers into cards. No numbers are typed in anywhere.
- Numbers show in USD millions when every figure is a whole million, otherwise in USD thousands, to match the 10-K.
- Only companies that file a 10-K are covered. Companies based outside the US file a 20-F or 40-F under
  different rules; the app says so plainly when you pick one.

## Put it online (Vercel)

The app runs on Vercel with no build step: Vercel serves `public/` and runs the two files in `api/`.

1. In Vercel, import this GitHub repository. Framework preset: Other. Leave the build settings empty.
2. Add one environment variable, `SEC_USER_AGENT`, with the same value as in your `.env`
   (a name and a contact email). It is set in Vercel, never committed.
   Tick all three environments: Production, Preview and Development. A preview link only gets the
   variable if Preview is ticked, and the main site only gets it if Production is.
3. Deploy. Vercel redeploys on every push to `main`. A changed variable only takes effect on the
   next deployment, so redeploy (or push) after adding it.

If the page says "Missing SEC_USER_AGENT", the variable is not set for that environment, or the site
has not been redeployed since it was added.

Online, each company's answer is kept by Vercel's network for a day, so the SEC is asked about once per
company per day. `local-server.mjs` is only for running the app on your own computer.

## Look and voice

- Calm layout: one idea per screen, one big number, lots of white space. Greys `#1d1d1f`, `#6e6e73`, `#f5f5f7`. Inter font.
- The home screen headline changes with the day of the week. The seven lines are in `MOTTOS` in `public/index.html`.
- Light and dark: follows your computer's setting; the button in the top corner overrides it.
- Type a ticker, see the company and fiscal year, then eight tiles. Tap a tile to open that card on its own screen.
  Arrow keys move between cards, Esc goes back to the eight.
- A small mark sits beside each label: hollow for good, half for watch, filled for warning. Each also has a
  quiet colour (green, amber, red), and a revealed tile carries a faint tint of it. The shape still tells them apart without colour.
- Search also knows well-known brands: "Google" finds Alphabet, "Facebook" finds Meta. The list is `ALSO_KNOWN_AS` in `sec.mjs`.
- Each card has one plain line on what the signal is, and a table of the last few years. Each trend row
  compares a year with the year before by the same rules. The label itself still comes from the latest two years.
- Company names from the SEC are tidied ("COSTCO WHOLESALE CORP /NEW" becomes "Costco Wholesale Corp").
  That is a best guess; names it gets wrong are fixed by hand in `BY_HAND` in `sec.mjs`.
- Catch the flag: tiles start face down, showing only the two numbers. Tap one, guess Good, Watch or Warning,
  and it flips. "Reveal all" flips the rest without scoring; "Play again" turns them back over.
- Draft: every card is Draft until you tick "I checked these numbers in the filing myself". Then it says Checked.
  The tiles screen shows a tick on each checked card and one line under the tiles: "Draft. 2 of 11 cards checked".
- Guesses last for one sitting: the cards are face down again when you close the tab or a new day starts.
  Ticks and the two switches are remembered in your browser for good, per company and fiscal year.
- Accounting / Plain English: one switch swaps the wording everywhere ("Accounts receivable" becomes "Unpaid customer bills").
  Both wordings are written in `signals.mjs`.
- Investor / CFO: same cards, different last line. The investor's line says what to check in the filing;
  the CFO's says what to ask inside the business. Neither is buy or sell advice. The lines are in `NEXT` in `signals.mjs`.
- Compare: under the tiles, "Compare with" puts a second company beside the first, signal by signal.
  It says so if their years end on different dates, and "Not comparable" if they follow different accounting rules.
- Checking a number: on a card, tap any number from the filing and the 10-K opens scrolled to that number,
  highlighted. It finds the first place the number appears, so check the row name beside it.
- On a phone, swipe left or right on a card to move to the next or previous one. A hint at the top of the card
  says so until you have swiped once.
- The home screen suggests three companies and has a Shuffle button for three more. It opens with the three
  big companies whose annual report landed most recently ("Just filed"); Shuffle draws from those plus a few
  steady examples. The fresh list covers the hundred or so biggest companies on the SEC's list and is worked
  out at most twice a day (`fresh` in `sec.mjs`).
- Home is always one tap away once a company is open, and All eight (or Compare) is one tap away from any card.
  On a phone they are icons in a bar at the bottom, under your thumb, and bounce when pressed. On a computer they
  are buttons in the top bar, which stays in view as you scroll.
- On a phone the bottom bar has Previous in the left corner and Next in the right on every card, greyed out
  at either end. On a computer a "Next" button sits under each revealed card. When every card is flipped, the
  app suggests three more companies.
- The first time someone opens the home screen, three short screens explain the app. "How it works" on the
  home screen and in Settings shows them again.
- Settings sit behind one button in the top bar: wording, which reader's line to show, and appearance (auto,
  light, dark). The sun or moon beside it switches light and dark in one tap.
- The home screen lists the last few companies you opened, under "Recent". Once there is a Recent list it
  stands in place of the suggestions; "Something new" brings them back.
- On a company's screen the search box is empty and says "Search another company".
- While a company loads, grey placeholder tiles stand where the cards will be.
- Compare is a button under the company's name. It opens a box to pick the second company. The comparison is one
  short row per card: each company's number and label side by side. Tap a side to open that card.
- A revealed card shows the label, the line and the reader's line. The proof is folded into rows you tap to
  open: The numbers, What an analyst would quote, The last few years, and How this label is decided (the rule
  table with the row that applied marked). The rows you open stay open on the next card.
- Dots at the top of a card show where you are; each takes its colour once its card is revealed. Tap one to jump.
- A card with nothing to show ("Not found", "Doesn't apply") gets no tile and is skipped by Next and Previous.
  Each group of tiles ends with a quiet line naming them, and each name opens its reason.
- After the last card, Next goes to an end screen: your score for the company, what the cards said, and three
  more companies to read.
- Moving on from the last of the eight signals stops at a checkpoint: your score for the group, what the
  revealed cards said, and a choice to go on to Cash and debt or back to all cards. Going backwards, or tapping
  a tile directly, skips it.
- It can be added to a phone's home screen as an app: `public/` holds the icon (`icon.svg` and PNG sizes made
  from it), a web manifest and a link-preview image. The icon is a bull peeking over a signal card with the
  three marks. It is an original drawing. A phone keeps the old icon until the app is removed from the home
  screen and added again.
- Tapping the name swaps its words, "Signal Cards" to "Card Signals" and back, and takes you home.
- On a phone the numbers table stacks: the item and its two years on one line, the formula below, the source
  under that, so nothing scrolls sideways. A line above it gives the unit as printed in the filing.
- The big number carries a caption saying what it is ("Inventory growth"). After a missed guess, a box shows
  the rule row that decided the label.
- Your best first-try score for each company is kept in this browser and shown on the tiles screen, the end
  screen and the Recent list. "Retry the ones you missed" turns only those cards face down again; retries do
  not change the best score.
- Keyboard and screen readers: a "Skip to the content" link, a heading on every card, the answer read out
  after a guess, and 1, 2, 3 to guess Good, Watch, Warning (arrows still move between cards).
- Offline: `public/sw.js` keeps the page and the last 30 companies you read. The network always comes first;
  the saved copy is used only when there is no connection, and the page says so.
- Voice: short sentences, the numbers first, then one blunt line. Facts only, never buy or sell advice.
  The lines live next to the label rules in `signals.mjs`.

## Avatar (experiment, on the `avatar` branch only)

You read every card as one of three analysts: the Owl (a lender), the Bull (a growth investor) or the Bear
(a sceptic). Each has its own rulebook in `avatars.mjs`, so the same numbers can earn different labels. You
pick one on the home screen and can switch from the top bar; guesses and best scores are kept per analyst.
After a reveal the card shows what the other two said. The rulebooks are a simplification for learning,
not an industry standard, and nothing in them is advice. `npm run avatars` prints, for real companies,
where the three agree and where they split.

## Tests

`npm test` runs `test/cards.test.mjs`: every row of the label rules below, the formulas, units, restated
figures, the inventory fallback, the trend table and the number links. It needs no network and no `.env`.
Every number in the tests is made up.

## Label rules

A label is a first screen, not a verdict. "Points" means percentage points.
Flat (exactly 0.0%) counts as up for sales.

### Inventory, Accounts receivable, SG&A, Labour force

The question: did the item grow faster or slower than sales?

| Sales | Item | Label |
| --- | --- | --- |
| Up | Down or flat | Most favourable |
| Up | Up, within 2 points of sales | Neutral / watch (keeping pace) |
| Up | Up, more than 2 points slower than sales | Good |
| Up | Up, more than 2 points faster than sales | Warning |
| Down | Up or flat | Risk rising |
| Down | Down, within 5 points of sales | Neutral / watch |
| Down | Down, more than 5 points faster than sales | Good |
| Down | Down, more than 5 points slower than sales | Warning |

The "keeping pace" row and the last two rows are not in the original brief. Keeping pace stops a
0.1 point difference from flipping Good to Warning. The last two follow the same logic as the "Up" rows.
Labour force shows "Not found" for now: headcount is in the 10-K text, not in the SEC's number feed.

### Research and development, Capital expenditure

Spending more is not bad in itself. The warning is for cutting investment while sales grow.

| Sales | Item | Label |
| --- | --- | --- |
| Up | Up or flat, no more than double the sales rate | Good |
| Up | Up, more than double the sales rate | Neutral / watch (a big bet: check on what) |
| Up | Down | Warning |
| Down | Up, down or flat | Neutral / watch |

### Gross profit

Gross margin = gross profit ÷ sales × 100, where gross profit = sales − cost of sales.
The label looks at the change in margin from last year.

| Margin change | Sales | Label |
| --- | --- | --- |
| Up more than 0.5 points | Up | Most favourable |
| Up more than 0.5 points | Down | Good |
| Within 0.5 points | Either | Neutral / watch |
| Down more than 0.5 points | Up | Warning |
| Down more than 0.5 points | Down | Risk rising |

### Effective tax rate

Effective tax rate = income tax ÷ pre-tax profit × 100. The label looks at the change from last year.

| Change | Label |
| --- | --- |
| Within 2 points | Good (steady) |
| Down more than 2 points | Neutral / watch (a lift that may not repeat) |
| Up more than 2 points | Warning |
| Pre-tax profit zero or a loss in either year | Doesn't apply |

### Cash and debt

These four are not in the original brief. Their thresholds are judgement calls.

| Card | What is measured | Label |
| --- | --- | --- |
| Cash from profit | Cash from operations ÷ net income × 100 | 100 or more: Good. 80 to under 100: Neutral / watch. Under 80: Warning. A loss in either year: Doesn't apply |
| Free cash flow | (Cash from operations − capital expenditure) ÷ sales × 100 | Zero or below: Warning. Positive but more than 2 points lower than last year: Neutral / watch. Otherwise: Good |
| What it owes | (Total assets − total equity) ÷ total assets × 100 | Down more than 2 points: Good. Within 2 points: Neutral / watch. Up more than 2 points, or 100 and over: Warning |
| Return on assets | Net income ÷ total assets × 100 | Up more than 1 point: Good. Within 1 point: Neutral / watch. Down more than 1 point, or a loss: Warning |

Banks and insurers get "Doesn't apply" for the first three. For Return on assets they use a finer threshold
of 0.2 points, because a bank earns about $1 for every $100 of assets.
"What it owes" counts every liability, not only loans. It is assets minus equity, so it always adds up.

### The ratio an analyst would quote

Shown under the numbers on five cards. They use year-end balances as printed, not averages.

| Card | Ratio | Formula |
| --- | --- | --- |
| Inventory | Days of inventory | Inventory ÷ cost of sales × 365 |
| Accounts receivable | Days to collect | Receivables ÷ sales × 365 |
| Capital expenditure | Capex as a share of sales, and capex against depreciation | Capex ÷ sales × 100; capex ÷ depreciation |
| Research and development | R&D as a share of sales | R&D ÷ sales × 100 |
| SG&A | SG&A as a share of sales | SG&A ÷ sales × 100 |

### When there is no label

- **Doesn't apply**: the signal does not fit the company. Banks, insurers and other financial companies
  (SEC industry codes 6000 to 6799) get this for Inventory, Accounts receivable and Gross profit.
  The Effective tax rate card says it when pre-tax profit was zero or a loss.
- **Not found**: the SEC data has no figure for one of the two years. Missing does not mean zero.
- **No label**: last year's figure was zero, so there is no growth rate.
