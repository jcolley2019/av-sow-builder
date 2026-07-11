import type { BomDoc, RemovalItem, RomDoc, SowDoc, StyleTheme } from "./types";
import {
  classifyFile,
  extOf,
  fileToBase64,
  spreadsheetToText,
} from "./files";

export type StyleMode = "house" | "match";
export type StyleAnalysis = { differs: boolean; summary: string };

// SOW.13 — site notes: optional, prose-only guidance sent with generation.
// It shapes how the SOW/ROM reads; it never changes scope (the BOM does that).
export type RoomNote = { room: string; note: string };
export type SowContext = {
  projectContext?: string;
  /** Per-room notes, each labeled with its location name. Empty notes omitted. */
  roomNotes?: RoomNote[];
};

export type DependencyFlag = {
  forItem: string;
  location: string | null;
  suggestion: string;
  candidate: string;
  reason: string;
};

// Request payloads (JSON; no multipart) and response shapes for the two
// extraction endpoints. Both endpoints return { error, raw } on failure.

export type BomRequest =
  // `roomName` is set only by the manual paste lane (per-room entry): it forces
  // a single named location and triggers system classification server-side. The
  // file/PDF/image dropzone never sets it, so those stay faithful mirrors.
  | { kind: "text"; filename?: string; text: string; roomName?: string }
  | { kind: "pdf"; filename?: string; mime?: string; dataB64: string }
  | { kind: "image"; filename?: string; mime?: string; dataB64: string };

export type RemovalsDrawing =
  | { kind: "pdf"; filename?: string; mime?: string; dataB64: string }
  | { kind: "image"; filename?: string; mime?: string; dataB64: string };

// Guided removals: optional free-text direction + selected systems + drawings.
// Any combination is valid (direction-only produces a user-described list).
export type RemovalsRequest = {
  description?: string;
  items?: string[];
  drawings?: RemovalsDrawing[];
};

export type BomExtract = Pick<
  BomDoc,
  "customer" | "projectName" | "projectNumber" | "locations"
>;

export type SowMeta = {
  customer: string | null;
  projectNumber: string | null;
  projectName: string | null;
  /** The integrator writing the SOW ("<Company> will provide and install…"). */
  company: string | null;
};

export type ExtractError = { error: string; raw?: string };

export function isError(x: unknown): x is ExtractError {
  return !!x && typeof x === "object" && "error" in x;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}${text ? `: ${text}` : ""}`);
  }
  return res.json() as Promise<T>;
}

// --- Build request payloads from raw input ---------------------------------

/** Build a BOM request from a dropped file (spreadsheet/pdf/image). */
export async function bomRequestFromFile(file: File): Promise<BomRequest> {
  const kind = classifyFile(file);
  if (kind === "spreadsheet") {
    return { kind: "text", filename: file.name, text: await spreadsheetToText(file) };
  }
  if (kind === "pdf") {
    return {
      kind: "pdf",
      filename: file.name,
      mime: file.type || "application/pdf",
      dataB64: await fileToBase64(file),
    };
  }
  if (kind === "image") {
    return {
      kind: "image",
      filename: file.name,
      mime: file.type || "image/png",
      dataB64: await fileToBase64(file),
    };
  }
  throw new Error(`Unsupported BOM file type: ${file.name}`);
}

/** Build a single removals drawing payload from a demo file (pdf/image only). */
export async function removalsDrawingFromFile(file: File): Promise<RemovalsDrawing> {
  const kind = classifyFile(file);
  if (kind === "pdf") {
    return {
      kind: "pdf",
      filename: file.name,
      mime: file.type || "application/pdf",
      dataB64: await fileToBase64(file),
    };
  }
  if (kind === "image") {
    return {
      kind: "image",
      filename: file.name,
      mime: file.type || "image/png",
      dataB64: await fileToBase64(file),
    };
  }
  throw new Error(`Demo drawings must be PDF or image: ${file.name}`);
}

// --- Endpoint calls --------------------------------------------------------

export function extractBom(
  body: BomRequest,
  company?: string,
): Promise<BomExtract | ExtractError> {
  // `company` is the integrator (from Settings). Sent so the model never
  // mistakes the preparer's own name on the letterhead for the customer.
  return postJson<BomExtract | ExtractError>(
    "/api/extract-bom",
    company ? { ...body, company } : body,
  );
}

export function extractRemovals(
  body: RemovalsRequest,
): Promise<{ removals: RemovalItem[] } | ExtractError> {
  return postJson<{ removals: RemovalItem[] } | ExtractError>(
    "/api/extract-removals",
    body,
  );
}

/** Generate the Scope of Work from the reviewed BomDoc + project metadata.
 *  Optionally match the voice/structure of a provided example SOW, and pass
 *  optional site notes (`context`) that guide the prose without changing scope. */
export function generateSow(
  bom: BomDoc,
  meta: SowMeta,
  opts?: { styleSample?: string; styleMode?: StyleMode; context?: SowContext },
): Promise<SowDoc | ExtractError> {
  const { context, ...style } = opts ?? {};
  return postJson<SowDoc | ExtractError>("/api/generate-sow", {
    bom,
    meta,
    ...style,
    context,
  });
}

// --- Match-a-Style (example SOW) -------------------------------------------

export type StyleExtract = { text: string; theme?: StyleTheme };

/** Extract plain text from an example SOW: .txt client-side, .docx/.dotx/.pdf
 *  server. A .dotx (Word template) is the same OOXML zip as .docx, so it is
 *  sent as kind "docx" and the server handles it unchanged. SC.6: .docx/.dotx
 *  also return the example's visual theme; PDFs and pasted text get none. */
export async function extractStyleText(file: File): Promise<StyleExtract> {
  let ext = extOf(file.name);
  if (ext === "dotx") ext = "docx";
  if (ext === "txt" || file.type === "text/plain") {
    return { text: (await file.text()).trim() };
  }
  if (ext === "docx" || ext === "pdf") {
    const res = await postJson<{ text: string; theme?: StyleTheme } | ExtractError>(
      "/api/extract-text",
      {
        kind: ext,
        filename: file.name,
        dataB64: await fileToBase64(file),
      },
    );
    if (isError(res)) throw new Error(res.error);
    return { text: (res.text ?? "").trim(), theme: res.theme };
  }
  // Best effort for unknown types: try reading as text.
  return { text: (await file.text()).trim() };
}

/** Summarize how an example's writing style compares to the house style. */
export function analyzeStyle(sample: string): Promise<StyleAnalysis | ExtractError> {
  return postJson<StyleAnalysis | ExtractError>("/api/analyze-style", { sample });
}

/** Generate a budgetary ROM scope summary from the same BomDoc + metadata.
 *  Optional site notes (`context`) guide the prose without changing scope. */
export function generateRom(
  bom: BomDoc,
  meta: SowMeta,
  context?: SowContext,
): Promise<RomDoc | ExtractError> {
  return postJson<RomDoc | ExtractError>("/api/generate-rom", { bom, meta, context });
}

/** Conservative AV dependency check (read-only): suggestions to confirm. */
export function dependencyCheck(
  bom: BomDoc,
): Promise<{ flags: DependencyFlag[] } | ExtractError> {
  return postJson<{ flags: DependencyFlag[] } | ExtractError>(
    "/api/dependency-check",
    { bom },
  );
}
