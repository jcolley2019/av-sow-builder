import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  Packer,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  convertInchesToTwip,
} from "docx";

import type { RomDoc, SowDoc, SowSection } from "./types";
import {
  OTHER_LABOR_FIELDS,
  type LaborResult,
  type TravelInputs,
  type TravelResult,
} from "./laborLibrary";

// Render a (possibly edited) SowDoc to a Word .docx matching the SOW
// template: US Letter, 0.5in margins, Calibri 11pt body, a running header on
// every page, bold title/subtitle, italic basis line, bold/underlined section
// headings, real bulleted lists, and "Page X of Y" footer page numbers.

// docx sizes are in half-points; spacing is in twips (20 per point).
const PT = (pt: number) => pt * 2;

// Drop XML-illegal control characters so Word never shows a repair prompt.
// (Keep tab/newline/carriage-return; strip the rest below 0x20.)
function sanitize(s: string | null | undefined): string {
  let out = "";
  for (const ch of s ?? "") {
    const c = ch.codePointAt(0) ?? 0;
    if (c === 9 || c === 10 || c === 13 || c >= 0x20) out += ch;
  }
  return out;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Best-effort: bold any BOM model string where it appears in body text. Wrapped
 * so a bad pattern degrades to a single plain run rather than breaking export.
 */
function bodyRuns(text: string, models: string[]): TextRun[] {
  const clean = sanitize(text);
  try {
    if (models.length === 0) return [new TextRun(clean)];
    const re = new RegExp(`(${models.map(escapeRegExp).join("|")})`, "gi");
    const lower = new Set(models.map((m) => m.toLowerCase()));
    const parts = clean.split(re).filter((p) => p.length > 0);
    if (parts.length === 0) return [new TextRun(clean)];
    return parts.map((p) =>
      lower.has(p.toLowerCase()) ? new TextRun({ text: p, bold: true }) : new TextRun(p),
    );
  } catch {
    return [new TextRun(clean)];
  }
}

function sectionHeading(section: SowSection): Paragraph {
  const level1 = section.level === 1;
  return new Paragraph({
    spacing: { before: level1 ? 240 : 160, after: level1 ? 80 : 60 },
    keepNext: true,
    border: level1
      ? { bottom: { style: BorderStyle.SINGLE, size: 6, space: 2, color: "999999" } }
      : undefined,
    children: [
      new TextRun({ text: sanitize(section.heading), bold: true, size: level1 ? PT(13) : PT(11) }),
    ],
  });
}

function blocksToParagraphs(section: SowSection, models: string[]): Paragraph[] {
  const out: Paragraph[] = [];
  for (const block of section.blocks) {
    if (block.kind === "paragraph") {
      out.push(new Paragraph({ spacing: { after: 120 }, children: bodyRuns(block.text, models) }));
    } else if (block.kind === "subheading") {
      out.push(
        new Paragraph({
          spacing: { before: 80, after: 40 },
          children: [new TextRun({ text: sanitize(block.text), bold: true })],
        }),
      );
    } else {
      for (const item of block.items) {
        out.push(
          new Paragraph({
            bullet: { level: 0 },
            spacing: { after: 40 },
            children: bodyRuns(item, models),
          }),
        );
      }
    }
  }
  return out;
}

/** Build the docx Document (pure — no DOM). */
export function buildSowDocument(sow: SowDoc, models: string[]): Document {
  const body: Paragraph[] = [];

  body.push(
    new Paragraph({
      spacing: { after: 80 },
      children: [new TextRun({ text: sanitize(sow.title), bold: true, size: PT(16) })],
    }),
  );

  if (sow.subtitle) {
    body.push(
      new Paragraph({
        spacing: { after: 80 },
        children: [new TextRun({ text: sanitize(sow.subtitle), bold: true, size: PT(12) })],
      }),
    );
  }

  if (sow.basisStatement) {
    body.push(
      new Paragraph({
        spacing: { after: 200 },
        children: [new TextRun({ text: sanitize(sow.basisStatement), italics: true, size: PT(10) })],
      }),
    );
  }

  // Render ONLY the sections present in the SowDoc.
  for (const section of sow.sections) {
    body.push(sectionHeading(section));
    body.push(...blocksToParagraphs(section, models));
  }

  const header = new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.LEFT,
        children: [new TextRun({ text: sanitize(sow.headerLine), size: PT(9) })],
      }),
    ],
  });

  const footer = new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: "Page ", size: PT(9) }),
          new TextRun({ children: [PageNumber.CURRENT], size: PT(9) }),
          new TextRun({ text: " of ", size: PT(9) }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], size: PT(9) }),
        ],
      }),
    ],
  });

  return new Document({
    creator: "SOW Generator",
    title: sanitize(sow.title),
    styles: { default: { document: { run: { font: "Calibri", size: PT(11) } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: convertInchesToTwip(8.5), height: convertInchesToTwip(11) },
            margin: {
              top: convertInchesToTwip(0.5),
              right: convertInchesToTwip(0.5),
              bottom: convertInchesToTwip(0.5),
              left: convertInchesToTwip(0.5),
              header: convertInchesToTwip(0.25),
              footer: convertInchesToTwip(0.25),
            },
          },
        },
        headers: { default: header },
        footers: { default: footer },
        children: body,
      },
    ],
  });
}

