import Anthropic from "@anthropic-ai/sdk";
import PizZip from "pizzip";

// Extract plain body text from a .docx buffer (word/document.xml only).
export function docxBufferToText(buf: Buffer): string {
  const zip = new PizZip(buf);
  const entry = zip.file("word/document.xml");
  if (!entry) return "";
  let xml = entry.asText();
  xml = xml
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:br\s*\/?>/g, "\n")
    .replace(/<w:tab\s*\/?>/g, "\t");
  let text = xml.replace(/<[^>]+>/g, "");
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x?[0-9a-fA-F]+;/g, " ");
  return text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ImageMediaType = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

/** Best-effort image media type from an explicit mime or a filename. */
export function imageMediaType(mime?: string, filename?: string): ImageMediaType {
  const m = (mime ?? "").toLowerCase();
  if (m === "image/png" || m === "image/jpeg" || m === "image/webp" || m === "image/gif") {
    return m;
  }
  const ext = (filename ?? "").toLowerCase().split(".").pop() ?? "";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/jpeg"; // jpg/jpeg and unknown -> jpeg
}

export type ContentBlock = Anthropic.ContentBlockParam;

/** Extract the text layer from a base64-encoded PDF. */
export async function pdfToText(dataB64: string): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const bytes = new Uint8Array(Buffer.from(dataB64, "base64"));
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

// If body is a PDF with a real text layer, convert it to the fast text path.
// Scanned/image-only PDFs (little/no text) and any extraction error fall back
// to the existing vision `document` path unchanged.
export async function maybeExtractPdfText<
  T extends { kind?: string; text?: string; dataB64?: string },
>(body: T): Promise<T> {
  if (body?.kind !== "pdf" || !body.dataB64) return body;
  try {
    const text = await pdfToText(body.dataB64);
    if (text.replace(/\s/g, "").length >= 200) {
      return { ...body, kind: "text", text, dataB64: undefined };
    }
  } catch {
    // keep the vision fallback on any extraction failure
  }
  return body;
}

/** Build the user content block(s) for a request body, led by a shape hint. */
export function buildContent(
  body: {
    kind?: string;
    text?: string;
    dataB64?: string;
    mime?: string;
    filename?: string;
  },
  shape: string,
): ContentBlock[] {
  const { kind, text, dataB64, mime, filename } = body;
  const hint: ContentBlock = { type: "text", text: shape };

  if (kind === "text") {
    return [hint, { type: "text", text: text ?? "" }];
  }
  if (kind === "pdf") {
    return [
      hint,
      {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: dataB64 ?? "" },
      },
    ];
  }
  if (kind === "image") {
    return [
      hint,
      {
        type: "image",
        source: {
          type: "base64",
          media_type: imageMediaType(mime, filename),
          data: dataB64 ?? "",
        },
      },
    ];
  }
  throw new Error(`Unsupported kind: ${String(kind)}`);
}

/** Concatenate all text blocks from a Claude response. */
export function responseText(msg: Anthropic.Message): string {
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

/**
 * Parse a model response expected to contain JSON, with diagnostics.
 *
 * The naked failure mode is a cryptic "Expected ',' or ']' after array element
 * in JSON at position N" — which looks like a code bug. This distinguishes the
 * two real causes and logs the deciding signal (stop_reason + output token
 * count) so we never guess again:
 *
 *  - stop_reason "max_tokens"  → genuine output-cap truncation (a bigger cap is
 *                                the right lever).
 *  - any other stop_reason,
 *    unbalanced braces         → the model stalled and stopped mid-structure
 *                                (runaway/stall, not a length cap) — retry.
 *  - any other stop_reason     → the model believes it finished but emitted
 *                                malformed/oversized JSON (runaway repetition,
 *                                phantom rows, or a bloated input). A bigger cap
 *                                does nothing here — look at the raw output.
 *
 * Call AFTER capturing responseText so the partial/raw output is still returned
 * to the client as `raw` (the "Show raw model output" toggle).
 */
export function parseModelJson(
  msg: Anthropic.Message,
  raw: string,
  shape: "object" | "array",
): unknown {
  const outTokens = msg.usage?.output_tokens;
  const sig = `stop_reason=${msg.stop_reason} output_tokens=${outTokens ?? "?"} chars=${raw.length}`;

  if (msg.stop_reason === "max_tokens") {
    console.warn(`[extract] response truncated at output cap — ${sig}`);
    throw new Error(
      "The model's response was cut off at the output-token limit, so the " +
        "result is incomplete. The input is likely too large to process in one " +
        "pass — split it into smaller parts (e.g. by room or section), or remove " +
        "rows that aren't AV/UC equipment, then run it again.",
    );
  }

  const cleaned = extractJsonText(raw, shape);
  try {
    return JSON.parse(cleaned);
  } catch {
    if (isUnbalancedJson(cleaned)) {
      console.warn(`[extract] model output is incomplete JSON — ${sig}`);
      throw new Error(
        `The model stopped before completing the JSON (${sig} — the output is ` +
          `unbalanced and ends mid-structure). This is a model runaway/stall, ` +
          `not a parsing bug. Retry the generation; if it recurs with a large ` +
          `style example, the example may be crowding the output — trim it.`,
      );
    }
    console.warn(`[extract] model output is not valid JSON — ${sig}`);
    throw new Error(
      `The model returned text that isn't valid JSON (${sig}). It finished on ` +
        `its own rather than hitting the token limit, so this is a malformed or ` +
        `runaway output, not a length cap — the full output is shown below. If ` +
        `it repeats rows or includes content from sheets other than the BOM, the ` +
        `cause is the input/prompt, not max_tokens.`,
    );
  }
}

// Models sometimes emit literal control characters (raw newlines/tabs) inside
// JSON string values, which JSON.parse rejects. Walk the text tracking whether
// we're inside a string (respecting backslash escapes); inside a string,
// replace each char < 0x20 with its JSON escape. Outside strings, untouched.
function escapeControlCharsInStrings(t: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (const ch of t) {
    if (!inString) {
      if (ch === '"') inString = true;
      out += ch;
      continue;
    }
    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      out += ch;
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = false;
      out += ch;
      continue;
    }
    const code = ch.charCodeAt(0);
    if (code < 0x20) {
      if (ch === "\n") out += "\\n";
      else if (ch === "\r") out += "\\r";
      else if (ch === "\t") out += "\\t";
      else out += "\\u" + code.toString(16).padStart(4, "0");
      continue;
    }
    out += ch;
  }
  return out;
}

