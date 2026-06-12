"use client";

import Link from "next/link";
import { ChevronDown, LogOut, Settings } from "lucide-react";

import { GlobalSearch } from "@/components/shell/global-search";
import { MobileNav } from "@/components/shell/mobile-nav";
import { NotificationBell } from "@/components/shell/notification-bell";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOutAction } from "@/lib/auth/actions";
import { useSession } from "@/lib/rbac/context";
import { initials } from "@/lib/format";

export function AppTopbar({ unreadCount }: { unreadCount: number }) {
  const user = useSession();

  const isAdmin = user.roleKey === "admin";
  const roleLabel = isAdmin ? "Admin" : "Staff";

  return (
    <header
      data-topbar
      className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/80 px-4 backdrop-blur"
    >
      <MobileNav />

      <div className="flex w-full max-w-md flex-1 items-center">
        <GlobalSearch />
      </div>

      <div className="ml-auto flex items-center gap-1">
        <NotificationBell initialUnread={unreadCount} />

        <ThemeToggle />

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="h-auto gap-2 py-1"
              aria-label="Account menu"
            >
              <Avatar className="size-8">
                {user.avatarUrl ? (
                  <AvatarImage src={user.avatarUrl} alt={user.fullName} />
                ) : null}
                <AvatarFallback className="bg-primary/10 text-primary">
                  {initials(user.fullName)}
                </AvatarFallback>
              </Avatar>
              <span className="hidden items-center gap-2 md:flex">
                <span className="text-sm font-medium">{user.fullName}</span>
                <Badge variant={isAdmin ? "default" : "secondary"}>{roleLabel}</Badge>
              </span>
              <ChevronDown className="hidden size-4 text-muted-foreground md:block" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="flex flex-col gap-1 font-normal">
              <span className="text-sm font-medium leading-none">{user.fullName}</span>
              <span className="truncate text-xs text-muted-foreground">{user.email}</span>
              <Badge
                variant={isAdmin ? "default" : "secondary"}
                className="mt-1 w-fit"
              >
                {user.roleName}
              </Badge>
            </DropdownMenuLabel>

            <DropdownMenuSeparator />

            <DropdownMenuItem asChild>
              <Link href="/settings">
                <Settings className="size-4" aria-hidden="true" />
                Profile &amp; settings
              </Link>
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <form action={signOutAction}>
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
    </header>
  );
}
