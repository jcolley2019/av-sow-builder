import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";

// Load environment variables from .env.local (ANTHROPIC_API_KEY=...).
dotenv.config({ path: ".env.local" });

/**
 * Default model for BOM extraction + draft SOW generation.
 * Final, polished SOW generation can switch to "claude-opus-4-8".
 */
export const MODEL = "claude-sonnet-4-6";

const apiKey = process.env.ANTHROPIC_API_KEY;

if (!apiKey) {
  // Don't throw at import time — the health route should still work without a key.
  // Routes that actually call Claude will surface a clear error instead.
  console.warn(
    "[claude] ANTHROPIC_API_KEY is not set. Add it to .env.local before calling /api/extract-bom or /api/generate-sow.",
  );
}

export const anthropic = new Anthropic({ apiKey: apiKey ?? "" });

export interface CallClaudeOptions {
  system?: string;
  messages: Anthropic.MessageParam[];
  model?: string;
  maxTokens?: number;
}

/**
 * Thin wrapper around the Messages API. Returns the full response message.
 */
export async function callClaude({
  system,
  messages,
  model = MODEL,
  maxTokens = 16000,
}: CallClaudeOptions): Promise<Anthropic.Message> {
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to .env.local at the project root.",
    );
  }

  return anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    ...(system ? { system } : {}),
    messages,
  });
}
