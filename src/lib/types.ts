// Shared domain types for the SOW Generator.
// Phase 2: BOM intake — a Location -> System -> line-item tree, plus an
// optional removals list sourced ONLY from demo / as-built drawings.

export type BomItem = {
  qty: number;
  manufacturer: string;
  model: string;
  description: string;
  /**
   * ofe = existing / owner-furnished equipment that STAYS in the system
   * (reused / integrated). It is NOT removed. Removals live in `removals`.
   */
  ofe: boolean;
};

export type BomSystem = {
  name: string;
  items: BomItem[];
};

export type BomRoom = {
  name: string;
  systems: BomSystem[];
};

export type RemovalItem = {
  qty: number;
  manufacturer: string;
  model: string;
  description: string;
  location: string | null;
};

export type BomDoc = {
  customer: string | null;
  projectName: string | null;
  projectNumber: string | null;
  locations: BomRoom[];
  removals: RemovalItem[];
};

// Phase 3: the generated Scope of Work, rendered into the paper preview pane.

export type SowBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "subheading"; text: string }
  | { kind: "bullets"; items: string[] };

export type SowSection = {
  heading: string;
  level: 1 | 2;
  blocks: SowBlock[];
};

export type SowDoc = {
  headerLine: string;
  title: string;
  subtitle: string | null;
  basisStatement: string | null;
  sections: SowSection[];
};

// SC.6: visual style extracted from a .docx/.dotx example's XML (theme fonts,
// heading styles, header shading). Every field optional — renderers fall back
// to house styling per-field. Mirrored in api/_lib/helpers.ts.
export interface StyleTheme {
  bodyFont?: string; // minorFont latin from theme1.xml, or Normal style rFonts
  bodySizePt?: number; // Normal style sz/2
  headingFont?: string; // majorFont latin, or Heading1 rFonts
  heading1SizePt?: number;
  heading2SizePt?: number;
  headingColor?: string; // hex, no #
  headingUnderline?: boolean; // Heading1/2 pBdr bottom border present
  headingUnderlineColor?: string;
  titleSizePt?: number; // Title style if present
  accentColor?: string; // theme1.xml accent1
  headerBand?: {
    // from header1..3.xml: a shaded paragraph or single-row
    // table with cell shading (w:shd fill)
    fill: string;
    textColor?: string;
  } | null;
}

// SOW.7: the alternate output mode — a pricing-free budgetary ROM / scope
// summary (one overview paragraph + a short blurb per room).
export type RomDoc = {
  headerLine: string;
  title: string;
  customer: string | null;
  overview: string;
  rooms: { name: string; summary: string }[];
};
