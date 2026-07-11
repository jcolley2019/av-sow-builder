// Local-dev API sidecar. `npm run dev` runs this (via tsx) alongside Vite, which
// proxies /api -> http://localhost:8787. The actual route LOGIC lives in
// ../api/_lib/handlers and is SHARED, unchanged, with the Vercel Serverless
// Functions in ../api/*.ts — so local dev and the deployed app behave identically.
import cors from "cors";
import express from "express";
import type { Request, Response } from "express";

import {
  analyzeStyleCore,
  dependencyCheckCore,
  extractBomCore,
  extractRemovalsCore,
  extractTextCore,
  generateRomCore,
  generateSowCore,
  mapLaborCore,
} from "../api/_lib/handlers.js";

const app = express();
const PORT = Number(process.env.API_PORT ?? 8787);

app.use(cors());
// JSON only (no multipart). Base64 payloads can be large; keep the 25mb limit
// for local dev. (Vercel's serverless platform caps request bodies at ~4.5mb.)
app.use(express.json({ limit: "25mb" }));

// Health check — proxied from the Vite dev server at /api/health.
app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

// Each route is a thin adapter: parse body -> shared core handler -> JSON.
// Every handler resolves to a 200 body (errors come back as { error, raw }).
app.post("/api/extract-bom", async (req: Request, res: Response) => {
  res.json(await extractBomCore(req.body ?? {}));
});

app.post("/api/extract-removals", async (req: Request, res: Response) => {
  res.json(await extractRemovalsCore(req.body ?? {}));
});

app.post("/api/dependency-check", async (req: Request, res: Response) => {
  res.json(await dependencyCheckCore(req.body ?? {}));
});

app.post("/api/map-labor", async (req: Request, res: Response) => {
  res.json(await mapLaborCore(req.body ?? {}));
});

app.post("/api/extract-text", async (req: Request, res: Response) => {
  res.json(await extractTextCore(req.body ?? {}));
});

app.post("/api/analyze-style", async (req: Request, res: Response) => {
  res.json(await analyzeStyleCore(req.body ?? {}));
});

app.post("/api/generate-sow", async (req: Request, res: Response) => {
  res.json(await generateSowCore(req.body ?? {}));
});

app.post("/api/generate-rom", async (req: Request, res: Response) => {
  res.json(await generateRomCore(req.body ?? {}));
});

app.listen(PORT, () => {
  console.log(`[api] SOW Generator sidecar listening on http://localhost:${PORT}`);
});
