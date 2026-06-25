import type { VercelRequest, VercelResponse } from "@vercel/node";
import { generateRomCore } from "./_lib/handlers";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.status(200).json(await generateRomCore(req.body ?? {}));
}
