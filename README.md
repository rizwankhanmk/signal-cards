# Signal Cards

Read a company's annual report like an investor or a COO, one signal at a time.
Educational, not financial advice.

## Run it (any US ticker)

1. Copy `.env.example` to `.env` and put your name and contact email in it. The SEC asks for this on every request.
2. `npm start`, open http://localhost:3000, type a company name or a ticker and pick from the list.
3. Or in the Terminal: `npm run fetch AAPL COST JPM` prints the eight cards for each company, plus a checklist of the numbers to verify in its 10-K. With no ticker it fetches WD-40 (WDFC).

The eight signals: Inventory, Accounts receivable, Capital expenditure, Research and development,
Gross profit, SG&A, Effective tax rate, Labour force.

How it works:
- `sec.mjs` finds the company in the SEC's ticker list, pulls its numbers and saves them in `data/` for a day.
- `signals.mjs` turns those numbers into cards. No numbers are typed in anywhere.
- Numbers show in USD millions when every figure is a whole million, otherwise in USD thousands, to match the 10-K.
- Only companies that file a 10-K are covered. Foreign companies listed in the US file a different form.

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
- Guesses and ticks are remembered in your browser only, per company and fiscal year.
- Accounting / Plain English: one switch swaps the wording everywhere ("Accounts receivable" becomes "Unpaid customer bills").
  Both wordings are written in `signals.mjs`.
- Investor / COO: same cards, different last line. The investor's line says what to check in the filing;
  the COO's says what to ask inside the business. Neither is buy or sell advice. The lines are in `NEXT` in `signals.mjs`.
- Compare: under the tiles, "Compare with" puts a second company beside the first, signal by signal.
  It says so if their years end on different dates, and "Not comparable" if they follow different accounting rules.
- Voice: short sentences, the numbers first, then one blunt line. Facts only, never buy or sell advice.
  The lines live next to the label rules in `signals.mjs`.

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

### When there is no label

- **Doesn't apply**: the signal does not fit the company. Banks, insurers and other financial companies
  (SEC industry codes 6000 to 6799) get this for Inventory, Accounts receivable and Gross profit.
  The Effective tax rate card says it when pre-tax profit was zero or a loss.
- **Not found**: the SEC data has no figure for one of the two years. Missing does not mean zero.
- **No label**: last year's figure was zero, so there is no growth rate.
