/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { Check, Monitor, Moon, Sun } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const THEMES = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

/**
 * Theme switcher: a ghost icon button that animates a Sun/Moon swap based on the
 * resolved theme and opens a menu to pick Light / Dark / System. Renders a neutral
 * Sun until mounted to avoid a hydration mismatch (server has no theme knowledge).
 */
export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const reduce = useReducedMotion();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Before mount the resolved theme is unknown — show a stable, neutral icon.
  const isDark = mounted && resolvedTheme === "dark";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Toggle theme">
          <span className="relative flex size-5 items-center justify-center">
            {!mounted ? (
              <Sun className="size-5" aria-hidden />
            ) : (
              <AnimatePresence initial={false} mode="popLayout">
                {isDark ? (
                  <motion.span
                    key="moon"
                    className="absolute inset-0 flex items-center justify-center"
                    initial={reduce ? false : { opacity: 0, rotate: -90, scale: 0.6 }}
                    animate={{ opacity: 1, rotate: 0, scale: 1 }}
                    exit={reduce ? { opacity: 0 } : { opacity: 0, rotate: 90, scale: 0.6 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                  >
                    <Moon className="size-5" aria-hidden />
                  </motion.span>
                ) : (
                  <motion.span
                    key="sun"
                    className="absolute inset-0 flex items-center justify-center"
                    initial={reduce ? false : { opacity: 0, rotate: 90, scale: 0.6 }}
                    animate={{ opacity: 1, rotate: 0, scale: 1 }}
                    exit={reduce ? { opacity: 0 } : { opacity: 0, rotate: -90, scale: 0.6 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                  >
                    <Sun className="size-5" aria-hidden />
                  </motion.span>
                )}
              </AnimatePresence>
            )}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-36">
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {THEMES.map(({ value, label, icon: Icon }) => {
          const active = mounted && theme === value;
          return (
            <DropdownMenuItem
              key={value}
              onSelect={() => setTheme(value)}
              className={cn("gap-2", active && "font-medium")}
            >
              <Icon className="size-4" aria-hidden />
              <span>{label}</span>
              {active ? (
                <Check className="ml-auto size-4 text-foreground" aria-hidden />
              ) : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
