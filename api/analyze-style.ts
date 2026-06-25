import type { VercelRequest, VercelResponse } from "@vercel/node";
import { analyzeStyleCore } from "./_lib/handlers";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.status(200).json(await analyzeStyleCore(req.body ?? {}));
}
