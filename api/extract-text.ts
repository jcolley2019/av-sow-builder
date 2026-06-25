import type { VercelRequest, VercelResponse } from "@vercel/node";
import { extractTextCore } from "./_lib/handlers";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.status(200).json(await extractTextCore(req.body ?? {}));
}
