import type { VercelRequest, VercelResponse } from "@vercel/node";
import { mapLaborCore } from "./_lib/handlers.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.status(200).json(await mapLaborCore(req.body ?? {}));
}
