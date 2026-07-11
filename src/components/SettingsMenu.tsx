import * as React from "react";
import { Settings } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

// Header "Settings" dropdown — one-time company onboarding. The company name is
// the INTEGRATOR (the firm writing the SOW). It pre-fills the Company field on
// every project and is fed to BOM extraction so the model never mistakes it for
// the customer. Backed by the same localStorage default the Company field uses,
// so the two stay in sync.
export function SettingsMenu({
  company,
  onCompanyChange,
}: {
  company: string;
  onCompanyChange: (v: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="ghost"
        size="sm"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Settings /> Settings
      </Button>

      {open && (
        <div
          role="dialog"
          aria-label="Company settings"
          className="absolute right-0 z-30 mt-2 w-80 rounded-md border border-border bg-background p-4 shadow-lg"
        >
          <span className="eyebrow block">Your company</span>
          <p className="mt-1 text-xs text-muted-foreground">
            Saved on this device. Pre-fills the Company field on every project and is
            excluded from customer detection when a BOM is extracted.
          </p>
          <label className="mt-3 block">
            <span className="eyebrow mb-1.5 block">Company name (integrator)</span>
            <Input
              value={company}
              placeholder="e.g. Acme AV"
              onChange={(e) => onCompanyChange(e.target.value)}
              autoFocus
            />
          </label>
        </div>
      )}
    </div>
  );
}
