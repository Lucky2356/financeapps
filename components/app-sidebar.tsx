"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";
import { useEffect, useState } from "react";

import { NotificationBell } from "@/components/notification-bell";
import { ProfileSwitcher } from "@/components/profile-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { useI18n } from "@/lib/i18n/context";
import { activeNavHref, DESKTOP_NAV } from "@/lib/navigation";
import { cn } from "@/lib/utils";

const COLLAPSED_KEY = "sidebar-collapsed";

export function AppSidebar() {
  const pathname = usePathname();
  const { t } = useI18n();
  // The full-height sidebar has room for the screens the owner opens daily, so
  // they are here in the open. Only what belongs together — the ledger, the
  // plans, the reading — is still grouped, and those groups show their tabs
  // above the page (see HubTabs).
  const activeHref = activeNavHref(pathname, "desktop");

  // Collapsed to icons: the wide tables (plan/fact above all) want every pixel
  // of the window. Starts expanded so the server shell and the first paint
  // agree, then adopts the saved choice.
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    let saved = false;
    try {
      saved = localStorage.getItem(COLLAPSED_KEY) === "1";
    } catch {
      saved = false;
    }
    if (saved) void Promise.resolve().then(() => setCollapsed(true));
  }, []);

  function toggle() {
    setCollapsed((previous) => {
      const next = !previous;
      try {
        localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        /* storage unavailable — the choice lasts this session */
      }
      return next;
    });
  }

  return (
    <aside
      data-collapsed={collapsed ? "true" : "false"}
      className={cn(
        "sticky top-0 z-30 hidden h-screen shrink-0 flex-col border-r bg-card transition-[width] duration-200 md:flex",
        collapsed ? "w-[4.5rem]" : "w-[17rem]"
      )}
    >
      {/* The mark, the name, and whose data is open — one control, because the
          mark is what switches profiles now. */}
      <div
        className={cn(
          "border-b",
          collapsed ? "flex flex-col items-center gap-1 py-3" : "flex items-center gap-2 p-3"
        )}
      >
        <ProfileSwitcher compact={collapsed} />
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? t("shell.expand") : t("shell.collapse")}
          title={collapsed ? t("shell.expand") : t("shell.collapse")}
          aria-expanded={!collapsed}
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        </button>
      </div>

      {/* Command palette trigger */}
      <div className={collapsed ? "flex justify-center px-2 pt-3" : "px-3 pt-3"}>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("command-palette-open"))}
          aria-label={t("shell.search")}
          title={t("shell.search")}
          className={cn(
            "flex items-center gap-2 rounded-md border bg-muted/30 text-sm text-muted-foreground transition-colors hover:bg-muted/60",
            collapsed ? "size-10 justify-center" : "w-full px-3 py-2"
          )}
        >
          <Search className="size-4" />
          {collapsed ? null : (
            <>
              <span className="flex-1 text-left">{t("shell.search")}</span>
              <kbd className="rounded bg-background px-1.5 py-0.5 font-mono text-[10px]">
                Ctrl K
              </kbd>
            </>
          )}
        </button>
      </div>

      {/* Nav */}
      <nav className={cn("flex-1 space-y-0.5 overflow-y-auto py-3", collapsed ? "px-2" : "px-3")}>
        {DESKTOP_NAV.map((item) => {
          const active = activeHref === item.href;
          const Icon = item.icon;
          const label = t(item.labelKey);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? label : undefined}
              className={cn(
                "relative flex items-center gap-3 rounded-md py-2 text-sm transition-colors duration-150",
                collapsed ? "justify-center px-2" : "px-3",
                active
                  ? "bg-primary/10 font-semibold text-primary before:absolute before:left-0 before:top-1/2 before:h-5 before:w-0.5 before:-translate-y-1/2 before:rounded-r before:bg-primary before:content-['']"
                  : "text-muted-foreground hover:bg-primary/5 hover:text-foreground"
              )}
            >
              <Icon className="size-4 shrink-0" />
              {collapsed ? <span className="sr-only">{label}</span> : label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className={cn("border-t py-3", collapsed ? "px-2" : "px-4")}>
        <div className={cn("flex items-center", collapsed ? "flex-col gap-1" : "justify-between")}>
          {collapsed ? null : (
            <p className="text-[11px] text-muted-foreground">{t("shell.themeAndNotifications")}</p>
          )}
          <div className={cn("flex items-center", collapsed ? "flex-col gap-1" : "gap-0.5")}>
            <NotificationBell />
            <ThemeToggle />
          </div>
        </div>
      </div>
    </aside>
  );
}
