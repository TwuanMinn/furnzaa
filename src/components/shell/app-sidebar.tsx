"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronsLeft,
  ChevronsRight,
  PackageCheck,
  Search,
  LayoutDashboard,
  Users,
  ShoppingBag,
  CalendarClock,
  Box,
  TrendingUp,
  Crown,
  Flame,
  Megaphone,
  Bell,
  MessageSquare,
  MessageSquareWarning,
  CircleDollarSign,
  PiggyBank,
  BarChart3,
  Settings,
  MoreHorizontal,
  LogOut,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSession, usePermissions } from "@/lib/rbac/context";
import { initials } from "@/lib/format";
import { signOutAction } from "@/lib/auth/actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { PermissionKey } from "@/lib/rbac/permissions";
import { toggleSidebarAction } from "@/lib/auth/actions";

const EXPANDED_WIDTH = "16rem";
const COLLAPSED_WIDTH = "4.5rem";

interface SidebarItem {
  label: string;
  href: string;
  icon: LucideIcon;
  permission?: PermissionKey;
  badgeKey?: "orders" | "lowStock" | "notifications" | "printing" | "feedback" | "messages" | "roi";
}

interface SidebarSection {
  title: string;
  items: SidebarItem[];
}

const SECTIONS: SidebarSection[] = [
  {
    title: "MAIN",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, permission: "dashboard.view" },
      { label: "User", href: "/users", icon: Users, permission: "users.view" },
      { label: "Orders", href: "/orders", icon: ShoppingBag, permission: "orders.view", badgeKey: "orders" },
      { label: "Schedule", href: "/schedule", icon: CalendarClock, permission: "schedule.view", badgeKey: "printing" },
      { label: "Inventory", href: "/products", icon: Box, permission: "products.view", badgeKey: "lowStock" },
    ],
  },
  {
    title: "GROWTH",
    items: [
      { label: "Analytics", href: "/analytics", icon: TrendingUp, permission: "analytics.view" },
      { label: "Loyalty", href: "/crm", icon: Crown, permission: "crm.view" },
      { label: "Trending", href: "/trending", icon: Flame, permission: "trends.create" },
      { label: "Feedback", href: "/feedback", icon: MessageSquareWarning, permission: "feedback.create", badgeKey: "feedback" },
      { label: "Campaigns", href: "/marketing", icon: Megaphone, permission: "campaigns.view" },
    ],
  },
  {
    title: "SYSTEM",
    items: [
      { label: "Notifications", href: "/notifications", icon: Bell, permission: "notifications.view", badgeKey: "notifications" },
      { label: "Messages", href: "/messages", icon: MessageSquare, permission: "messages.view", badgeKey: "messages" },
      { label: "Profit", href: "/profit", icon: CircleDollarSign, permission: "profit.view" },
      { label: "ROI", href: "/roi", icon: PiggyBank, permission: "roi.view", badgeKey: "roi" },
      { label: "Activity log", href: "/activity", icon: BarChart3, permission: "logs.view" },
    ],
  },
];

const SETTINGS_ITEM: SidebarItem = {
  label: "Settings",
  href: "/settings",
  icon: Settings,
};

