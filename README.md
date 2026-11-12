# Signal Cards

Read a company's annual report like an investor or a COO, one signal at a time.
Educational, not financial advice.

## Run step 1 (WD-40, Inventory)

1. Copy `.env.example` to `.env` and put your name and contact email in it. The SEC asks for this on every request.
2. `npm run fetch` pulls sales and inventory from the SEC and saves `data/WDFC.json`.
3. `npm start` then open http://localhost:3000.

## Label rules (Inventory, Receivables, SG&A)

A label is a first screen, not a verdict. The question is always: did the item grow faster or slower than sales?

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
"Points" means percentage points. Flat (exactly 0.0%) counts as up for sales and as down for the item.