export function sowToBlob(sow: SowDoc, models: string[]): Promise<Blob> {
  return Packer.toBlob(buildSowDocument(sow, models));
}

/** Build the .docx in the browser and trigger a download (no server round-trip). */
export async function downloadSowDocx(
  sow: SowDoc,
  models: string[],
  filename: string,
): Promise<void> {
  await triggerDownload(await sowToBlob(sow, models), filename);
}

// ---------------------------------------------------------------------------
// ROM (budgetary scope summary) export — same page/header/footer guarantees.
// ---------------------------------------------------------------------------

function runningHeader(text: string): Header {
  return new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.LEFT,
        children: [new TextRun({ text: sanitize(text), size: PT(9) })],
      }),
    ],
  });
}

function pageFooter(): Footer {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: "Page ", size: PT(9) }),
          new TextRun({ children: [PageNumber.CURRENT], size: PT(9) }),
          new TextRun({ text: " of ", size: PT(9) }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], size: PT(9) }),
        ],
      }),
    ],
  });
}

const PAGE_PROPERTIES = {
  page: {
    size: { width: convertInchesToTwip(8.5), height: convertInchesToTwip(11) },
    margin: {
      top: convertInchesToTwip(0.5),
      right: convertInchesToTwip(0.5),
      bottom: convertInchesToTwip(0.5),
      left: convertInchesToTwip(0.5),
      header: convertInchesToTwip(0.25),
      footer: convertInchesToTwip(0.25),
    },
  },
};

/** Build the ROM summary docx (pure — no DOM). */
export function buildRomDocument(rom: RomDoc): Document {
  const body: Paragraph[] = [];

  body.push(
    new Paragraph({
      spacing: { after: 80 },
      children: [new TextRun({ text: sanitize(rom.title), bold: true, size: PT(16) })],
    }),
  );

  if (rom.customer) {
    body.push(
      new Paragraph({
        spacing: { after: 200 },
        children: [
          new TextRun({ text: sanitize(`Prepared for ${rom.customer}`), bold: true, size: PT(12) }),
        ],
      }),
    );
  }

  body.push(
    new Paragraph({
      spacing: { after: 120 },
      children: [new TextRun({ text: sanitize(rom.overview), size: PT(11) })],
    }),
  );

  for (const room of rom.rooms) {
    body.push(
      new Paragraph({
        spacing: { before: 220, after: 60 },
        keepNext: true,
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, space: 2, color: "999999" } },
        children: [new TextRun({ text: sanitize(room.name), bold: true, size: PT(13) })],
      }),
    );
    body.push(
      new Paragraph({
        spacing: { after: 120 },
        children: [new TextRun({ text: sanitize(room.summary), size: PT(11) })],
      }),
    );
  }

  return new Document({
    creator: "SOW Generator",
    title: sanitize(rom.title),
    styles: { default: { document: { run: { font: "Calibri", size: PT(11) } } } },
    sections: [
      {
        properties: PAGE_PROPERTIES,
        headers: { default: runningHeader(rom.headerLine) },
        footers: { default: pageFooter() },
        children: body,
      },
    ],
  });
}

