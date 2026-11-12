// Shared by the two online endpoints: run the work, send JSON, turn known problems into clear messages.
import { Friendly } from "../sec.mjs";

export async function reply(res, work) {
  try {
    const body = await work();
    // Let Vercel's network keep a good answer for a day, so the SEC is asked once per company per day.
    res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
    res.status(200).json(body);
  } catch (e) {
    if (e instanceof Friendly) return res.status(e.status).json({ error: e.message });
    console.error(e);
    res.status(500).json({ error: "Something went wrong building the cards. Try again in a minute." });
  }
}
