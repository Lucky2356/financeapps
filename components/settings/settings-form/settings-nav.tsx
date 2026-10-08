"use client";

import { ChevronRight, Search } from "lucide-react";

import type { Section } from "@/components/settings/settings-form/model";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

/** Поиск по разделам — над оглавлением и, на телефоне, над найденным. */
export function SettingsSearch({
  query,
  onQueryChange
}: {
  query: string;
  onQueryChange: (query: string) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder={t("set.search")}
        className="pl-9"
        aria-label={t("set.search")}
      />
    </div>
  );
}

/**
 * Оглавление. На компьютере — всегда слева; на телефоне — это и есть
 * первый экран настроек, как в настройках самого телефона: разделы с
 * пояснением «что внутри», раздел открывается касанием.
 */
export function SettingsNav({
  sections,
  currentId,
  hidden,
  trimmedQuery,
  search,
  onOpen
}: {
  sections: Section[];
  currentId: string;
  /** Открыт раздел или идёт поиск: на телефоне оглавление уступает место. */
  hidden: boolean;
  trimmedQuery: string;
  search: React.ReactNode;
  onOpen: (id: string) => void;
}) {
  const { t } = useI18n();
  return (
    <aside className={cn("space-y-3 lg:sticky lg:top-6", hidden ? "hidden lg:block" : "")}>
      {search}
      <nav
        aria-label={t("set.sections")}
        data-testid="settings-nav"
        className="overflow-hidden rounded-xl border bg-card lg:border-0 lg:bg-transparent"
      >
        <ul className="divide-y divide-border/60 lg:space-y-0.5 lg:divide-y-0">
          {sections.map((section) => {
            const Icon = section.icon;
            const isActive = section.id === currentId && !trimmedQuery;
            return (
              <li key={section.id}>
                <button
                  type="button"
                  onClick={() => onOpen(section.id)}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "group flex w-full items-center gap-3 px-3 py-3 text-left transition-colors lg:rounded-lg lg:py-2.5",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isActive ? "lg:bg-primary/10" : "hover:bg-muted/50"
                  )}
                >
                  <span
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors lg:size-8",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground group-hover:text-foreground"
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block text-sm font-medium",
                        isActive ? "lg:text-primary" : undefined
                      )}
                    >
                      {section.label}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {section.summary}
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground/60 lg:hidden" />
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
