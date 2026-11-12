// A tiny local web server, for running the app on your own computer. No packages needed.
// Online, Vercel does this job instead: it serves public/ and runs the two files in api/.
// It serves exactly four things: public/index.html, /api/cards?ticker=XXXX, /api/search?q=words and /api/fresh. Nothing else, so .env is never exposed.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { cardsFor, search, fresh, Friendly } from "./sec.mjs";

const PORT = process.env.PORT || 3000;
const json = (res, status, body) => { res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify(body)); };

createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/" || url.pathname === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(await readFile("public/index.html"));
  }
  if (["/api/cards", "/api/search", "/api/fresh"].includes(url.pathname)) {
    try {
      const UA = process.env.SEC_USER_AGENT;
      return json(res, 200, url.pathname === "/api/fresh" ? { fresh: await fresh(UA) }
        : url.pathname === "/api/search" ? { results: await search(url.searchParams.get("q"), UA) }
        : await cardsFor(url.searchParams.get("ticker"), UA));
    }
    catch (e) {
      if (e instanceof Friendly) return json(res, e.status, { error: e.message });
      console.error(e);
      return json(res, 500, { error: "Something went wrong building the cards. The Terminal window shows the details." });
    }
  }
  res.writeHead(404); res.end("Not found");
}).listen(PORT, () => console.log(`Open http://localhost:${PORT}`));
