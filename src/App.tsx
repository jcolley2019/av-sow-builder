import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  FileText,
  RotateCcw,
  Loader2,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  ListChecks,
  Download,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BomIntake } from "@/components/BomIntake";
import { BomReview } from "@/components/BomReview";
import { RemovalsPanel } from "@/components/RemovalsPanel";
import { StylePanel } from "@/components/StylePanel";
import { SowPreview } from "@/components/SowPreview";
import { RomPreview } from "@/components/RomPreview";
import { CompareView } from "@/components/CompareView";
import { LaborView } from "@/components/LaborView";
import { RawError } from "@/components/RawError";
import { Model } from "@/components/Model";
import { cn } from "@/lib/utils";
import { useBomEditor } from "@/lib/useBomEditor";
import { useLaborModel } from "@/lib/useLaborModel";
import { allModels, coverage } from "@/lib/sow";
import { downloadRomDocx, downloadSowDocx } from "@/lib/docx";
import {
  analyzeStyle,
  bomRequestFromFile,
  dependencyCheck,
  extractBom,
  extractRemovals,
  extractStyleText,
  generateRom,
  generateSow,
  isError,
  removalsDrawingFromFile,
  type BomRequest,
  type DependencyFlag,
  type ExtractError,
  type SowMeta,
  type StyleAnalysis,
  type StyleMode,
} from "@/lib/api";
import type { BomDoc, RomDoc, SowDoc } from "@/lib/types";

type OutputMode = "sow" | "rom" | "compare";

type TopView = "builder" | "labor";

// The integrator/company name persists as an editable default in localStorage,
// pre-filling new projects but fully erasable per project.
const COMPANY_KEY = "sow.companyName";
function loadCompanyDefault(): string {
  try {
    return localStorage.getItem(COMPANY_KEY) ?? "";
  } catch {
    return "";
  }
}

