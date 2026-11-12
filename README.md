# Signal Cards

Read a company's annual report like an investor or a COO, one signal at a time.
Educational, not financial advice.

## Run it (WD-40, all eight signals)

1. Copy `.env.example` to `.env` and put your name and contact email in it. The SEC asks for this on every request.
2. `npm run fetch` pulls the numbers from the SEC, prints the eight cards and a checklist, and saves `data/WDFC.json`.
3. `npm start` then open http://localhost:3000.

The eight signals: Inventory, Accounts receivable, Capital expenditure, Research and development,
Gross profit, SG&A, Effective tax rate, Labour force.

## Label rules

A label is a first screen, not a verdict. "Points" means percentage points.
Flat (exactly 0.0%) counts as up for sales.

### Inventory, Accounts receivable, SG&A, Labour force

The question: did the item grow faster or slower than sales?

| Sales | Item | Label |
| --- | --- | --- |
| Up | Down or flat | Most favourable |
| Up | Up, slower than sales | Good |
| Up | Up, as fast as sales or faster | Warning |
| Down | Up or flat | Risk rising |
| Down | Down, within 5 points of sales | Neutral / watch |
| Down | Down, more than 5 points faster than sales | Good |
| Down | Down, more than 5 points slower than sales | Warning |

The last two rows are not in the original brief. They follow the same logic as the "Up" rows.
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

- **Not found**: the SEC data has no figure for one of the two years. Missing does not mean zero.
- **No label**: last year's figure was zero, so there is no growth rate.
