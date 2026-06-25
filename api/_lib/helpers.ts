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
  if (start !== -1 && end !== -1 && end > start) {
    return t.slice(start, end + 1);
  }
  return t;
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