function App() {
  const editor = useBomEditor();
  const labor = useLaborModel();
  const reduce = useReducedMotion();

  const [view, setView] = useState<TopView>("builder");
  const [company, setCompany] = useState<string>(loadCompanyDefault);

  function updateCompany(v: string) {
    setCompany(v);
    try {
      if (v.trim()) localStorage.setItem(COMPANY_KEY, v);
    } catch {
      /* ignore storage failures */
    }
  }

  const [bomBusy, setBomBusy] = useState(false);
  const [bomError, setBomError] = useState<ExtractError | null>(null);

  const [demoBusy, setDemoBusy] = useState(false);
  const [demoError, setDemoError] = useState<ExtractError | null>(null);
  const [demoNotice, setDemoNotice] = useState<string | null>(null);
  // Guided-removal direction (free text + selected systems) — persists across
  // the intake -> review transition and is sent with the drawings.
  const [demoText, setDemoText] = useState("");
  const [demoItems, setDemoItems] = useState<string[]>([]);

  // Output generation. `sow` and `rom` are kept independently so toggling modes
  // never loses either. sowBusy/sowError are the SHARED generation status (only
  // one mode generates at a time).
  const [mode, setMode] = useState<OutputMode>("sow");
  const [sow, setSow] = useState<SowDoc | null>(null);
  const [rom, setRom] = useState<RomDoc | null>(null);
  const [sowBusy, setSowBusy] = useState(false);
  const [sowError, setSowError] = useState<ExtractError | null>(null);
  const [elapsed, setElapsed] = useState(0);

  // Match-a-Style (SOW mode only): optional example SOW + chosen style mode.
  const [styleSample, setStyleSample] = useState<string | null>(null);
  const [styleFilename, setStyleFilename] = useState<string | null>(null);
  const [styleMode, setStyleMode] = useState<StyleMode>("house");
  const [styleAnalysis, setStyleAnalysis] = useState<StyleAnalysis | null>(null);
  const [styleBusy, setStyleBusy] = useState(false);
  const [styleError, setStyleError] = useState<ExtractError | null>(null);

  // Compare mode: a second (read-only) equipment list + a dependency check.
  const [compareBom, setCompareBom] = useState<BomDoc | null>(null);
  const [compareFilename, setCompareFilename] = useState<string | null>(null);
  const [compareBusy, setCompareBusy] = useState(false);
  const [compareError, setCompareError] = useState<ExtractError | null>(null);
  const [depFlags, setDepFlags] = useState<DependencyFlag[] | null>(null);
  const [depBusy, setDepBusy] = useState(false);
  const [depError, setDepError] = useState<ExtractError | null>(null);

  const showReview = editor.core !== null;
  const activeDoc = mode === "rom" ? rom : sow;

  const itemCount =
    editor.core?.locations.reduce(
      (n, r) => n + r.systems.reduce((m, s) => m + s.items.length, 0),
      0,
    ) ?? 0;

  const meta: SowMeta | null = editor.core
    ? {
        customer: editor.core.customer,
        projectNumber: editor.core.projectNumber,
        projectName: editor.core.projectName,
        company: company.trim() ? company.trim() : null,
      }
    : null;

  const models = useMemo(
    () => (editor.doc ? allModels(editor.doc) : []),
    [editor.doc],
  );
  const cover = useMemo(
    () => (sow && editor.doc ? coverage(editor.doc, sow) : null),
    [sow, editor.doc],
  );

  // Elapsed-time counter while generating.
  useEffect(() => {
    if (!sowBusy) return;
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [sowBusy]);

  // --- BOM extraction (file or paste) --------------------------------------
  async function runBom(req: BomRequest) {
    setBomError(null);
    setBomBusy(true);
    try {
      const data = await extractBom(req);
      if (isError(data)) {
        setBomError(data);
        return;
      }
      if (!data.locations || data.locations.length === 0) {
        setBomError({
          error:
            "No locations were extracted from the BOM. Check the file or text and try again.",
          raw: JSON.stringify(data, null, 2),
        });
        return;
      }
      editor.initFromBom(data);
      setSow(null);
      setRom(null);
      setSowError(null);
      setDepFlags(null); // dependency flags are stale against a new BOM
      labor.reset(); // per-project labor edits are stale against a new BOM
    } catch (e) {
      setBomError({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      setBomBusy(false);
    }
  }

  async function handleBomFiles(files: File[]) {
    try {
      const req = await bomRequestFromFile(files[0]);
      await runBom(req);
    } catch (e) {
      setBomError({ error: e instanceof Error ? e.message : String(e) });
    }
  }

  function handleBomPaste(text: string) {
    void runBom({ kind: "text", text });
  }

  // --- Removals extraction (guided: direction + optional drawings) ---------
  // Sends the user's description + selected systems as the GUIDE, with all
  // dropped drawings, in a single request. `files === null` = direction only.
  async function submitRemovals(files: File[] | null) {
    setDemoError(null);
    setDemoNotice(null);
    setDemoBusy(true);
    try {
      const drawings =
        files && files.length
          ? await Promise.all(files.map(removalsDrawingFromFile))
          : undefined;
      const data = await extractRemovals({
        description: demoText.trim() || undefined,
        items: demoItems.length ? demoItems : undefined,
        drawings,
      });
      if (isError(data)) {
        setDemoError(data);
        return;
      }
      if (data.removals.length > 0) editor.addRemovals(data.removals);
      const src = drawings ? "drawing(s)" : "description";
      setDemoNotice(
        data.removals.length === 0
          ? `No removals were identified from the ${src}.`
          : `Added ${data.removals.length} removal item(s).`,
      );
    } catch (e) {
      setDemoError({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      setDemoBusy(false);
    }
  }

  const handleDemoFiles = (files: File[]) => void submitRemovals(files);
  function handleDescribeOnly() {
    if (!demoText.trim() && demoItems.length === 0) return;
    void submitRemovals(null);
  }

  // --- Output generation (SOW or ROM, per active mode) ---------------------
  async function handleGenerate() {
    if (!editor.doc || !meta) return;
    setSowError(null);
    setSowBusy(true);
    setElapsed(0);
    try {
      if (mode === "rom") {
        const data = await generateRom(editor.doc, meta);
        if (isError(data)) {
          setSowError(data);
          return;
        }
        setRom(data);
      } else {
        const data = await generateSow(editor.doc, meta, {
          styleSample: styleSample ?? undefined,
          styleMode,
        });
        if (isError(data)) {
          setSowError(data);
          return;
        }
        setSow(data);
      }
    } catch (e) {
      setSowError({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      setSowBusy(false);
    }
  }

  // --- Match-a-Style: ingest an example, then analyze its writing style ----
  async function ingestStyle(source: { file?: File; text?: string }) {
    setStyleError(null);
    setStyleAnalysis(null);
    setStyleBusy(true);
    setStyleSample(null);
    setStyleFilename(null);
    try {
      let text = (source.text ?? "").trim();
      const filename = source.file ? source.file.name : "Pasted example";
      if (source.file) text = (await extractStyleText(source.file)).trim();
      if (!text) {
        setStyleError({ error: "No text could be read from that example." });
        return;
      }
      setStyleSample(text);
      setStyleFilename(filename);
      const a = await analyzeStyle(text);
      if (isError(a)) setStyleError(a);
      else setStyleAnalysis(a);
    } catch (e) {
      setStyleError({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      setStyleBusy(false);
    }
  }

  const handleStyleFiles = (files: File[]) => {
    if (files[0]) void ingestStyle({ file: files[0] });
  };
  const handleStylePaste = (text: string) => {
    if (text.trim()) void ingestStyle({ text });
  };
  function clearStyle() {
    setStyleSample(null);
    setStyleFilename(null);
    setStyleAnalysis(null);
    setStyleError(null);
    setStyleBusy(false);
    setStyleMode("house");
  }

  // --- Compare: extract a second list (read-only) + dependency check -------
  async function ingestCompare(req: BomRequest, filename: string) {
    setCompareError(null);
    setCompareBusy(true);
    try {
      const data = await extractBom(req);
      if (isError(data)) {
        setCompareError(data);
        return;
      }
      if (!data.locations || data.locations.length === 0) {
        setCompareError({
          error: "No equipment was extracted from that list. Check the file or text.",
          raw: JSON.stringify(data, null, 2),
        });
        return;
      }
      setCompareBom({ ...data, removals: [] });
      setCompareFilename(filename);
    } catch (e) {
      setCompareError({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      setCompareBusy(false);
    }
  }

  async function handleCompareFiles(files: File[]) {
    const file = files[0];
    if (!file) return;
    try {
      const req = await bomRequestFromFile(file);
      await ingestCompare(req, file.name);
    } catch (e) {
      setCompareError({ error: e instanceof Error ? e.message : String(e) });
    }
  }
  const handleComparePaste = (text: string) => {
    if (text.trim()) void ingestCompare({ kind: "text", text }, "Pasted list");
  };
  function clearCompare() {
    setCompareBom(null);
    setCompareFilename(null);
    setCompareError(null);
    setCompareBusy(false);
  }

  async function runDependencyCheck() {
    if (!editor.doc) return;
    setDepError(null);
    setDepBusy(true);
    try {
      const data = await dependencyCheck(editor.doc);
      if (isError(data)) {
        setDepError(data);
        setDepFlags(null);
        return;
      }
      setDepFlags(data.flags);
    } catch (e) {
      setDepError({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      setDepBusy(false);
    }
  }

  function startOver() {
    editor.reset();
    setBomError(null);
    setDemoError(null);
    setDemoNotice(null);
    setDemoText("");
    setDemoItems([]);
    setSow(null);
    setRom(null);
    setSowError(null);
    setMode("sow");
    clearStyle();
    clearCompare();
    setDepFlags(null);
    setDepError(null);
    labor.reset();
    setCompany(loadCompanyDefault()); // keep the saved company default
  }

  // Shared guided-removal props for both demo intakes (intake + review).
  const demo = {
    description: demoText,
    onDescriptionChange: setDemoText,
    items: demoItems,
    onItemsChange: setDemoItems,
    onFiles: handleDemoFiles,
    onDescribeOnly: handleDescribeOnly,
    busy: demoBusy,
    error: demoError,
    notice: demoNotice,
  };

  function handleDownload() {
    const num = (meta?.projectNumber ?? "").trim().replace(/[^\w.-]+/g, "_");
    if (mode === "rom") {
      if (!rom) return;
      void downloadRomDocx(rom, num ? `${num}_ROM.docx` : "ROM.docx").catch((e) => {
        console.error("[ROM] .docx export failed", e);
      });
    } else {
      if (!sow) return;
      void downloadSowDocx(sow, models, num ? `${num}_SOW.docx` : "SOW.docx").catch((e) => {
        console.error("[SOW] .docx export failed", e);
      });
    }
  }

  const segClass = (on: boolean) =>
    cn(
      "rounded-[5px] px-3 py-1 font-mono text-xs transition-colors",
      on ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
    );
  const modeLabel = mode === "rom" ? "ROM summary" : "Scope of Work";

  const load = reduce
    ? {}
    : {
        initial: { opacity: 0, y: 6 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.3, ease: "easeOut" as const },
      };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground lg:h-full lg:min-h-0 lg:overflow-hidden">
      {/* Instrument top bar — fixed; the panes scroll beneath it. */}
      <header className="sticky top-0 z-20 shrink-0 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1500px] items-center gap-3 px-4 sm:px-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <FileText className="h-[18px] w-[18px]" strokeWidth={2.25} />
          </div>
          <div className="flex flex-col">
            <span className="font-mono text-base font-semibold leading-none tracking-tight">
              SOW Generator
            </span>
            <span className="eyebrow mt-1">Delivery Scope</span>
          </div>

          {/* Top-level view switch — both views share the in-memory project. */}
          <div className="ml-2 inline-flex rounded-md border border-border p-0.5">
            <button
              type="button"
              aria-pressed={view === "builder"}
              className={segClass(view === "builder")}
              onClick={() => setView("builder")}
            >
              SOW Builder
            </button>
            <button
              type="button"
              aria-pressed={view === "labor"}
              className={segClass(view === "labor")}
              onClick={() => setView("labor")}
            >
              Labor &amp; Travel
            </button>
          </div>

          <div className="flex-1" />
          {view === "builder" && showReview && (
            <Button variant="ghost" size="sm" onClick={startOver}>
              <RotateCcw /> Start over
            </Button>
          )}
        </div>
      </header>

      {view === "labor" ? (
        <main className="flex-1 lg:min-h-0 lg:overflow-y-auto">
          <LaborView bom={editor.doc} labor={labor} company={company} />
        </main>
      ) : (
      /* Two-pane workspace. On lg each pane fills the viewport below the top
         bar and scrolls independently; below lg the panes stack. */
      <main className="flex-1 lg:min-h-0 lg:overflow-hidden">
        <div className="mx-auto grid max-w-[1500px] grid-cols-1 gap-6 px-4 sm:px-6 lg:h-full lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-rows-1 lg:gap-8">
          {/* LEFT — input / controls on the dark instrument surface */}
          <motion.section
            key={showReview ? "review" : "intake"}
            {...load}
            className="flex min-w-0 flex-col lg:min-h-0"
          >
            <div className="flex items-center justify-between pt-6 lg:shrink-0 lg:pr-2">
              <span className="eyebrow">Input · Bill of Materials</span>
              {showReview && (
                <span className="eyebrow text-muted-foreground">{itemCount} item(s)</span>
              )}
            </div>

            <div className="space-y-4 pb-6 pt-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-2">
            {!showReview ? (
              <BomIntake
                onBomFiles={handleBomFiles}
                onBomPaste={handleBomPaste}
                bomBusy={bomBusy}
                bomError={bomError}
                demo={demo}
                removalsCount={editor.removals.length}
              />
            ) : (
              <div className="space-y-4">
                <BomReview editor={editor} company={company} onCompanyChange={updateCompany} />

                <RemovalsPanel editor={editor} demo={demo} />

                {/* Match-a-Style — Delivery SOW mode only. */}
                {mode === "sow" && (
                  <StylePanel
                    sample={styleSample}
                    filename={styleFilename}
                    styleMode={styleMode}
                    analysis={styleAnalysis}
                    busy={styleBusy}
                    error={styleError}
                    onFiles={handleStyleFiles}
                    onPaste={handleStylePaste}
                    onClear={clearStyle}
                    onModeChange={setStyleMode}
                  />
                )}

              </div>
            )}
            </div>
          </motion.section>

          {/* RIGHT — output pane: a pinned control card (mode toggle + actions)
              over the framed document that scrolls within the pane. */}
          <motion.section {...load} className="flex min-w-0 flex-col lg:min-h-0">
            <div className="space-y-3 pt-6 lg:shrink-0 lg:pr-2">
              <div className="flex items-center justify-between">
                <span className="eyebrow">
                  {mode === "compare"
                    ? "Output · Compare"
                    : mode === "rom"
                      ? "Output · ROM Summary"
                      : "Output · Scope of Work"}
                </span>
              </div>

              {/* Control card — mirrors the input pane's framed cards. */}
              <Card>
                <CardContent className="space-y-3 p-4">
                  <span className="eyebrow block">
                    {mode === "compare" ? "Reconcile" : "Generate"}
                  </span>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="inline-flex rounded-md border border-border p-0.5">
                      <button
                        type="button"
                        aria-pressed={mode === "sow"}
                        className={segClass(mode === "sow")}
                        onClick={() => setMode("sow")}
                      >
                        Delivery SOW
                      </button>
                      <button
                        type="button"
                        aria-pressed={mode === "rom"}
                        className={segClass(mode === "rom")}
                        onClick={() => setMode("rom")}
                      >
                        ROM Summary
                      </button>
                      <button
                        type="button"
                        aria-pressed={mode === "compare"}
                        className={segClass(mode === "compare")}
                        onClick={() => setMode("compare")}
                      >
                        Compare
                      </button>
                    </div>
                    {mode !== "compare" && (
                      <div className="flex flex-wrap items-center gap-2">
                        {activeDoc && (
                          <Button variant="outline" size="sm" onClick={handleDownload}>
                            <Download /> Download .docx
                          </Button>
                        )}
                        <Button
                          onClick={handleGenerate}
                          disabled={sowBusy}
                          className="min-w-[200px]"
                        >
                          {sowBusy ? (
                            <>
                              <Loader2 className="animate-spin" /> Generating… {elapsed}s
                            </>
                          ) : activeDoc ? (
                            <>
                              <RefreshCw /> Regenerate
                            </>
                          ) : (
                            <>
                              <Sparkles />{" "}
                              {mode === "rom" ? "Generate ROM Summary" : "Generate Scope of Work"}
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="text-sm text-muted-foreground" aria-live="polite">
                    {mode === "compare"
                      ? "Reconcile your BOM against a client/vendor list, and flag missing dependencies below."
                      : sowBusy
                        ? `Generating… (${elapsed}s elapsed)`
                        : activeDoc
                          ? `Edit the ${modeLabel} in the document below, or regenerate.`
                          : `Generate the ${modeLabel} from the reviewed BOM.`}
                  </div>

                  {sowError && (
                    <RawError
                      error={sowError}
                      label={mode === "rom" ? "ROM generation failed" : "SOW generation failed"}
                    />
                  )}

                  {/* Coverage guardrail — Delivery SOW mode only */}
                  {mode === "sow" && cover && cover.total > 0 && !sowBusy && (
                    cover.clean ? (
                      <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-300">
                        <CheckCircle2 className="h-4 w-4" />
                        {cover.heading}
                      </div>
                    ) : (
                      <div className="rounded-md border border-border bg-muted/30 px-3 py-2.5 text-sm">
                        <div className="flex items-center gap-2 font-medium text-foreground">
                          <ListChecks className="h-4 w-4 text-muted-foreground" />
                          {cover.heading}
                        </div>
                        <ul className="mt-2 space-y-1">
                          {cover.missing.map((m, i) => (
                            <li key={i} className="flex flex-wrap items-baseline gap-x-1.5">
                              <span className="text-xs text-muted-foreground">
                                {m.location} / {m.system} —
                              </span>
                              <Model className="text-foreground">
                                {[m.manufacturer, m.model].filter(Boolean).join(" ")}
                              </Model>
                            </li>
                          ))}
                        </ul>
                        {cover.note && (
                          <p className="mt-2 text-xs text-muted-foreground">{cover.note}</p>
                        )}
                      </div>
                    )
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Scrolling body — Compare view, or the framed document sheet. */}
            <div className="pb-6 pt-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-2">
              {mode === "compare" ? (
                editor.doc ? (
                  <CompareView
                    primary={editor.doc}
                    compareBom={compareBom}
                    compareFilename={compareFilename}
                    compareBusy={compareBusy}
                    compareError={compareError}
                    onCompareFiles={handleCompareFiles}
                    onComparePaste={handleComparePaste}
                    onClearCompare={clearCompare}
                    depFlags={depFlags}
                    depBusy={depBusy}
                    depError={depError}
                    onRunDependencyCheck={runDependencyCheck}
                  />
                ) : (
                  <Card>
                    <CardContent className="p-6 text-sm text-muted-foreground">
                      Extract a BOM on the left to start comparing.
                    </CardContent>
                  </Card>
                )
              ) : (
                <Card>
                  <CardContent className="space-y-2 p-3 sm:p-4">
                    <span className="eyebrow block">Document · .docx preview</span>
                    {mode === "rom" ? (
                      <RomPreview rom={rom} meta={meta} busy={sowBusy} onChange={setRom} />
                    ) : (
                      <SowPreview
                        sow={sow}
                        meta={meta}
                        models={models}
                        busy={sowBusy}
                        onChange={setSow}
                      />
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </motion.section>
        </div>
      </main>
      )}
    </div>
  );
}

export default App;
