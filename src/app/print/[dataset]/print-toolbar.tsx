"use client";

import { useEffect } from "react";
import { Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Print/close actions shown on screen only (hidden via print:hidden). */
export function PrintToolbar() {
  useEffect(() => {
    // Give fonts/logo a beat to load, then open the dialog automatically.
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="mb-6 flex items-center justify-end gap-2 print:hidden">
      <Button variant="outline" size="sm" onClick={() => window.close()}>
        <X /> Close
      </Button>
      <Button size="sm" onClick={() => window.print()}>
        <Printer /> Print
      </Button>
    </div>
  );
}
