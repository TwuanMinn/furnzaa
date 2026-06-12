/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { Boxes, FileBox, Link2, Loader2, Search, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getBrowserClient } from "@/lib/supabase/client";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useSession } from "@/lib/rbac/context";
import { formatMoney } from "@/lib/format";
import { MODEL_FILE_EXTENSIONS, MODEL_FILE_MAX_BYTES, type ModelFile } from "@/lib/orders/schemas";

/** Minimal product hit for the line-item picker. */
export interface ProductHit {
  id: string;
  sku: string;
  name: string;
  selling_price_cents: number;
  current_stock: number;
}

/**
 * Per-line product picker: debounced catalog search (name/sku/barcode,
 * trigram-indexed); picking a product links the line (product_id) and
 * snapshots name + unit price into the form. Lines can stay free-text.
 */
export function ProductLinePicker({
  linked,
  onPick,
  onUnlink,
}: {
  linked: boolean;
  onPick: (product: ProductHit) => void;
  onUnlink: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query.trim(), 300);
  const [hits, setHits] = useState<ProductHit[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!open || debounced.length < 2) {
      setHits([]);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/products?q=${encodeURIComponent(debounced)}&limit=8`, { signal: controller.signal })
      .then(async (res) => (await res.json()) as { ok: boolean; data?: { rows: ProductHit[] } })
      .then((body) => {
        if (body.ok && body.data) setHits(body.data.rows);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [open, debounced]);

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  if (linked) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Unlink catalog product"
        title="Linked to a catalog product — click to unlink"
        onClick={onUnlink}
        className="text-primary"
      >
        <Link2 />
      </Button>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Pick a catalog product"
        title="Pick from the product catalog"
        onClick={() => setOpen((o) => !o)}
        className="text-muted-foreground"
      >
        <Boxes />
      </Button>
      <AnimatePresence>
        {open ? (
          <motion.div
            initial={reduce ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="absolute top-full right-0 z-30 mt-1 w-80 rounded-md border border-border bg-popover p-2 shadow-md"
          >
            <div className="relative mb-1.5">
              <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search products by name, SKU, barcode…"
                aria-label="Search products"
                className="h-8 pl-7 text-sm"
              />
              {loading ? (
                <Loader2 className="absolute top-1/2 right-2 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden />
              ) : null}
            </div>
            {debounced.length < 2 ? (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                Type at least 2 characters
              </p>
            ) : hits.length === 0 && !loading ? (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">No products found</p>
            ) : (
              <ul className="max-h-56 overflow-y-auto">
                {hits.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onPick(p);
                        setOpen(false);
                        setQuery("");
                      }}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{p.name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {p.sku} · {p.current_stock} in stock
                        </span>
                      </span>
                      <span className="shrink-0 text-xs tabular-nums">
                        {formatMoney(p.selling_price_cents)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** Hours + minutes entry that reads/writes ONE total-minutes value. */
export function HoursMinutesInput({
  id,
  label,
  totalMinutes,
  onChange,
}: {
  id: string;
  label: string;
  totalMinutes: number;
  onChange: (totalMinutes: number) => void;
}) {
  const hours = Math.floor((totalMinutes || 0) / 60);
  const minutes = (totalMinutes || 0) % 60;

  return (
    <div className="space-y-1.5">
      <span className="text-sm leading-none font-medium select-none">{label}</span>
      <div className="flex items-center gap-1.5">
        <Input
          id={`${id}-h`}
          type="number"
          min={0}
          max={8760}
          value={hours || ""}
          placeholder="0"
          aria-label={`${label} hours`}
          onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0) * 60 + minutes)}
          className="h-9 w-16 text-right"
        />
        <span className="text-sm text-muted-foreground">h</span>
        <Input
          id={`${id}-m`}
          type="number"
          min={0}
          max={59}
          value={minutes || ""}
          placeholder="0"
          aria-label={`${label} minutes`}
          onChange={(e) =>
            onChange(hours * 60 + Math.min(59, Math.max(0, Number(e.target.value) || 0)))
          }
          className="h-9 w-16 text-right"
        />
        <span className="text-sm text-muted-foreground">m</span>
      </div>
    </div>
  );
}

/** Multi-upload for 3D model files (.stl/.3mf/.step/.obj → 'models' bucket). */
export function ModelFilesField({
  files,
  onChange,
}: {
  files: ModelFile[];
  onChange: (files: ModelFile[]) => void;
}) {
  const session = useSession();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFiles(selected: FileList | null) {
    if (!selected || selected.length === 0) return;
    setUploading(true);
    try {
      const supabase = getBrowserClient();
      const added: ModelFile[] = [];
      for (const file of Array.from(selected)) {
        const ext = `.${file.name.split(".").pop()?.toLowerCase() ?? ""}`;
        if (!(MODEL_FILE_EXTENSIONS as readonly string[]).includes(ext)) {
          toast.error(`${file.name}: only ${MODEL_FILE_EXTENSIONS.join(", ")} files are allowed`);
          continue;
        }
        if (file.size > MODEL_FILE_MAX_BYTES) {
          toast.error(`${file.name}: larger than 100 MB`);
          continue;
        }
        const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(-80);
        const path = `${session.id}/${crypto.randomUUID()}-${safeName}`;
        const { error } = await supabase.storage.from("models").upload(path, file, {
          contentType: file.type || "application/octet-stream",
        });
        if (error) {
          toast.error(`${file.name}: ${error.message}`);
          continue;
        }
        added.push({
          name: file.name,
          path,
          size_bytes: file.size,
          mime: file.type || "application/octet-stream",
        });
      }
      if (added.length > 0) {
        onChange([...files, ...added].slice(0, 10));
        toast.success(`${added.length} model file(s) attached`);
      }
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <span className="text-sm leading-none font-medium select-none">
        3D model files (.stl, .3mf, .step, .obj)
      </span>
      {files.length > 0 ? (
        <ul className="space-y-1">
          {files.map((f) => (
            <li
              key={f.path}
              className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-sm"
            >
              <FileBox className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {(f.size_bytes / 1024 / 1024).toFixed(1)} MB
              </span>
              <button
                type="button"
                aria-label={`Remove ${f.name}`}
                onClick={() => onChange(files.filter((x) => x.path !== f.path))}
                className="shrink-0 text-muted-foreground hover:text-destructive"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={MODEL_FILE_EXTENSIONS.join(",")}
        className="sr-only"
        onChange={(e) => {
          void handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? <Loader2 className="animate-spin" /> : <FileBox />}
        Attach model files
      </Button>
    </div>
  );
}
