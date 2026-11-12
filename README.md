# Signal Cards

Read a company's annual report like an investor or a COO, one signal at a time.
Educational, not financial advice.

## Run step 1 (WD-40, Inventory)

1. Copy `.env.example` to `.env` and put your name and contact email in it. The SEC asks for this on every request.
2. `npm run fetch` pulls sales and inventory from the SEC and saves `data/WDFC.json`.
3. `npm start` then open http://localhost:3000.
