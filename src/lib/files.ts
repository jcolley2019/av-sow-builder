import * as XLSX from "xlsx";

// File classification + preparation for the extraction endpoints.
// Spreadsheets are parsed client-side (SheetJS) into CSV text across ALL
// sheets; PDFs and images are read to base64 and sent as document/image.

export const SPREADSHEET_EXTS = ["xlsx", "xlsm", "xls", "csv"] as const;
export const PDF_EXTS = ["pdf"] as const;
export const IMAGE_EXTS = ["png", "jpg", "jpeg", "webp"] as const;

export type FileKind = "spreadsheet" | "pdf" | "image" | "unknown";

export function extOf(name: string): string {
  return (name.split(".").pop() ?? "").toLowerCase();
}

export function classifyFile(file: File): FileKind {
  const ext = extOf(file.name);
  if ((SPREADSHEET_EXTS as readonly string[]).includes(ext)) return "spreadsheet";
  if ((PDF_EXTS as readonly string[]).includes(ext)) return "pdf";
  if ((IMAGE_EXTS as readonly string[]).includes(ext)) return "image";
  // Fall back to MIME if the extension is missing/odd.
  if (file.type === "application/pdf") return "pdf";
  if (file.type.startsWith("image/")) return "image";
  if (
    file.type.includes("spreadsheet") ||
    file.type.includes("excel") ||
    file.type === "text/csv"
  ) {
    return "spreadsheet";
  }
  return "unknown";
}

/** react-dropzone `accept` maps. */
export const BOM_ACCEPT: Record<string, string[]> = {
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "application/vnd.ms-excel.sheet.macroEnabled.12": [".xlsm"],
  "application/vnd.ms-excel": [".xls"],
  "text/csv": [".csv"],
  "application/pdf": [".pdf"],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"],
};

export const DEMO_ACCEPT: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"],
};

// Example-SOW (style sample) inputs: Word, PDF, or plain text.
export const STYLE_ACCEPT: Record<string, string[]> = {
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.template": [".dotx"],
  "application/pdf": [".pdf"],
  "text/plain": [".txt"],
};

/** Read a File to raw base64 (no data: prefix). */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

/** Parse a spreadsheet (xlsx/xls/csv) into CSV text across ALL sheets. */
export async function spreadsheetToText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const parts: string[] = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const csv = XLSX.utils.sheet_to_csv(ws, { blankrows: false });
    if (csv.trim().length === 0) continue;
    parts.push(`# Sheet: ${sheetName}\n${csv}`);
  }
  return parts.join("\n\n");
}
