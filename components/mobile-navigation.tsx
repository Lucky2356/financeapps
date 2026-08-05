"use client";

import { Plus, Search, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { apiClient } from "@/lib/api/client";
import { APP_NAME } from "@/lib/constants";
import { useI18n } from "@/lib/i18n/context";
import { activeNavHref, findHub, MAIN_NAV, MOBILE_PRIMARY } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import type { ProfileList, UserProfile } from "@/types/profiles";

const primaryItems = MOBILE_PRIMARY;

/** The label of the screen the user is on, for the header's second line. */
function useScreenTitle(pathname: string): string {
  const { t } = useI18n();
  const tab = findHub(pathname)?.tabs.find((item) => item.href === pathname);
  if (tab) return t(tab.labelKey);
  const main = MAIN_NAV.find((item) => item.href === pathname);
  if (main) return t(main.labelKey);
  return t("shell.subtitle");
}

/** Morning / day / evening / night, by the clock on the device. */
function greetingKey(hour: number): string {
  if (hour < 5) return "home.greeting.night";
  if (hour < 12) return "home.greeting.morning";
  if (hour < 18) return "home.greeting.day";
  return "home.greeting.evening";
}

// The home screen opens with a greeting and the profile avatar instead of the
// generic title row — the phone layout the owner asked for. The hour is read
// after mount: the page is prerendered at build time, so deciding "morning" on
// the server would bake a stale greeting into the export.
function GreetingHeading() {
  const { t } = useI18n();
  const [hour, setHour] = useState<number | null>(null);
  const profile = useActiveProfile();

  useEffect(() => {
    // Deferred a microtask past the effect so the greeting lands in its own
    // render pass rather than cascading out of this one.
    void Promise.resolve().then(() => setHour(new Date().getHours()));
  }, []);

  return (
    <div className="min-w-0">
      <span className="block h-4 truncate text-xs text-muted-foreground">
        {hour === null ? "" : t(greetingKey(hour))}
      </span>
      <span className="mt-0.5 block truncate text-lg font-semibold">
        {profile?.name ?? APP_NAME}
      </span>
    </div>
  );
}

/** The active profile, or null while loading (or if profiles are unavailable). */
function useActiveProfile(): UserProfile | null {
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<ProfileList>("/profiles")
      .then((list) => {
        if (cancelled) return;
        const active =
          list.profiles.find((item) => item.id === list.activeProfileId) ?? list.profiles[0];
        setProfile(active ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return profile;
}

// Header per the design: the product name with the current screen underneath,
// and two icon buttons. Search opens the command palette the app already has.
// On the home screen the left side becomes the greeting and the right side a
// single avatar, matching the reference layout.
export function MobileTopBar() {
  const pathname = usePathname();
  const { t } = useI18n();
  const screenTitle = useScreenTitle(pathname);
  const home = pathname === "/";
  const profile = useActiveProfile();

  if (home) {
    return (
      <header className="sticky top-0 z-40 bg-background/95 px-4 pb-3 pt-[max(env(safe-area-inset-top),0.75rem)] backdrop-blur md:hidden">
        <div className="flex items-center justify-between gap-3">
          <GreetingHeading />
          <Link
            href="/settings"
            aria-label={t("nav.settings")}
            className="flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
            style={{ backgroundColor: profile?.color ?? "hsl(var(--primary))" }}
          >
            {profile ? profile.name.charAt(0).toUpperCase() : ""}
          </Link>
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-40 bg-background/95 px-4 pb-3 pt-[max(env(safe-area-inset-top),0.75rem)] backdrop-blur md:hidden">
      <div className="flex items-center justify-between gap-3">
        <Link href="/" className="min-w-0">
          <span className="block truncate text-base font-medium">{APP_NAME}</span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{screenTitle}</span>
        </Link>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            aria-label={t("shell.search")}
            onClick={() => window.dispatchEvent(new Event("command-palette-open"))}
            className="flex size-9 items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-foreground/[0.07]"
          >
            <Search className="size-[17px]" />
          </button>
          <Link
            href="/settings"
            aria-label={t("nav.settings")}
            className="flex size-9 items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-foreground/[0.07]"
          >
            <Settings className="size-[17px]" />
          </Link>
        </div>
      </div>
    </header>
  );
}

// Four destinations with the round add button between the second and third —
// the layout from the design. The button reuses the existing quick-add dialog
// via the same event the setup checklist fires, so there is one add flow.
export function MobileBottomNav() {
  const pathname = usePathname();
  const { t } = useI18n();
  const activeHref = activeNavHref(pathname);

  function navItem(item: (typeof primaryItems)[number]) {
    const active = activeHref === item.href;
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex min-h-12 flex-1 flex-col items-center justify-center gap-[5px] px-0.5 py-2 text-[11.5px] font-medium transition-colors",
          active ? "text-primary" : "text-muted-foreground"
        )}
      >
        <Icon className="size-[23px]" strokeWidth={1.6} />
        <span className="max-w-full truncate">{t(item.labelKey)}</span>
      </Link>
    );
  }

  return (
    <nav
      aria-label={t("set.sections")}
      className="fixed inset-x-0 bottom-0 z-50 flex items-center border-t bg-background px-1 pb-[max(env(safe-area-inset-bottom),0.625rem)] pt-2.5 md:hidden"
    >
      {primaryItems.slice(0, 2).map(navItem)}
      <button
        type="button"
        aria-label={t("qa.fabAria")}
        onClick={() => window.dispatchEvent(new Event("quick-add-open"))}
        // Lifted out of the bar so it reads as the one primary action; this is
        // the only solid accent fill in the whole system.
        className="-mt-8 flex size-[54px] shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-soft transition-[filter] hover:brightness-110"
      >
        <Plus className="size-6" strokeWidth={2} />
      </button>
      {primaryItems.slice(2).map(navItem)}
    </nav>
  );
}
