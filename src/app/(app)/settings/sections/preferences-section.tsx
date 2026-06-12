"use client";

import { useMemo, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updatePreferencesAction } from "@/lib/settings/actions";
import { DATE_FORMATS, LANDING_PAGES, TIME_FORMATS } from "@/lib/settings/schemas";
import type { PreferencesData } from "./types";

type Theme = PreferencesData["theme"];
type SidebarState = PreferencesData["sidebarDefaultState"];
type DateFormat = PreferencesData["dateFormat"];
type TimeFormat = PreferencesData["timeFormat"];
type Language = PreferencesData["language"];

const FALLBACK_TIMEZONES = [
  "UTC",
  "Asia/Ho_Chi_Minh",
  "Asia/Bangkok",
  "America/Los_Angeles",
  "Europe/London",
];

function listTimezones(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return FALLBACK_TIMEZONES;
  }
}

/**
 * Personal display preferences: theme, language, landing page, sidebar,
 * date/time formats and timezone. Saving also flips next-themes live so the
 * UI matches the stored preference without a reload.
 */
export function PreferencesSection({ data }: { data: PreferencesData }) {
  const router = useRouter();
  const { setTheme } = useTheme();
  const [saving, setSaving] = useState(false);

  const [theme, setThemeChoice] = useState<Theme>(data.theme);
  const [language, setLanguage] = useState<Language>(data.language);
  const [landingPage, setLandingPage] = useState(data.defaultLandingPage);
  const [sidebarState, setSidebarState] = useState<SidebarState>(data.sidebarDefaultState);
  const [dateFormat, setDateFormat] = useState<DateFormat>(data.dateFormat);
  const [timeFormat, setTimeFormat] = useState<TimeFormat>(data.timeFormat);
  const [timezone, setTimezone] = useState(data.timezone);

  // Current value first so it is visible without scrolling the long list.
  const timezones = useMemo(() => {
    const all = listTimezones();
    return [data.timezone, ...all.filter((tz: string) => tz !== data.timezone)];
  }, [data.timezone]);

  const today = new Date();

  async function save() {
    setSaving(true);
    try {
      const res = await updatePreferencesAction({
        theme,
        language,
        defaultLandingPage: landingPage,
        sidebarDefaultState: sidebarState,
        dateFormat,
        timeFormat,
        timezone,
      });
      if (res.ok) {
        // Apply immediately so the live theme matches the stored preference.
        setTheme(theme);
        toast.success("Preferences saved");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Preferences</CardTitle>
        <CardDescription>
          Theme, language and display settings. These only affect your account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="pref-theme">Theme</Label>
            <Select value={theme} onValueChange={(v: string) => setThemeChoice(v as Theme)}>
              <SelectTrigger id="pref-theme" className="w-full">
                <SelectValue placeholder="Theme" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
                <SelectItem value="system">System</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pref-language">Language</Label>
            <Select value={language} onValueChange={(v: string) => setLanguage(v as Language)}>
              <SelectTrigger id="pref-language" className="w-full">
                <SelectValue placeholder="Language" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="vi">Tiếng Việt</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pref-landing">Default landing page</Label>
            <Select value={landingPage} onValueChange={(v: string) => setLandingPage(v)}>
              <SelectTrigger id="pref-landing" className="w-full">
                <SelectValue placeholder="Landing page" />
              </SelectTrigger>
              <SelectContent>
                {LANDING_PAGES.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Where you land after signing in</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pref-sidebar">Sidebar default state</Label>
            <Select
              value={sidebarState}
              onValueChange={(v: string) => setSidebarState(v as SidebarState)}
            >
              <SelectTrigger id="pref-sidebar" className="w-full">
                <SelectValue placeholder="Sidebar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="expanded">Expanded</SelectItem>
                <SelectItem value="collapsed">Collapsed</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Applied on your next visit</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pref-date-format">Date format</Label>
            <Select
              value={dateFormat}
              onValueChange={(v: string) => setDateFormat(v as DateFormat)}
            >
              <SelectTrigger id="pref-date-format" className="w-full">
                <SelectValue placeholder="Date format" />
              </SelectTrigger>
              <SelectContent>
                {DATE_FORMATS.map((f) => (
                  <SelectItem key={f} value={f}>
                    {format(today, f)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pref-time-format">Time format</Label>
            <Select
              value={timeFormat}
              onValueChange={(v: string) => setTimeFormat(v as TimeFormat)}
            >
              <SelectTrigger id="pref-time-format" className="w-full">
                <SelectValue placeholder="Time format" />
              </SelectTrigger>
              <SelectContent>
                {TIME_FORMATS.map((f) => (
                  <SelectItem key={f} value={f}>
                    {format(today, f)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="pref-timezone">Timezone</Label>
            {/* Native select: the timezone list is ~400 entries, so type-to-jump
                and native scrolling beat a popover here. Styled to match Input. */}
            <select
              id="pref-timezone"
              value={timezone}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setTimezone(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30"
            >
              {timezones.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            Save changes
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
