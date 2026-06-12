"use client";

import { useState } from "react";
import { Download, FileBox, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { getModelFileUrlAction } from "@/lib/orders/actions";
import type { ModelFile } from "@/lib/orders/schemas";

/** Downloadable 3D model files (signed URLs after the RLS-scoped check). */
export function ModelFileList({ orderId, files }: { orderId: string; files: ModelFile[] }) {
  const [busyPath, setBusyPath] = useState<string | null>(null);

  async function download(file: ModelFile) {
    setBusyPath(file.path);
    try {
      const result = await getModelFileUrlAction(orderId, file.path);
      if (result.ok) window.open(result.url, "_blank", "noopener");
      else toast.error(result.error);
    } finally {
      setBusyPath(null);
    }
  }

  if (files.length === 0) return null;

  return (
    <ul className="space-y-1.5">
      {files.map((file) => (
        <li key={file.path}>
          <button
            type="button"
            disabled={busyPath !== null}
            onClick={() => void download(file)}
            className="flex w-full items-center gap-2 rounded-md border border-border bg-card px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent disabled:opacity-60"
          >
            <FileBox className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{file.name}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {(file.size_bytes / 1024 / 1024).toFixed(1)} MB
            </span>
            {busyPath === file.path ? (
              <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />
            ) : (
              <Download className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
