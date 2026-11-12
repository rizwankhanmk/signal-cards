// Online version of /api/search?q=cost. Vercel runs this file on request.
import { search } from "../sec.mjs";
import { reply } from "./_reply.js";

export default function handler(req, res) {
  return reply(res, async () => ({ results: await search(req.query.q, process.env.SEC_USER_AGENT) }));
}
