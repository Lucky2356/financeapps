"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ThemeToggle } from "@/components/theme-toggle";
import { APP_NAME } from "@/lib/constants";
import { useI18n } from "@/lib/i18n/context";
import { activeNavHref, MOBILE_PRIMARY } from "@/lib/navigation";
import { cn } from "@/lib/utils";

const primaryItems = MOBILE_PRIMARY;

export function MobileTopBar() {
  const { t } = useI18n();

  return (
    <header className="sticky top-0 z-40 border-b bg-card/95 px-4 py-3 shadow-soft backdrop-blur md:hidden">
      <div className="flex items-center justify-between gap-3">
        <Link href="/" className="min-w-0">
          <span className="block truncate text-sm font-semibold">{APP_NAME}</span>
          <span className="block text-xs text-muted-foreground">{t("shell.subtitle")}</span>
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );
}

export function MobileBottomNav() {
  const pathname = usePathname();
  const { t } = useI18n();
  const activeHref = activeNavHref(pathname);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 backdrop-blur md:hidden">
      <div className="grid grid-cols-6 gap-1">
        {primaryItems.map((item) => {
          const active = activeHref === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-md text-[10px] font-medium text-muted-foreground",
                active && "bg-secondary text-foreground"
              )}
            >
              <Icon className="size-4" />
              <span className="max-w-full truncate">{t(item.labelKey)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
