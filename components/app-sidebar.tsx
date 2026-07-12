"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleDollarSign, Search } from "lucide-react";

import { NotificationBell } from "@/components/notification-bell";
import { ProfileSwitcher } from "@/components/profile-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { APP_NAME } from "@/lib/constants";
import { useI18n } from "@/lib/i18n/context";
import { activeNavHref, MAIN_NAV } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function AppSidebar() {
  const pathname = usePathname();
  const { t } = useI18n();
  // A short list of top-level destinations keeps the app approachable; related
  // screens live as tabs inside their hub (see HubTabs), not as sidebar buttons.
  const activeHref = activeNavHref(pathname);

  return (
    <aside className="sticky top-0 z-30 hidden h-screen w-64 shrink-0 flex-col border-r bg-card md:flex">
      {/* Logo */}
      <div className="border-b p-5">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-sidebar-accent text-white shadow-sm">
            <CircleDollarSign className="size-[18px]" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-foreground">{APP_NAME}</span>
            <span className="block text-[11px] text-muted-foreground">{t("shell.subtitle")}</span>
          </span>
        </Link>
      </div>

      <ProfileSwitcher />

      {/* Command palette trigger */}
      <div className="px-3 pt-3">
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("command-palette-open"))}
          className="flex w-full items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/60"
        >
          <Search className="size-4" />
          <span className="flex-1 text-left">{t("shell.search")}</span>
          <kbd className="rounded bg-background px-1.5 py-0.5 font-mono text-[10px]">Ctrl K</kbd>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
        {MAIN_NAV.map((item) => {
          const active = activeHref === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors duration-150",
                active
                  ? "bg-primary/10 font-semibold text-primary before:absolute before:left-0 before:top-1/2 before:h-5 before:w-0.5 before:-translate-y-1/2 before:rounded-r before:bg-primary before:content-['']"
                  : "text-muted-foreground hover:bg-primary/5 hover:text-foreground"
              )}
            >
              <Icon className="size-4 shrink-0" />
              {t(item.labelKey)}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t px-4 py-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-muted-foreground">{t("shell.themeAndNotifications")}</p>
          <div className="flex items-center gap-0.5">
            <NotificationBell />
            <ThemeToggle />
          </div>
        </div>
      </div>
    </aside>
  );
}
