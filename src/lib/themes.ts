import type { StyleTheme } from "./types";

// SC.7 — built-in report styles for .docx export.
//
// TEMPLATE_THEME was extracted from "!TEMPLATE SOW(1).docx" via
// extractDocxTheme. That template defines no Heading1/Heading2/Title styles
// (its headings are direct formatting), so only the theme-part fonts and
// accent color are extractable. Its header is image-based (a logo, no w:shd
// shading), so headerBand stays null.
export const TEMPLATE_THEME: StyleTheme = {
  headingFont: "Calibri Light",
  bodyFont: "Calibri",
  accentColor: "4472C4",
  headerBand: null,
};

export const BUILT_IN_STYLES = [
  { id: "template", label: "Template (default)", theme: TEMPLATE_THEME },
  { id: "classic", label: "Classic house", theme: undefined },
] as const;

export type ReportStyleId = (typeof BUILT_IN_STYLES)[number]["id"];
