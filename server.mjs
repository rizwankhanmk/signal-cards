// A tiny local web server. No packages needed.
// It serves exactly two things: index.html, and data/<TICKER>.json. Nothing else, so .env is never exposed.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

const PORT = process.env.PORT || 3000;

createServer(async (req, res) => {
  const path = req.url.split("?")[0];
  let file, type;
  if (path === "/" || path === "/index.html") { file = "index.html"; type = "text/html; charset=utf-8"; }
  else if (/^\/data\/[A-Z0-9.-]{1,10}\.json$/.test(path)) { file = path.slice(1); type = "application/json"; }
  if (!file) { res.writeHead(404); return res.end("Not found"); }
  try {
    res.writeHead(200, { "Content-Type": type });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404); res.end("Not found");
  }
}).listen(PORT, () => console.log(`Open http://localhost:${PORT}`));
