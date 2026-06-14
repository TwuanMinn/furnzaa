"use client";

import { usePathname } from "next/navigation";

/**
 * App-shell route transition. The `key={pathname}` is the crucial bit: it forces
 * React to mount a FRESH wrapper element on every navigation, so the CSS
 * `animate-route-enter` (a fade + rise) replays each time you move between
 * sections — without it, the div is reused and the animation only fires once.
 *
 * The animation has NO fill-mode (see globals.css), so the resting state is
 * always fully visible — it can never get stuck at opacity:0. The global
 * prefers-reduced-motion guard zeroes its duration for accessibility.
 */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="animate-route-enter">
      {children}
    </div>
  );
}
