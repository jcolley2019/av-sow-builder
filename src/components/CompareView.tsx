import { useMemo } from "react";
import {
  Loader2,
  X,
  FileText,
  ScanSearch,
  CheckCircle2,
  GitCompareArrows,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DropZone } from "@/components/DropZone";
import { RawError } from "@/components/RawError";
import { Model } from "@/components/Model";
import { BOM_ACCEPT } from "@/lib/files";
import { compareBoms, splitTier, type DiffItem, type QtyDiff } from "@/lib/compare";
import type { BomDoc } from "@/lib/types";
import type { DependencyFlag, ExtractError } from "@/lib/api";
import * as React from "react";

type Props = {
  primary: BomDoc;
  compareBom: BomDoc | null;
  compareFilename: string | null;
  compareBusy: boolean;
  compareError: ExtractError | null;
  onCompareFiles: (files: File[]) => void;
  onComparePaste: (text: string) => void;
  onClearCompare: () => void;

  depFlags: DependencyFlag[] | null;
  depBusy: boolean;
  depError: ExtractError | null;
  onRunDependencyCheck: () => void;
};

function ItemTable({ rows }: { rows: DiffItem[] }) {
  if (rows.length === 0)
    return <p className="px-1 py-1 text-xs text-muted-foreground">None.</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-36">Manufacturer</TableHead>
          <TableHead className="w-40">Model</TableHead>
          <TableHead className="w-12 text-center">Qty</TableHead>
          <TableHead>Location(s)</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r, i) => (
          <TableRow key={i}>
            <TableCell className="px-2 py-1 text-sm">{r.manufacturer || "—"}</TableCell>
            <TableCell className="px-2 py-1">
              <Model className="text-foreground">{r.model}</Model>
            </TableCell>
            <TableCell className="px-2 py-1 text-center font-mono tabular text-sm">{r.qty}</TableCell>
            <TableCell className="px-2 py-1 text-xs text-muted-foreground">
              {r.locations.join(", ") || "—"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function QtyTable({ rows }: { rows: QtyDiff[] }) {
  if (rows.length === 0)
    return <p className="px-1 py-1 text-xs text-muted-foreground">None.</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-36">Manufacturer</TableHead>
          <TableHead className="w-40">Model</TableHead>
          <TableHead className="w-14 text-center">Mine</TableHead>
          <TableHead className="w-14 text-center">Theirs</TableHead>
          <TableHead>Location(s)</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r, i) => (
          <TableRow key={i}>
            <TableCell className="px-2 py-1 text-sm">{r.manufacturer || "—"}</TableCell>
            <TableCell className="px-2 py-1">
              <Model className="text-foreground">{r.model}</Model>
            </TableCell>
            <TableCell className="px-2 py-1 text-center font-mono tabular text-sm">{r.mineQty}</TableCell>
            <TableCell className="px-2 py-1 text-center font-mono tabular text-sm text-primary">{r.theirsQty}</TableCell>
            <TableCell className="px-2 py-1 text-xs text-muted-foreground">
              {r.locations.join(", ") || "—"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function Accessories({ children, count }: { children: React.ReactNode; count: number }) {
  if (count === 0) return null;
  return (
    <details className="rounded-md border border-border bg-muted/20 px-3 py-2">
      <summary className="cursor-pointer text-xs text-muted-foreground">
        Accessories &amp; cables ({count}) — folded
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}

export function CompareView({
  primary,
  compareBom,
  compareFilename,
  compareBusy,
  compareError,
  onCompareFiles,
  onComparePaste,
  onClearCompare,
  depFlags,
  depBusy,
  depError,
  onRunDependencyCheck,
}: Props) {
  const [pasted, setPasted] = React.useState("");
  const result = useMemo(
    () => (compareBom ? compareBoms(primary, compareBom) : null),
    [primary, compareBom],
  );

  const buckets = useMemo(() => {
    if (!result) return null;
    return {
      missing: splitTier(result.missing),
      extra: splitTier(result.extra),
      qty: splitTier(result.qtyMismatch),
      matched: splitTier(result.matched),
    };
  }, [result]);

  return (
    <div className="space-y-4">
      {/* Compare-against input */}
      <Card>
        <CardHeader className="space-y-1.5">
          <span className="eyebrow">Compare against</span>
          <CardTitle className="flex items-center gap-2 text-base">
            <GitCompareArrows className="h-4 w-4 text-muted-foreground" />
            Client / vendor equipment list
          </CardTitle>
          <CardDescription>
            Drop the list to reconcile against your BOM. Neither list is modified.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!compareBom && !compareBusy && (
            <>
              <DropZone
                accept={BOM_ACCEPT}
                multiple={false}
                busy={compareBusy}
                onFiles={onCompareFiles}
                icon={<GitCompareArrows className="h-5 w-5" />}
                title="Drop the comparison list"
                hint=".xlsx · .xlsm · .xls · .csv · .pdf · .png · .jpg · .webp"
                className="py-5"
              />
              <div className="space-y-2">
                <span className="eyebrow block">Or paste the list</span>
                <Textarea
                  value={pasted}
                  onChange={(e) => setPasted(e.target.value)}
                  placeholder={"Qty\tManufacturer\tModel\n…"}
                  className="min-h-[72px] font-mono text-xs"
                />
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pasted.trim().length === 0}
                    onClick={() => onComparePaste(pasted)}
                  >
                    Compare pasted list
                  </Button>
                </div>
              </div>
            </>
          )}

          {compareBusy && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Extracting the comparison list…
            </div>
          )}

          {compareBom && (
            <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-raised/40 px-2.5 py-1.5">
              <span className="flex min-w-0 items-center gap-2 text-sm">
                <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{compareFilename ?? "Pasted list"}</span>
              </span>
              <button
                type="button"
                onClick={onClearCompare}
                aria-label="Clear comparison list"
                className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {compareError && <RawError error={compareError} label="Comparison list failed" />}
        </CardContent>
      </Card>

      {/* Deterministic diff */}
      {buckets && (
        <>
          <Card>
            <CardHeader className="space-y-1.5">
              <span className="eyebrow text-primary">Missing from mine</span>
              <CardTitle className="text-base">
                In their list, not in my BOM{" "}
                <span className="font-normal text-muted-foreground">· {buckets.missing.hero.length}</span>
              </CardTitle>
              <CardDescription>The “am I missing anything?” answer.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <ItemTable rows={buckets.missing.hero} />
              <Accessories count={buckets.missing.accessories.length}>
                <ItemTable rows={buckets.missing.accessories} />
              </Accessories>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-1.5">
              <span className="eyebrow">Extra in mine</span>
              <CardTitle className="text-base">
                In my BOM, not in their list{" "}
                <span className="font-normal text-muted-foreground">· {buckets.extra.hero.length}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <ItemTable rows={buckets.extra.hero} />
              <Accessories count={buckets.extra.accessories.length}>
                <ItemTable rows={buckets.extra.accessories} />
              </Accessories>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-1.5">
              <span className="eyebrow">Quantity mismatch</span>
              <CardTitle className="text-base">
                Same model, different quantity{" "}
                <span className="font-normal text-muted-foreground">· {buckets.qty.hero.length}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <QtyTable rows={buckets.qty.hero} />
              <Accessories count={buckets.qty.accessories.length}>
                <QtyTable rows={buckets.qty.accessories} />
              </Accessories>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-1.5">
              <span className="eyebrow">Matched</span>
              <CardTitle className="text-base">
                Same model &amp; quantity{" "}
                <span className="font-normal text-muted-foreground">· {buckets.matched.hero.length}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <details className="rounded-md border border-border bg-muted/20 px-3 py-2">
                <summary className="cursor-pointer text-xs text-muted-foreground">
                  Show {buckets.matched.hero.length} matched item(s)
                </summary>
                <div className="mt-2 space-y-2">
                  <ItemTable rows={buckets.matched.hero} />
                  <Accessories count={buckets.matched.accessories.length}>
                    <ItemTable rows={buckets.matched.accessories} />
                  </Accessories>
                </div>
              </details>
            </CardContent>
          </Card>
        </>
      )}

      {/* AI dependency check — suggestions only */}
      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div className="space-y-1.5">
            <span className="eyebrow">Review</span>
            <CardTitle className="flex items-center gap-2 text-base">
              <ScanSearch className="h-4 w-4 text-muted-foreground" />
              Suggestions to review
            </CardTitle>
            <CardDescription>
              Conservative AI flags of likely-missing companion items. Confirm and add
              manually — nothing is added automatically.
            </CardDescription>
          </div>
          <Button
            size="sm"
            variant={depFlags ? "outline" : "default"}
            onClick={onRunDependencyCheck}
            disabled={depBusy}
          >
            {depBusy ? (
              <>
                <Loader2 className="animate-spin" /> Checking…
              </>
            ) : depFlags ? (
              "Re-run check"
            ) : (
              "Run dependency check"
            )}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {depFlags === null && !depBusy && (
            <p className="text-sm text-muted-foreground">
              Checks for common missing dependencies — mounts, power supplies, Dante /
              software licenses, network switches.
            </p>
          )}
          {depFlags !== null && depFlags.length === 0 && (
            <div className="flex items-center gap-2 text-sm text-emerald-300">
              <CheckCircle2 className="h-4 w-4" />
              No obvious missing dependencies were found.
            </div>
          )}
          {depFlags && depFlags.length > 0 && (
            <>
              <ul className="space-y-2">
                {depFlags.map((f, i) => (
                  <li key={i} className="rounded-md border border-border bg-muted/20 p-3 text-sm">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <Model className="text-foreground">{f.forItem}</Model>
                      {f.location && (
                        <span className="text-xs text-muted-foreground">· {f.location}</span>
                      )}
                    </div>
                    <p className="mt-1 text-foreground">{f.suggestion}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Candidate: <Model className="text-foreground">{f.candidate}</Model> — {f.reason}
                    </p>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                These are AI suggestions to verify, not automatic additions — nothing has
                been added to any BOM.
              </p>
            </>
          )}
          {depError && <RawError error={depError} label="Dependency check failed" />}
        </CardContent>
      </Card>
    </div>
  );
}
