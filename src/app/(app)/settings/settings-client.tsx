"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Bell,
  Building2,
  CalendarClock,
  CircleUserRound,
  Database,
  Flame,
  Megaphone,
  MessageSquareWarning,
  MessagesSquare,
  Package,
  PiggyBank,
  Printer,
  Settings2,
  Shield,
  Star,
  UserCog,
} from "lucide-react";
import { TableSkeleton } from "@/components/states";
import type { SectionId, SettingsBundle } from "./sections/types";

const sectionLoading = () => <TableSkeleton rows={6} />;

const ProfileSection = dynamic(
  () => import("./sections/profile-section").then((m) => m.ProfileSection),
  { loading: sectionLoading },
);
const PreferencesSection = dynamic(
  () => import("./sections/preferences-section").then((m) => m.PreferencesSection),
  { loading: sectionLoading },
);
const NotificationsSection = dynamic(
  () => import("./sections/notifications-section").then((m) => m.NotificationsSection),
  { loading: sectionLoading },
);
const CompanySection = dynamic(
  () => import("./sections/company-section").then((m) => m.CompanySection),
  { loading: sectionLoading },
);
const RolesSection = dynamic(
  () => import("./sections/roles-section").then((m) => m.RolesSection),
  { loading: sectionLoading },
);
const OrdersSection = dynamic(
  () => import("./sections/orders-section").then((m) => m.OrdersSection),
  { loading: sectionLoading },
);
const ScheduleSection = dynamic(
  () => import("./sections/schedule-section").then((m) => m.ScheduleSection),
  { loading: sectionLoading },
);
const TrendingSection = dynamic(
  () => import("./sections/trending-section").then((m) => m.TrendingSection),
  { loading: sectionLoading },
);
const FeedbackSection = dynamic(
  () => import("./sections/feedback-section").then((m) => m.FeedbackSection),
  { loading: sectionLoading },
);
const RoiSection = dynamic(
  () => import("./sections/roi-section").then((m) => m.RoiSection),
  { loading: sectionLoading },
);
const MessagingSection = dynamic(
  () => import("./sections/messaging-section").then((m) => m.MessagingSection),
  { loading: sectionLoading },
);
const InventorySection = dynamic(
  () => import("./sections/inventory-section").then((m) => m.InventorySection),
  { loading: sectionLoading },
);
const LoyaltySection = dynamic(
  () => import("./sections/loyalty-section").then((m) => m.LoyaltySection),
  { loading: sectionLoading },
);
const MarketingSection = dynamic(
  () => import("./sections/marketing-section").then((m) => m.MarketingSection),
  { loading: sectionLoading },
);
const DataSection = dynamic(
  () => import("./sections/data-section").then((m) => m.DataSection),
  { loading: sectionLoading },
);
const SecuritySection = dynamic(
  () => import("./sections/security-section").then((m) => m.SecuritySection),
  { loading: sectionLoading },
);

const SECTION_META: {
  id: SectionId;
  label: string;
  icon: typeof Settings2;
  group: "Personal" | "Organization";
}[] = [
  { id: "profile", label: "My Profile", icon: CircleUserRound, group: "Personal" },
  { id: "preferences", label: "Preferences", icon: Settings2, group: "Personal" },
  { id: "notifications", label: "Notifications", icon: Bell, group: "Personal" },
  { id: "company", label: "Company", icon: Building2, group: "Organization" },
  { id: "roles", label: "Roles & Permissions", icon: UserCog, group: "Organization" },
  { id: "orders", label: "Orders & Printing", icon: Printer, group: "Organization" },
  { id: "schedule", label: "Schedule", icon: CalendarClock, group: "Organization" },
  { id: "trending", label: "Trending", icon: Flame, group: "Organization" },
  { id: "feedback", label: "Feedback", icon: MessageSquareWarning, group: "Organization" },
  { id: "roi", label: "ROI & Investment", icon: PiggyBank, group: "Organization" },
  { id: "messaging", label: "Messaging", icon: MessagesSquare, group: "Organization" },
  { id: "inventory", label: "Inventory", icon: Package, group: "Organization" },
  { id: "loyalty", label: "Loyalty", icon: Star, group: "Organization" },
  { id: "marketing", label: "Marketing", icon: Megaphone, group: "Organization" },
  { id: "data", label: "Data Management", icon: Database, group: "Organization" },
  { id: "security", label: "Security", icon: Shield, group: "Organization" },
];

