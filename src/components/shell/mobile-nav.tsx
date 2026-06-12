"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, PackageCheck } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { NAV_ITEMS } from "@/config/nav";
import { usePermissions } from "@/lib/rbac/context";

/**
 * Slide-in navigation drawer for small viewports. The trigger is hidden on
 * md+ screens where the persistent sidebar takes over. Selecting a link closes
 * the sheet so the destination renders unobstructed.
 */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { has } = usePermissions();

  const items = NAV_ITEMS.filter((item) =>
    item.permission ? has(item.permission) : true,
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-label="Open menu"
        >
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>

      <SheetContent
        side="left"
        className="w-72 bg-sidebar p-0 text-sidebar-foreground"
      >
        <SheetHeader className="border-b border-sidebar-border p-4">
          <SheetTitle className="flex items-center gap-2 text-sidebar-foreground">
            <span
              aria-hidden
              className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm"
            >
              <PackageCheck className="size-5" />
            </span>
            <span className="text-lg font-semibold tracking-tight">Furnza</span>
          </SheetTitle>
        </SheetHeader>

        <nav aria-label="Primary" className="flex flex-col gap-1 p-3">
          {items.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active &&
                    "bg-sidebar-accent text-sidebar-accent-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
