// A tiny local web server. No packages needed.
// It serves exactly two things: index.html, and /api/cards?ticker=XXXX. Nothing else, so .env is never exposed.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { cardsFor, Friendly } from "./sec.mjs";

const PORT = process.env.PORT || 3000;
const json = (res, status, body) => { res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify(body)); };

createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/" || url.pathname === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(await readFile("index.html"));
  }
  if (url.pathname === "/api/cards") {
    try { return json(res, 200, await cardsFor(url.searchParams.get("ticker"), process.env.SEC_USER_AGENT)); }
    catch (e) {
      if (e instanceof Friendly) return json(res, e.status, { error: e.message });
      console.error(e);
      return json(res, 500, { error: "Something went wrong building the cards. The Terminal window shows the details." });
    }
  }
  res.writeHead(404); res.end("Not found");
}).listen(PORT, () => console.log(`Open http://localhost:${PORT}`));
