// Online version of /api/cards?ticker=AAPL. Vercel runs this file on request.
import { cardsFor } from "../sec.mjs";
import { reply } from "./_reply.js";

export default function handler(req, res) {
  return reply(res, () => cardsFor(req.query.ticker, process.env.SEC_USER_AGENT));
}
