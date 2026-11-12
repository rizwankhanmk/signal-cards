// Online version of /api/fresh: big companies whose annual report landed most recently.
import { fresh } from "../sec.mjs";
import { reply } from "./_reply.js";

export default function handler(req, res) {
  return reply(res, async () => ({ fresh: await fresh(process.env.SEC_USER_AGENT) }));
}
