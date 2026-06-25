import { useState } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// SOW.13 — "Project context / site notes": optional, prose-only guidance the
// BOM can't carry (divisible rooms, shared cores, antenna/channel allocation,
// rack location…). It shapes HOW the SOW/ROM is written; it never changes scope.
// Mirrors BomReview's card + room-tab language so it reads as part of the set.

const PROJECT_PLACEHOLDER =
  "Describe anything the BOM can't show — divisible rooms, shared equipment, rack location, signal routing, channel allocation, etc.";

const ROOM_PLACEHOLDER =
  "Notes that guide how this room is written — e.g. shared Q-SYS Core, antenna distribution, channel allocation, rack location.";

export function SiteNotes({
  projectContext,
  onProjectContextChange,
  rooms,
  roomNotes,
  onRoomNoteChange,
}: {
  projectContext: string;
  onProjectContextChange: (v: string) => void;
  rooms: string[];
  roomNotes: Record<string, string>;
  onRoomNoteChange: (name: string, v: string) => void;
}) {
  const [activeRoom, setActiveRoom] = useState(0);
  // Clamp to a valid room (locations may have been added/removed since select).
  const active = rooms.length === 0 ? -1 : Math.min(activeRoom, rooms.length - 1);
  const activeName = active >= 0 ? rooms[active] : "";

  const hasNote = (name: string) => (roomNotes[name] ?? "").trim().length > 0;

  const tabClass = (on: boolean) =>
    cn(
      "flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 font-mono text-xs transition-colors",
      on
        ? "bg-primary text-primary-foreground"
        : "text-muted-foreground hover:bg-raised hover:text-foreground",
    );

  return (
    <Card>
      <CardHeader className="space-y-1.5">
        <span className="eyebrow">Context</span>
        <CardTitle className="text-base">Project context / site notes</CardTitle>
        <CardDescription>
          Optional guidance for the writer. Shapes how the scope is described — it never
          adds, removes, or invents equipment. The BOM stays the source of scope.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Project-level context */}
        <label className="block">
          <span className="eyebrow mb-1.5 block">Project / site context (optional)</span>
          <Textarea
            value={projectContext}
            placeholder={PROJECT_PLACEHOLDER}
            className="min-h-[88px]"
            onChange={(e) => onProjectContextChange(e.target.value)}
          />
        </label>

        {/* Per-room notes — same room-tab selector as the BOM card. */}
        {rooms.length > 0 && (
          <div className="space-y-2.5">
            <span className="eyebrow block">Per-room notes (optional)</span>
            <div
              role="tablist"
              aria-label="Select a location to annotate"
              className="flex flex-wrap gap-1.5 border-b border-border pb-2.5"
            >
              {rooms.map((name, ri) => (
                <button
                  key={ri}
                  type="button"
                  role="tab"
                  aria-selected={active === ri}
                  className={tabClass(active === ri)}
                  onClick={() => setActiveRoom(ri)}
                >
                  {name.trim() || `Location ${ri + 1}`}
                  {hasNote(name) && (
                    <span
                      aria-hidden
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        active === ri ? "bg-primary-foreground" : "bg-primary",
                      )}
                    />
                  )}
                </button>
              ))}
            </div>

            {active >= 0 && (
              <label className="block">
                <span className="eyebrow mb-1.5 block">
                  Room notes — {activeName.trim() || `Location ${active + 1}`} (optional)
                </span>
                <Textarea
                  // Key by room so switching tabs swaps the field's value cleanly.
                  key={`room-note-${active}`}
                  value={roomNotes[activeName] ?? ""}
                  placeholder={ROOM_PLACEHOLDER}
                  className="min-h-[72px]"
                  onChange={(e) => onRoomNoteChange(activeName, e.target.value)}
                />
              </label>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