export function romToBlob(rom: RomDoc): Promise<Blob> {
  return Packer.toBlob(buildRomDocument(rom));
}

async function triggerDownload(blob: Blob, filename: string): Promise<void> {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadRomDocx(rom: RomDoc, filename: string): Promise<void> {
  await triggerDownload(await romToBlob(rom), filename);
}

// ---------------------------------------------------------------------------
// Labor & Travel summary export. Labor is HOURS / DAYS only — no rates. Travel
// reflects real out-of-pocket dollars.
// ---------------------------------------------------------------------------

const hrs = (n: number) => `${Math.round(n * 100) / 100}`;
const usd = (n: number) => `$${(Math.round(n * 100) / 100).toFixed(2)}`;

function cell(text: string, opts: { bold?: boolean; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}) {
  return new TableCell({
    margins: { top: 30, bottom: 30, left: 80, right: 80 },
    children: [
      new Paragraph({
        alignment: opts.align,
        children: [new TextRun({ text: sanitize(text), bold: opts.bold, size: PT(10) })],
      }),
    ],
  });
}

function laborHeading(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 220, after: 80 },
    keepNext: true,
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, space: 2, color: "999999" } },
    children: [new TextRun({ text: sanitize(text), bold: true, size: PT(13) })],
  });
}

const fullWidth = { size: 100, type: WidthType.PERCENTAGE } as const;
const R = AlignmentType.RIGHT;
const C = AlignmentType.CENTER;

export type LaborDocArgs = {
  meta: { customer: string | null; projectNumber: string | null; projectName: string | null; company: string | null };
  result: LaborResult;
  travel: TravelResult;
  travelInputs: TravelInputs;
  workingHoursPerDay: number;
};

