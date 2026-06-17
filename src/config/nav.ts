import {
  LayoutDashboard,
  Users,
  PackageSearch,
  CalendarClock,
  Boxes,
  TrendingUp,
  PiggyBank,
  Wallet,
  Crown,
  Flame,
  Megaphone,
  MessageSquareWarning,
  Bell,
  MessagesSquare,
  ScrollText,
  BarChart3,
  Settings,
  type LucideIcon,
} from "lucide-react";
import type { PermissionKey } from "@/lib/rbac/permissions";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** When set, the item is hidden unless the user holds this permission. */
  permission?: PermissionKey;
}

/**
 * Sidebar navigation in the spec's required order (12 items). Items are
 * filtered by permission in the shell (and every destination is enforced
 * server-side too). Settings has no permission gate — everyone can manage
 * their own profile/preferences; admin-only sections gate inside the page.
 */
export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, permission: "dashboard.view" },
  { label: "User Management", href: "/users", icon: Users, permission: "users.view" },
  { label: "Customer Orders Hub", href: "/orders", icon: PackageSearch, permission: "orders.view" },
  { label: "Production Schedule", href: "/schedule", icon: CalendarClock, permission: "schedule.view" },
  { label: "Products & Inventory", href: "/products", icon: Boxes, permission: "products.view" },
  { label: "Profit & Cost Analysis", href: "/profit", icon: TrendingUp, permission: "profit.view" },
  { label: "ROI & Investment Recovery", href: "/roi", icon: PiggyBank, permission: "roi.view" },
  { label: "Payroll", href: "/payroll", icon: Wallet, permission: "payroll.view_own" },
  { label: "CRM & Loyalty", href: "/crm", icon: Crown, permission: "crm.view" },
  { label: "Trending Products", href: "/trending", icon: Flame, permission: "trends.create" },
  { label: "Customer Feedback", href: "/feedback", icon: MessageSquareWarning, permission: "feedback.create" },
  { label: "Marketing Automation", href: "/marketing", icon: Megaphone, permission: "campaigns.view" },
  { label: "Notifications", href: "/notifications", icon: Bell, permission: "notifications.view" },
  { label: "Messages", href: "/messages", icon: MessagesSquare, permission: "messages.view" },
  { label: "Activity Log", href: "/activity", icon: ScrollText, permission: "logs.view" },
  { label: "Analytics", href: "/analytics", icon: BarChart3, permission: "analytics.view" },
  { label: "Settings", href: "/settings", icon: Settings },
];
