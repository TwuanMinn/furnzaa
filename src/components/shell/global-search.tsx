"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { NAV_ITEMS } from "@/config/nav";
import { usePermissions } from "@/lib/rbac/context";

/**
 * Command-palette style page jumper. Opens on Ctrl/Cmd+K or via the trigger,
 * and (for now) lists permission-filtered navigation destinations. Full-text
 * search across records is stubbed as a forthcoming feature.
 */
export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { has } = usePermissions();

  const items = NAV_ITEMS.filter((item) =>
    item.permission ? has(item.permission) : true,
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  function go(href: string) {
    router.push(href);
    setOpen(false);
  }

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="w-full justify-start gap-2 text-muted-foreground"
      >
        <Search className="size-4 shrink-0" aria-hidden />
        <span>Search...</span>
        <kbd className="ml-auto inline-flex items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
          Ctrl K
        </kbd>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search pages..." />
        <CommandList>
          <CommandEmpty>No results.</CommandEmpty>

          <CommandGroup heading="Navigation">
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <CommandItem
                  key={item.href}
                  value={item.label}
                  onSelect={() => go(item.href)}
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  <span>{item.label}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>

          <CommandGroup heading="Tip">
            <CommandItem disabled>
              Full search across orders, customers &amp; messages — coming soon
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