export function SettingsClient({
  bundle,
  initialTab,
}: {
  bundle: SettingsBundle;
  initialTab: string | null;
}) {
  const reduce = useReducedMotion();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const visible = useMemo(
    () =>
      SECTION_META.filter(
        (s) =>
          s.group === "Personal" || bundle[s.id as keyof SettingsBundle] !== undefined,
      ),
    [bundle],
  );

  const [active, setActive] = useState<SectionId>(() => {
    const candidate = initialTab as SectionId | null;
    return candidate && visible.some((s) => s.id === candidate) ? candidate : "profile";
  });

  function selectTab(id: SectionId) {
    setActive(id);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", id);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const groups = ["Personal", "Organization"].filter((g) =>
    visible.some((s) => s.group === g),
  ) as ("Personal" | "Organization")[];

  return (
    <div className="flex flex-col gap-6 md:flex-row md:gap-8">
      {/* Section nav: vertical rail on desktop, horizontal scroll on mobile. */}
      <nav
        aria-label="Settings sections"
        className="flex shrink-0 gap-1 overflow-x-auto pb-2 md:w-56 md:flex-col md:overflow-visible md:pb-0"
      >
        {groups.map((group) => (
          <div key={group} className="flex gap-1 md:flex-col">
            <p className="hidden px-3 pb-1 pt-4 text-xs font-medium uppercase tracking-wider text-muted-foreground first:pt-0 md:block">
              {group}
            </p>
            {visible
              .filter((s) => s.group === group)
              .map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => selectTab(id)}
                  aria-current={active === id ? "page" : undefined}
                  className={`relative flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                    active === id
                      ? "font-medium text-foreground"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  }`}
                >
                  {active === id ? (
                    <motion.span
                      layoutId="settings-active-pill"
                      className="absolute inset-0 rounded-md bg-muted"
                      transition={
                        reduce ? { duration: 0 } : { type: "spring", bounce: 0.15, duration: 0.4 }
                      }
                    />
                  ) : null}
                  <Icon className="relative size-4" aria-hidden />
                  <span className="relative whitespace-nowrap">{label}</span>
                </button>
              ))}
          </div>
        ))}
      </nav>

      <div className="min-w-0 flex-1">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={active}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            {active === "profile" && <ProfileSection data={bundle.profile} />}
            {active === "preferences" && <PreferencesSection data={bundle.preferences} />}
            {active === "notifications" && (
              <NotificationsSection data={bundle.notifications} />
            )}
            {active === "company" && bundle.company && (
              <CompanySection data={bundle.company.data} canEdit={bundle.company.canEdit} />
            )}
            {active === "roles" && bundle.roles && (
              <RolesSection data={bundle.roles.data} canEdit={bundle.roles.canEdit} />
            )}
            {active === "orders" && bundle.orders && (
              <OrdersSection data={bundle.orders.data} canEdit={bundle.orders.canEdit} />
            )}
            {active === "schedule" && bundle.schedule && (
              <ScheduleSection data={bundle.schedule.data} canEdit={bundle.schedule.canEdit} />
            )}
            {active === "trending" && bundle.trending && (
              <TrendingSection data={bundle.trending.data} canEdit={bundle.trending.canEdit} />
            )}
            {active === "feedback" && bundle.feedback && (
              <FeedbackSection data={bundle.feedback.data} canEdit={bundle.feedback.canEdit} />
            )}
            {active === "roi" && bundle.roi && (
              <RoiSection data={bundle.roi.data} canEdit={bundle.roi.canEdit} />
            )}
            {active === "messaging" && bundle.messaging && (
              <MessagingSection
                data={bundle.messaging.data}
                canEdit={bundle.messaging.canEdit}
              />
            )}
            {active === "inventory" && bundle.inventory && (
              <InventorySection
                data={bundle.inventory.data}
                canEdit={bundle.inventory.canEdit}
              />
            )}
            {active === "loyalty" && bundle.loyalty && (
              <LoyaltySection data={bundle.loyalty.data} canEdit={bundle.loyalty.canEdit} />
            )}
            {active === "marketing" && bundle.marketing && (
              <MarketingSection
                data={bundle.marketing.data}
                canEdit={bundle.marketing.canEdit}
              />
            )}
            {active === "data" && bundle.data && (
              <DataSection data={bundle.data.data} canEdit={bundle.data.canEdit} />
            )}
            {active === "security" && bundle.security && (
              <SecuritySection
                data={bundle.security.data}
                canEdit={bundle.security.canEdit}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
