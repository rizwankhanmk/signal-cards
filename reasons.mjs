// Reasons for each card, read from the annual report by Google's Gemini. Runs on your own computer.
//   npm run reasons -- --models     -> list the Gemini models your key can use (step one)
// The key lives in .env as GEMINI_API_KEY. It is never committed and never printed.
// More commands arrive in later steps; this file starts with the one check that proves the key works.

const KEY = process.env.GEMINI_API_KEY;
if (!KEY) {
  console.log("No GEMINI_API_KEY found in .env. Add a line that starts GEMINI_API_KEY= followed by your key, save, and run this again.");
  process.exit(1);
}
const API = "https://generativelanguage.googleapis.com/v1beta";

async function gemini(path, body) {
  const r = await fetch(`${API}/${path}`, {
    method: body ? "POST" : "GET",
    headers: { "x-goog-api-key": KEY, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  if (!r.ok) {
    // Show Google's own message, which says what is wrong, but never the key.
    const why = json?.error?.message ?? text.slice(0, 300);
    throw new Error(`Google answered ${r.status}: ${why}`.replaceAll(KEY, "[key]"));
  }
  return json;
}

if (process.argv.includes("--models")) {
  try {
    const all = [];
    let page = "";
    do {
      const d = await gemini(`models?pageSize=200${page ? `&pageToken=${encodeURIComponent(page)}` : ""}`);
      all.push(...(d.models ?? [])); page = d.nextPageToken ?? "";
    } while (page);
    const usable = all.filter(m => (m.supportedGenerationMethods ?? []).includes("generateContent"));
    console.log(`\nYour key works. It can use ${usable.length} models that write text:\n`);
    console.log(`   ${"Model".padEnd(44)}${"Reads up to".padEnd(16)}Writes up to`);
    for (const m of usable) console.log(`   ${String(m.name).replace(/^models\//, "").padEnd(44)}${`${(m.inputTokenLimit ?? 0).toLocaleString("en-US")} tokens`.padEnd(16)}${(m.outputTokenLimit ?? 0).toLocaleString("en-US")} tokens`);
    console.log("\nPaste this list back.");
  } catch (e) { console.log(`\n${e.message}\n`); process.exit(1); }
} else {
  console.log("For now this command has one job. Run:  npm run reasons -- --models");
}
