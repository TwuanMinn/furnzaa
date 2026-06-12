"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { badgeClass } from "@/lib/badges";
import { centsToDecimalString, formatMoney, toCents } from "@/lib/format";
import {
  deletePrinterAction,
  savePrinterAction,
  setPrinterActiveAction,
  updateMaterialsAction,
  updateOrderConfigAction,
} from "@/lib/settings/actions";
import type { OrdersConfigData } from "./types";
import { ColorSelect, newRid, slugifyKey, toBadgeColor } from "./orders-shared";

/** Statuses the stock/CRM hooks key on — re-label freely, never removable. */
const ENGINE_KEYS: readonly string[] = ["delivered", "shipped", "returned", "cancelled"];

const MAX_STATUSES = 20;
const MIN_STATUSES = 2;
const MAX_PRIORITIES = 10;
const MIN_PRIORITIES = 2;
const MAX_FIELDS = 12;
const MAX_MATERIALS = 40;

/** key === null ⇒ a new row; its permanent key is slugged from the label on save. */
type StatusRow = { rid: string; key: string | null; label: string; color: string; isFinal: boolean };
type PriorityRow = { rid: string; key: string | null; label: string; color: string };
type FieldRow = { rid: string; key: string | null; label: string; type: "text" | "number" | "date" };
type MaterialRow = {
  rid: string;
  key: string | null;
  label: string;
  color: string;
  /** Display units (đồng/dollars) as typed; converted with toCents on save. */
  cost: string;
  isActive: boolean;
};
type PrinterRow = {
  rid: string;
  id: string | null;
  brand: string;
  model: string;
  badgeColor: string;
  isActive: boolean;
  busy: boolean;
};

function patchRow<T extends { rid: string }>(
  set: Dispatch<SetStateAction<T[]>>,
  rid: string,
  patch: Partial<T>,
) {
  set((prev) => prev.map((r) => (r.rid === rid ? { ...r, ...patch } : r)));
}

/** Existing rows keep their key forever; new rows get a unique slug of their label. */
function assignKeys<T extends { key: string | null; label: string }>(
  rows: T[],
): (T & { key: string })[] {
  const taken = new Set(rows.map((r) => r.key).filter((k): k is string => k !== null));
  return rows.map((r) => {
    if (r.key) return { ...r, key: r.key };
    const base = slugifyKey(r.label).slice(0, 36);
    let key = base;
    for (let n = 2; taken.has(key); n += 1) key = `${base}_${n}`;
    taken.add(key);
    return { ...r, key };
  });
}

function BadgePreview({ label, color }: { label: string; color: string }) {
  return (
    <span
      className={`inline-flex max-w-36 items-center truncate rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${badgeClass(color)}`}
    >
      {label.trim() || "—"}
    </span>
  );
}

/**
 * Orders & Printing configuration. Statuses / priorities / order code / custom
 * fields commit together via updateOrderConfigAction; materials save separately;
 * printers are live catalog rows with per-row save/toggle/delete.
 */
