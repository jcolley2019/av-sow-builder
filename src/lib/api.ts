import type { BomDoc, RemovalItem, SowDoc } from "./types";
import {
  classifyFile,
  fileToBase64,
  spreadsheetToText,
} from "./files";

// Request payloads (JSON; no multipart) and response shapes for the two
// extraction endpoints. Both endpoints return { error, raw } on failure.

export type BomRequest =
  | { kind: "text"; filename?: string; text: string }
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

export function extractBom(body: BomRequest): Promise<BomExtract | ExtractError> {
  return postJson<BomExtract | ExtractError>("/api/extract-bom", body);
}

export function extractRemovals(
  body: RemovalsRequest,
): Promise<{ removals: RemovalItem[] } | ExtractError> {
  return postJson<{ removals: RemovalItem[] } | ExtractError>(
    "/api/extract-removals",
    body,
  );
}

/** Generate the Scope of Work from the reviewed BomDoc + project metadata. */
export function generateSow(
  bom: BomDoc,
  meta: SowMeta,
): Promise<SowDoc | ExtractError> {
  return postJson<SowDoc | ExtractError>("/api/generate-sow", { bom, meta });
}
