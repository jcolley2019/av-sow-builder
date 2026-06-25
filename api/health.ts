import type { VercelRequest, VercelResponse } from "@vercel/node";

// Health check — mirrors the local sidecar's GET /api/health.
export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({ ok: true });
}
