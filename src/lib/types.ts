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