export function AppSidebar({ initialCollapsed }: { initialCollapsed: boolean }) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [searchQuery, setSearchQuery] = useState("");
  const pathname = usePathname();
  const reduce = useReducedMotion();
  const { has } = usePermissions();
  const user = useSession();

  // Fetch dynamic counts (orders, products lowStock)
  const { data: counts } = useQuery({
    queryKey: ["sidebar-counts"],
    queryFn: async () => {
      const res = await fetch("/api/sidebar-counts");
      if (!res.ok) throw new Error("Failed to fetch sidebar counts");
      const body = await res.json();
      return body.data as {
        orders: number;
        lowStock: number;
        printing: number;
        feedback: number;
        messages: number;
        roi: number;
      };
    },
    refetchInterval: 30_000,
  });

  // Fetch notifications unread count (cached & synced with notification-bell.tsx)
  const { data: notificationsData } = useQuery({
    queryKey: ["notifications", "bell"],
    queryFn: async () => {
      const res = await fetch("/api/notifications?limit=8");
      const body = await res.json();
      return body.data;
    },
    enabled: has("notifications.view"),
    staleTime: 30_000,
  });

  const badgeCounts: Record<string, number> = {
    orders: counts?.orders ?? 0,
    lowStock: counts?.lowStock ?? 0,
    printing: counts?.printing ?? 0,
    feedback: counts?.feedback ?? 0,
    messages: counts?.messages ?? 0,
    roi: counts?.roi ?? 0,
    notifications: notificationsData?.unread ?? 0,
  };

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    void toggleSidebarAction(next);
  }

  // Filter sections and items based on search query
  const sections = SECTIONS.map((section) => {
    const filteredItems = section.items
      .filter((item) => (item.permission ? has(item.permission) : true))
      .filter((item) =>
        item.label.toLowerCase().includes(searchQuery.toLowerCase())
      );
    return {
      ...section,
      items: filteredItems,
    };
  }).filter((section) => section.items.length > 0);

  const showSettings = !searchQuery || SETTINGS_ITEM.label.toLowerCase().includes(searchQuery.toLowerCase());

  return (
    <motion.aside
      data-sidebar={collapsed ? "collapsed" : "expanded"}
      initial={false}
      animate={{ width: collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH }}
      transition={reduce ? { duration: 0 } : { duration: 0.2, ease: "easeOut" }}
      className="sticky top-0 hidden h-dvh flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex"
    >
      {/* Brand & Collapse Toggle */}
      <div
        className={cn(
          "flex h-16 shrink-0 items-center justify-between px-3 border-b border-sidebar-border/50",
          collapsed && "justify-center",
        )}
      >
        {!collapsed ? (
          <>
            <div className="flex items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                <PackageCheck className="size-5" aria-hidden />
              </div>
              <AnimatePresence initial={false}>
                <motion.span
                  key="wordmark"
                  initial={reduce ? false : { opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, x: -6 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="truncate text-lg font-semibold tracking-tight"
                >
                  Furnza
                </motion.span>
              </AnimatePresence>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={toggle}
              aria-label="Collapse sidebar"
              className="size-8 text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground shrink-0"
            >
              <ChevronsLeft className="size-4.5" />
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={toggle}
            aria-label="Expand sidebar"
            className="size-9 text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
          >
            <ChevronsRight className="size-5" />
          </Button>
        )}
      </div>

      {/* Search Filter */}
      {!collapsed && (
        <div className="px-3 pt-3 pb-1 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-sidebar-foreground/50" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 w-full rounded-lg bg-sidebar-accent/30 pl-9 pr-3 text-sm placeholder:text-sidebar-foreground/50 border border-sidebar-border/50 outline-none focus:bg-sidebar-accent/50 focus:border-primary/50 transition-colors text-sidebar-foreground"
            />
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav
        aria-label="Primary"
        className="scrollbar-thin flex-1 overflow-y-auto px-2 py-2 flex flex-col justify-between"
      >
        <div className="flex flex-col gap-4">
          {sections.map((section, idx) => (
            <div key={section.title} className={cn("flex flex-col gap-0.5", idx > 0 && "mt-1")}>
              {!collapsed ? (
                <div className="px-3 pt-3 pb-1 text-[10px] font-bold tracking-wider text-sidebar-foreground/50 uppercase">
                  {section.title}
                </div>
              ) : (
                idx > 0 && <div className="mx-2 my-1.5 border-t border-sidebar-border/50" />
              )}
              <ul className="flex flex-col gap-1">
                {section.items.map((item) => (
                  <li key={item.href}>
                    <NavLink
                      item={item}
                      pathname={pathname}
                      collapsed={collapsed}
                      reduce={reduce}
                      badgeValue={badgeCounts[item.badgeKey ?? ""]}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Settings at the bottom of nav */}
        {showSettings && (
          <div className={cn("pt-4 mt-auto shrink-0", collapsed && "border-t border-sidebar-border/50 pt-2 mt-2")}>
            <NavLink
              item={SETTINGS_ITEM}
              pathname={pathname}
              collapsed={collapsed}
              reduce={reduce}
            />
          </div>
        )}
      </nav>

      {/* User Profile Block */}
      <div className="mt-auto border-t border-sidebar-border/50 p-3 shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                "flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-sidebar-accent/60 outline-none focus-visible:ring-2 focus-visible:ring-ring/50 cursor-pointer",
                collapsed && "justify-center p-0 hover:bg-transparent"
              )}
            >
              <Avatar className="size-9 shrink-0 ring-1 ring-sidebar-border/50">
                {user.avatarUrl ? (
                  <AvatarImage src={user.avatarUrl} alt={user.fullName} />
                ) : null}
                <AvatarFallback className="bg-primary/10 text-primary font-semibold text-sm">
                  {initials(user.fullName)}
                </AvatarFallback>
              </Avatar>

              {!collapsed && (
                <>
                  <div className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-sidebar-foreground truncate">
                      {user.fullName}
                    </span>
                    <span className="block text-xs text-sidebar-foreground/60 truncate">
                      {user.roleName}
                    </span>
                  </div>
                  <MoreHorizontal className="size-4.5 text-sidebar-foreground/50 shrink-0" />
                </>
              )}
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align={collapsed ? "start" : "end"} side={collapsed ? "right" : "top"} className="w-56 ml-2">
            <DropdownMenuLabel className="flex flex-col gap-1 font-normal">
              <span className="text-sm font-medium leading-none">{user.fullName}</span>
              <span className="truncate text-xs text-muted-foreground">{user.email}</span>
              <span className="mt-1 w-fit rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                {user.roleName}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings" className="w-full flex items-center">
                <Settings className="size-4 mr-2" aria-hidden="true" />
                Profile &amp; settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <form action={signOutAction} className="w-full">
              <button
                type="submit"
                className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-destructive outline-none transition-colors hover:bg-destructive/10 focus-visible:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <LogOut className="size-4" aria-hidden="true" />
                Sign out
              </button>
            </form>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </motion.aside>
  );
}

interface NavLinkProps {
  item: SidebarItem;
  pathname: string;
  collapsed: boolean;
  reduce: boolean | null;
  badgeValue?: number;
}

function NavLink({ item, pathname, collapsed, reduce, badgeValue }: NavLinkProps) {
  const Icon = item.icon;
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
  const showBadge = badgeValue !== undefined && badgeValue > 0;

  const badgeElement = showBadge ? (
    <span
      className={cn(
        "font-semibold text-[10px] min-w-5 h-5 flex items-center justify-center rounded-full px-1.5 transition-colors shrink-0",
        item.badgeKey === "orders"
          ? "bg-blue-500/20 text-blue-500 dark:text-blue-300"
          : "bg-red-500/20 text-red-500 dark:text-red-300"
      )}
    >
      {badgeValue}
    </span>
  ) : null;

  const link = (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        collapsed && "justify-center px-0",
        active
          ? "bg-primary/10 text-primary dark:bg-primary/15"
          : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
      )}
    >
      {/* Left-edge vertical pill indicator */}
      {active && (
        <span className="absolute left-[-8px] top-2 bottom-2 w-1 rounded-r-md bg-primary" />
      )}

      <div className="relative shrink-0">
        <Icon className="size-5 shrink-0" aria-hidden />
        {collapsed && showBadge && (
          <span
            className={cn(
              "absolute -top-1 -right-1 size-2 rounded-full ring-1 ring-sidebar",
              item.badgeKey === "orders" ? "bg-blue-500" : "bg-red-500"
            )}
          />
        )}
      </div>

      <AnimatePresence initial={false}>
        {!collapsed ? (
          <motion.span
            key="label"
            initial={reduce ? false : { opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, x: -6 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="flex-1 truncate flex items-center justify-between gap-2"
          >
            <span className="truncate">{item.label}</span>
            {badgeElement}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </Link>
  );

  if (!collapsed) return link;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">
        <div className="flex items-center gap-2">
          <span>{item.label}</span>
          {showBadge && (
            <span
              className={cn(
                "font-semibold text-[10px] rounded px-1.5 py-0.5",
                item.badgeKey === "orders"
                  ? "bg-blue-500/20 text-blue-400"
                  : "bg-red-500/20 text-red-400"
              )}
            >
              {badgeValue}
            </span>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