// True when braces/brackets don't balance (or a string never closes) — the
// signature of output that stopped mid-structure rather than merely containing
// a bad character. Uses the same in-string walk so structural chars inside
// string values don't count.
function isUnbalancedJson(t: string): boolean {
  let inString = false;
  let escaped = false;
  let curly = 0;
  let square = 0;
  for (const ch of t) {
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") curly++;
    else if (ch === "}") curly--;
    else if (ch === "[") square++;
    else if (ch === "]") square--;
  }
  return curly !== 0 || square !== 0 || inString;
}

/** Strip ``` fences and isolate the first JSON object/array if surrounded by prose. */
export function extractJsonText(raw: string, shape: "object" | "array"): string {
  let t = raw.trim();
  const fenced = t.match(/^```[a-zA-Z]*\s*([\s\S]*?)\s*```$/);
  if (fenced) t = fenced[1].trim();

  // If it already parses, keep as-is.
  try {
    JSON.parse(t);
    return t;
  } catch {
    /* fall through to boundary extraction */
  }

  const open = shape === "object" ? "{" : "[";
  const close = shape === "object" ? "}" : "]";
  const start = t.indexOf(open);
  const end = t.lastIndexOf(close);
  let candidate = t;
  if (start !== -1 && end !== -1 && end > start) {
    candidate = t.slice(start, end + 1);
  }

  // Second chance: literal control chars inside string values are the most
  // common reason otherwise-complete model JSON fails to parse.
  try {
    JSON.parse(candidate);
  } catch {
    const sanitized = escapeControlCharsInStrings(candidate);
    try {
      JSON.parse(sanitized);
      return sanitized;
    } catch {
      /* still broken — return the unsanitized candidate for diagnostics */
    }
  }
  return candidate;
}

/** Normalize a possibly-wrapped array (model may return {flags:[...]} etc.). */
export function coerceArray(parsed: unknown): unknown {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") {
    for (const v of Object.values(parsed as Record<string, unknown>)) {
      if (Array.isArray(v)) return v;
    }
  }
  return [];
}

/** Some models wrap the removals array in an object — normalize to an array. */
export function coerceRemovalsArray(parsed: unknown): unknown {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    for (const key of ["removals", "items", "equipment", "data"]) {
      if (Array.isArray(obj[key])) return obj[key];
    }
  }
  return [];
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export type RemovalsDrawing = {
  kind?: string;
  dataB64?: string;
  mime?: string;
  filename?: string;
};

/** The user's removal direction (selected systems + free text) as a guide block. */
export function removalsGuide(description?: string, items?: string[]): string {
  const lines: string[] = [];
  if (Array.isArray(items) && items.length > 0) {
    lines.push(`Systems the user selected for removal: ${items.join("; ")}.`);
  }
  if (description && description.trim()) {
    lines.push(`User description of what to remove: ${description.trim()}`);
  }
  if (lines.length === 0) {
    return "REMOVAL DIRECTION: none given. Extract only equipment the drawings explicitly call out for removal / demolition / decommission.";
  }
  return `REMOVAL DIRECTION (the guide for what to look for):\n${lines.join("\n")}`;
}
