import { Scissors, Plus, Trash2 } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DemoIntake, type DemoDirection } from "@/components/DemoIntake";
import type { BomEditor } from "@/lib/useBomEditor";

type Props = {
  editor: BomEditor;
  demo: DemoDirection;
};

export function RemovalsPanel({ editor, demo }: Props) {
  const removals = editor.removals;

  return (
    <div className="space-y-4">
      {/* Guided demo intake — still reachable after the BOM is extracted. */}
      <Card>
        <CardHeader className="space-y-1.5">
          <span className="eyebrow">Optional</span>
          <CardTitle className="flex items-center gap-2 text-base">
            <Scissors className="h-4 w-4 text-muted-foreground" />
            Demo / As-Built Drawings
          </CardTitle>
          <CardDescription>
            The only source of removals. Describe what to pull and/or drop as-builts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DemoIntake {...demo} compact />
        </CardContent>
      </Card>

      {/* Removals table — render ONLY when there are removals. */}
      {removals.length > 0 && (
        <Card>
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <div className="space-y-1.5">
              <span className="eyebrow text-primary">Removals</span>
              <CardTitle className="text-base">
                Equipment to be Removed (from demo drawings)
              </CardTitle>
              <CardDescription>
                {removals.length} item(s). Edit or remove as needed.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={editor.addRemovalRow}>
              <Plus /> Add row
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">Qty</TableHead>
                  <TableHead className="w-40">Manufacturer</TableHead>
                  <TableHead className="w-40">Model</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-40">Location</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {removals.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        value={Number.isFinite(r.qty) ? r.qty : 0}
                        className="h-8 w-14 px-1.5 text-center font-mono tabular"
                        onChange={(e) =>
                          editor.updateRemoval(i, { qty: Number(e.target.value) || 0 })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={r.manufacturer}
                        className="h-8"
                        onChange={(e) =>
                          editor.updateRemoval(i, { manufacturer: e.target.value })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={r.model}
                        className="h-8 font-mono"
                        onChange={(e) =>
                          editor.updateRemoval(i, { model: e.target.value })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={r.description}
                        className="h-8"
                        onChange={(e) =>
                          editor.updateRemoval(i, { description: e.target.value })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={r.location ?? ""}
                        placeholder="—"
                        className="h-8"
                        onChange={(e) =>
                          editor.updateRemoval(i, {
                            location: e.target.value || null,
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => editor.removeRemoval(i)}
                      >
                        <Trash2 />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