export function OrdersSection({ data, canEdit }: { data: OrdersConfigData; canEdit: boolean }) {
  const router = useRouter();

  const [statuses, setStatuses] = useState<StatusRow[]>(() =>
    data.statuses.map((s) => ({ rid: s.key, key: s.key, label: s.label, color: s.color, isFinal: s.isFinal })),
  );
  const [priorities, setPriorities] = useState<PriorityRow[]>(() =>
    data.priorities.map((p) => ({ rid: p.key, key: p.key, label: p.label, color: p.color })),
  );
  const [fields, setFields] = useState<FieldRow[]>(() =>
    data.customFields.map((f) => ({ rid: f.key, key: f.key, label: f.label, type: f.type })),
  );
  const [codePrefix, setCodePrefix] = useState(data.codePrefix);
  const [codeFormat, setCodeFormat] = useState(data.codeFormat);
  const [savingConfig, setSavingConfig] = useState(false);

  const [materials, setMaterials] = useState<MaterialRow[]>(() =>
    data.materials.map((m) => ({
      rid: m.key,
      key: m.key,
      label: m.label,
      color: m.color,
      cost: centsToDecimalString(m.costPerGramCents, data.currency),
      isActive: m.isActive,
    })),
  );
  const [savingMaterials, setSavingMaterials] = useState(false);

  const [printers, setPrinters] = useState<PrinterRow[]>(() =>
    data.printers.map((p) => ({
      rid: p.id,
      id: p.id,
      brand: p.brand,
      model: p.model,
      badgeColor: p.badgeColor,
      isActive: p.isActive,
      busy: false,
    })),
  );

  const codePreview = codeFormat
    .replaceAll("{prefix}", codePrefix || "ORD")
    .replaceAll("{yyyy}", String(new Date().getFullYear()))
    .replaceAll("{seq}", "000128");

  async function saveConfig() {
    if (
      statuses.some((s) => !s.label.trim()) ||
      priorities.some((p) => !p.label.trim()) ||
      fields.some((f) => !f.label.trim())
    ) {
      toast.error("Every row needs a label");
      return;
    }
    if (!codeFormat.includes("{seq}")) {
      toast.error("Code format must include {seq}");
      return;
    }
    const keyedStatuses = assignKeys(statuses);
    const keyedPriorities = assignKeys(priorities);
    const keyedFields = assignKeys(fields);
    setSavingConfig(true);
    try {
      const res = await updateOrderConfigAction({
        statuses: keyedStatuses.map((s) => ({
          key: s.key,
          label: s.label.trim(),
          color: toBadgeColor(s.color),
          isFinal: s.isFinal,
        })),
        priorities: keyedPriorities.map((p) => ({
          key: p.key,
          label: p.label.trim(),
          color: toBadgeColor(p.color),
        })),
        codePrefix: codePrefix.trim().toUpperCase(),
        codeFormat: codeFormat.trim(),
        customFields: keyedFields.map((f) => ({ key: f.key, label: f.label.trim(), type: f.type })),
      });
      if (res.ok) {
        // New rows now hold their permanent keys — keep local state in sync.
        setStatuses(keyedStatuses);
        setPriorities(keyedPriorities);
        setFields(keyedFields);
        toast.success("Order configuration saved");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    } finally {
      setSavingConfig(false);
    }
  }

  async function saveMaterials() {
    if (materials.some((m) => !m.label.trim())) {
      toast.error("Every material needs a label");
      return;
    }
    if (materials.some((m) => Number(m.cost) < 0 || !Number.isFinite(Number(m.cost)))) {
      toast.error("Costs must be zero or more");
      return;
    }
    const keyed = assignKeys(materials);
    setSavingMaterials(true);
    try {
      const res = await updateMaterialsAction({
        materials: keyed.map((m) => ({
          key: m.key,
          label: m.label.trim(),
          color: toBadgeColor(m.color),
          costPerGramCents: toCents(m.cost),
          isActive: m.isActive,
        })),
      });
      if (res.ok) {
        setMaterials(keyed);
        toast.success("Materials saved");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    } finally {
      setSavingMaterials(false);
    }
  }

  async function savePrinter(row: PrinterRow) {
    if (!row.brand.trim() || !row.model.trim()) {
      toast.error("Brand and model are required");
      return;
    }
    patchRow(setPrinters, row.rid, { busy: true });
    try {
      const res = await savePrinterAction({
        id: row.id ?? undefined,
        brand: row.brand.trim(),
        model: row.model.trim(),
        badgeColor: toBadgeColor(row.badgeColor),
      });
      if (res.ok) {
        patchRow(setPrinters, row.rid, { id: res.data.id });
        toast.success(row.id ? "Printer updated" : "Printer added");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    } finally {
      patchRow(setPrinters, row.rid, { busy: false });
    }
  }

  async function togglePrinter(row: PrinterRow, active: boolean) {
    if (!row.id) return;
    patchRow(setPrinters, row.rid, { isActive: active, busy: true });
    const res = await setPrinterActiveAction(row.id, active);
    patchRow(setPrinters, row.rid, { busy: false, ...(res.ok ? {} : { isActive: !active }) });
    if (res.ok) router.refresh();
    else toast.error(res.error);
  }

  async function removePrinter(row: PrinterRow) {
    if (!row.id) {
      setPrinters((prev) => prev.filter((r) => r.rid !== row.rid));
      return;
    }
    patchRow(setPrinters, row.rid, { busy: true });
    const res = await deletePrinterAction(row.id);
    if (res.ok) {
      setPrinters((prev) => prev.filter((r) => r.rid !== row.rid));
      toast.success("Printer removed");
      router.refresh();
    } else {
      patchRow(setPrinters, row.rid, { busy: false });
      toast.error(res.error);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Order statuses</CardTitle>
          <CardDescription>
            The pipeline every order moves through. Existing orders keep their status when you
            rename; locked statuses drive the inventory/CRM hooks and cannot be removed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {statuses.map((row) => {
            const locked = row.key !== null && ENGINE_KEYS.includes(row.key);
            return (
              <div key={row.rid} className="flex flex-wrap items-center gap-2">
                <Input
                  value={row.label}
                  maxLength={40}
                  disabled={!canEdit}
                  onChange={(e) => patchRow(setStatuses, row.rid, { label: e.target.value })}
                  className="h-8 w-44"
                  aria-label="Status label"
                />
                <ColorSelect
                  value={row.color}
                  onChange={(c) => patchRow(setStatuses, row.rid, { color: c })}
                  disabled={!canEdit}
                  className="h-8 w-28"
                  ariaLabel={`${row.label || "status"} color`}
                />
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Switch
                    checked={row.isFinal}
                    onCheckedChange={(v) => patchRow(setStatuses, row.rid, { isFinal: v })}
                    disabled={!canEdit}
                    aria-label={`${row.label || "status"} is final`}
                  />
                  Final
                </span>
                <BadgePreview label={row.label} color={row.color} />
                <code className="text-xs text-muted-foreground">
                  {row.key ?? slugifyKey(row.label)}
                </code>
                {locked ? (
                  <span title="Required by the inventory/CRM hooks">
                    <Lock className="size-3.5 text-muted-foreground" aria-label="Locked status" />
                  </span>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    disabled={!canEdit || statuses.length <= MIN_STATUSES}
                    onClick={() => setStatuses((prev) => prev.filter((r) => r.rid !== row.rid))}
                    aria-label={`Remove ${row.label || "status"}`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            );
          })}
          {canEdit ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={statuses.length >= MAX_STATUSES}
              onClick={() => {
                // Row built outside the updater: newRid() is impure and StrictMode
                // double-invokes updater functions in dev.
                const row: StatusRow = { rid: newRid(), key: null, label: "", color: "slate", isFinal: false };
                setStatuses((prev) => [...prev, row]);
              }}
            >
              <Plus className="size-4" />
              Add status
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Order priorities</CardTitle>
          <CardDescription>Urgency levels available on the order form.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {priorities.map((row) => (
            <div key={row.rid} className="flex flex-wrap items-center gap-2">
              <Input
                value={row.label}
                maxLength={40}
                disabled={!canEdit}
                onChange={(e) => patchRow(setPriorities, row.rid, { label: e.target.value })}
                className="h-8 w-44"
                aria-label="Priority label"
              />
              <ColorSelect
                value={row.color}
                onChange={(c) => patchRow(setPriorities, row.rid, { color: c })}
                disabled={!canEdit}
                className="h-8 w-28"
                ariaLabel={`${row.label || "priority"} color`}
              />
              <BadgePreview label={row.label} color={row.color} />
              <code className="text-xs text-muted-foreground">
                {row.key ?? slugifyKey(row.label)}
              </code>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                disabled={!canEdit || priorities.length <= MIN_PRIORITIES}
                onClick={() => setPriorities((prev) => prev.filter((r) => r.rid !== row.rid))}
                aria-label={`Remove ${row.label || "priority"}`}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          {canEdit ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={priorities.length >= MAX_PRIORITIES}
              onClick={() => {
                const row: PriorityRow = { rid: newRid(), key: null, label: "", color: "slate" };
                setPriorities((prev) => [...prev, row]);
              }}
            >
              <Plus className="size-4" />
              Add priority
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Order code</CardTitle>
          <CardDescription>
            Numbering for new orders. Existing order codes never change.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ord-code-prefix">Code prefix</Label>
              <Input
                id="ord-code-prefix"
                value={codePrefix}
                maxLength={8}
                disabled={!canEdit}
                onChange={(e) => setCodePrefix(e.target.value.toUpperCase())}
              />
              <p className="text-xs text-muted-foreground">1-8 uppercase letters or digits</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ord-code-format">Code format</Label>
              <Input
                id="ord-code-format"
                value={codeFormat}
                maxLength={60}
                disabled={!canEdit}
                onChange={(e) => setCodeFormat(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Tokens: {"{prefix}"}, {"{yyyy}"}, {"{seq}"} (required). Preview:{" "}
                <span className="font-medium text-foreground">{codePreview}</span>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Custom order fields</CardTitle>
          <CardDescription>
            Extra inputs shown on the order form (e.g. engraving text). Up to {MAX_FIELDS}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {fields.length === 0 ? (
            <p className="text-sm text-muted-foreground">No custom fields yet.</p>
          ) : null}
          {fields.map((row) => (
            <div key={row.rid} className="flex flex-wrap items-center gap-2">
              <Input
                value={row.label}
                maxLength={60}
                disabled={!canEdit}
                onChange={(e) => patchRow(setFields, row.rid, { label: e.target.value })}
                className="h-8 w-52"
                aria-label="Field label"
              />
              <Select
                value={row.type}
                onValueChange={(v: string) =>
                  patchRow(setFields, row.rid, {
                    type: v === "number" || v === "date" ? v : "text",
                  })
                }
                disabled={!canEdit}
              >
                <SelectTrigger className="h-8 w-28" aria-label={`${row.label || "field"} type`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="number">Number</SelectItem>
                  <SelectItem value="date">Date</SelectItem>
                </SelectContent>
              </Select>
              <code className="text-xs text-muted-foreground">
                {row.key ?? slugifyKey(row.label)}
              </code>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                disabled={!canEdit}
                onClick={() => setFields((prev) => prev.filter((r) => r.rid !== row.rid))}
                aria-label={`Remove ${row.label || "field"}`}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <div className="flex items-center justify-between gap-2">
            {canEdit ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={fields.length >= MAX_FIELDS}
                onClick={() => {
                  const row: FieldRow = { rid: newRid(), key: null, label: "", type: "text" };
                  setFields((prev) => [...prev, row]);
                }}
              >
                <Plus className="size-4" />
                Add field
              </Button>
            ) : (
              <span />
            )}
            {canEdit ? (
              <Button onClick={() => void saveConfig()} disabled={savingConfig}>
                {savingConfig ? <Loader2 className="size-4 animate-spin" /> : null}
                Save order configuration
              </Button>
            ) : null}
          </div>
          {canEdit ? (
            <p className="text-right text-xs text-muted-foreground">
              Saves statuses, priorities, order code and custom fields together.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Materials</CardTitle>
          <CardDescription>
            Filaments/resins selectable on orders; cost per gram feeds the cost calculator.
            Deactivate instead of deleting to keep history intact.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {materials.map((row) => (
            <div key={row.rid} className="flex flex-wrap items-center gap-2">
              <Input
                value={row.label}
                maxLength={40}
                disabled={!canEdit}
                onChange={(e) => patchRow(setMaterials, row.rid, { label: e.target.value })}
                className="h-8 w-40"
                aria-label="Material label"
              />
              <ColorSelect
                value={row.color}
                onChange={(c) => patchRow(setMaterials, row.rid, { color: c })}
                disabled={!canEdit}
                className="h-8 w-28"
                ariaLabel={`${row.label || "material"} color`}
              />
              <Input
                type="number"
                min={0}
                step="0.01"
                value={row.cost}
                disabled={!canEdit}
                onChange={(e) => patchRow(setMaterials, row.rid, { cost: e.target.value })}
                className="h-8 w-28"
                aria-label={`${row.label || "material"} cost per gram`}
              />
              <span className="text-xs text-muted-foreground">
                {formatMoney(toCents(row.cost), data.currency)}/g
              </span>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Switch
                  checked={row.isActive}
                  onCheckedChange={(v) => patchRow(setMaterials, row.rid, { isActive: v })}
                  disabled={!canEdit}
                  aria-label={`${row.label || "material"} active`}
                />
                Active
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                disabled={!canEdit || materials.length <= 1}
                onClick={() => setMaterials((prev) => prev.filter((r) => r.rid !== row.rid))}
                aria-label={`Remove ${row.label || "material"}`}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <div className="flex items-center justify-between gap-2">
            {canEdit ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={materials.length >= MAX_MATERIALS}
                onClick={() => {
                  const row: MaterialRow = {
                    rid: newRid(),
                    key: null,
                    label: "",
                    color: "slate",
                    cost: "0",
                    isActive: true,
                  };
                  setMaterials((prev) => [...prev, row]);
                }}
              >
                <Plus className="size-4" />
                Add material
              </Button>
            ) : (
              <span />
            )}
            {canEdit ? (
              <Button onClick={() => void saveMaterials()} disabled={savingMaterials}>
                {savingMaterials ? <Loader2 className="size-4 animate-spin" /> : null}
                Save materials
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Printers</CardTitle>
          <CardDescription>
            Catalog used by order assignment and the Now Printing widget. Each row saves on its
            own; deactivating hides a printer from new orders, removing keeps it on past orders.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {printers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No printers in the catalog yet.</p>
          ) : null}
          {printers.map((row) => (
            <div key={row.rid} className="flex flex-wrap items-center gap-2">
              <Input
                value={row.brand}
                placeholder="Brand"
                maxLength={60}
                disabled={!canEdit}
                onChange={(e) => patchRow(setPrinters, row.rid, { brand: e.target.value })}
                className="h-8 w-36"
                aria-label="Printer brand"
              />
              <Input
                value={row.model}
                placeholder="Model"
                maxLength={60}
                disabled={!canEdit}
                onChange={(e) => patchRow(setPrinters, row.rid, { model: e.target.value })}
                className="h-8 w-36"
                aria-label="Printer model"
              />
              <ColorSelect
                value={row.badgeColor}
                onChange={(c) => patchRow(setPrinters, row.rid, { badgeColor: c })}
                disabled={!canEdit}
                className="h-8 w-28"
                ariaLabel={`${row.brand} ${row.model} color`.trim()}
              />
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Switch
                  checked={row.isActive}
                  onCheckedChange={(v) => void togglePrinter(row, v)}
                  disabled={!canEdit || !row.id || row.busy}
                  aria-label={`${row.brand} ${row.model} active`.trim()}
                />
                Active
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8"
                disabled={!canEdit || row.busy || !row.brand.trim() || !row.model.trim()}
                onClick={() => void savePrinter(row)}
              >
                {row.busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
                {row.id ? "Save" : "Add"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                disabled={!canEdit || row.busy}
                onClick={() => void removePrinter(row)}
                aria-label={`Remove ${row.brand} ${row.model}`.trim()}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          {canEdit ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const row: PrinterRow = {
                  rid: newRid(),
                  id: null,
                  brand: "",
                  model: "",
                  badgeColor: "slate",
                  isActive: true,
                  busy: false,
                };
                setPrinters((prev) => [...prev, row]);
              }}
            >
              <Plus className="size-4" />
              Add printer
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