export function buildLaborDocument(a: LaborDocArgs): Document {
  const body: (Paragraph | Table)[] = [];
  const title = [a.meta.projectNumber, a.meta.projectName].filter(Boolean).join("  ").trim();

  body.push(
    new Paragraph({
      spacing: { after: 80 },
      children: [new TextRun({ text: sanitize(title || "Labor & Travel"), bold: true, size: PT(16) })],
    }),
  );
  if (a.meta.customer) {
    body.push(
      new Paragraph({
        spacing: { after: 60 },
        children: [new TextRun({ text: sanitize(`Prepared for ${a.meta.customer}`), bold: true, size: PT(12) })],
      }),
    );
  }
  body.push(
    new Paragraph({
      spacing: { after: 160 },
      children: [
        new TextRun({
          text: `Labor & Travel summary — hours and install days only (${a.workingHoursPerDay} working hours per day). Travel reflects real out-of-pocket expenses.`,
          italics: true,
          size: PT(10),
        }),
      ],
    }),
  );

  // Install labor by room
  body.push(laborHeading("Install Labor by Room"));
  const installRows: TableRow[] = [
    new TableRow({
      tableHeader: true,
      children: [
        cell("Room", { bold: true }),
        cell("Install hours", { bold: true, align: R }),
        cell("Install days", { bold: true, align: R }),
        cell("Staging hrs", { bold: true, align: R }),
      ],
    }),
  ];
  for (const room of a.result.rooms) {
    installRows.push(
      new TableRow({
        children: [
          cell(room.name),
          cell(hrs(room.installHours), { align: R }),
          cell(`${room.installDays}`, { align: R }),
          cell(hrs(room.stagingHours), { align: R }),
        ],
      }),
    );
  }
  installRows.push(
    new TableRow({
      children: [
        cell("TOTAL", { bold: true }),
        cell(hrs(a.result.totalInstallHours), { bold: true, align: R }),
        cell(`${a.result.totalInstallDays}`, { bold: true, align: R }),
        cell(hrs(a.result.totalStagingHours), { bold: true, align: R }),
      ],
    }),
  );
  body.push(new Table({ width: fullWidth, rows: installRows }));

  // Other labor (hours)
  body.push(laborHeading("Other Labor (hours)"));
  const otherRows: TableRow[] = [
    new TableRow({
      tableHeader: true,
      children: [cell("Category", { bold: true }), cell("Hours", { bold: true, align: R })],
    }),
  ];
  for (const f of OTHER_LABOR_FIELDS) {
    otherRows.push(new TableRow({ children: [cell(f.label), cell(hrs(a.result.otherTotals[f.key]), { align: R })] }));
  }
  body.push(new Table({ width: fullWidth, rows: otherRows }));

  // Travel & out-of-pocket
  const t = a.travelInputs;
  const tr = a.travel;
  body.push(laborHeading("Travel & Out-of-Pocket"));
  const travelRows: TableRow[] = [
    new TableRow({
      tableHeader: true,
      children: [cell("Item", { bold: true }), cell("Basis", { bold: true, align: C }), cell("Amount", { bold: true, align: R })],
    }),
    new TableRow({ children: [cell("Airfare (round-trip)"), cell(`$${t.airfareRT} × ${t.techs} tech(s)`, { align: C }), cell(usd(tr.airfare), { align: R })] }),
    new TableRow({ children: [cell("Hotel"), cell(`$${t.hotelNightly} × ${tr.hotelNights} night(s) × ${t.hotelRooms} room(s)`, { align: C }), cell(usd(tr.hotel), { align: R })] }),
    new TableRow({ children: [cell("Rental car"), cell(`$${t.rentalDaily} × ${tr.rentalDays} day(s) × ${t.cars} car(s)`, { align: C }), cell(usd(tr.rental), { align: R })] }),
    new TableRow({ children: [cell("Per diem"), cell(`$${t.perDiemDaily} × ${tr.perDiemDays} day(s) × ${t.techs} tech(s)`, { align: C }), cell(usd(tr.perDiem), { align: R })] }),
  ];
  for (const m of t.misc) {
    travelRows.push(new TableRow({ children: [cell(m.label || "Misc"), cell("line item", { align: C }), cell(usd(m.amount), { align: R })] }));
  }
  travelRows.push(
    new TableRow({
      children: [cell("TRAVEL SUBTOTAL", { bold: true }), cell("", { align: C }), cell(usd(tr.subtotal), { bold: true, align: R })],
    }),
  );
  body.push(new Table({ width: fullWidth, rows: travelRows }));

  return new Document({
    creator: "SOW Generator",
    title: sanitize(title || "Labor & Travel"),
    styles: { default: { document: { run: { font: "Calibri", size: PT(11) } } } },
    sections: [
      {
        properties: PAGE_PROPERTIES,
        headers: { default: runningHeader(`${a.meta.company?.trim() || "[Company Name]"}  |  ${a.meta.projectNumber ?? ""}  |  ${a.meta.projectName ?? ""}`) },
        footers: { default: pageFooter() },
        children: body,
      },
    ],
  });
}

export function laborToBlob(a: LaborDocArgs): Promise<Blob> {
  return Packer.toBlob(buildLaborDocument(a));
}

export async function downloadLaborDocx(a: LaborDocArgs, filename: string): Promise<void> {
  await triggerDownload(await laborToBlob(a), filename);
}
