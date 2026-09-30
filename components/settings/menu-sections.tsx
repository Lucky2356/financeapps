"use client";

// Переключатели «Разделы меню»: что показывать в боковой панели, во вкладках,
// в нижней панели телефона и в поиске.

import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";

import { Switch } from "@/components/ui/switch";
import { useHiddenSections } from "@/hooks/use-hidden-sections";
import { useI18n } from "@/lib/i18n/context";
import { HIDEABLE_SECTIONS } from "@/lib/nav-visibility";

export function MenuSectionRows() {
  const { t } = useI18n();
  const { hidden, setHidden } = useHiddenSections();
  const prefix = useId();
  // Свёрнуто: десять переключателей — это ещё экран прокрутки в «Основных».
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-muted/30 sm:px-5"
        data-testid="menu-sections-toggle"
      >
        <span className="text-xs leading-relaxed text-muted-foreground">
          {hidden.size > 0 ? t("set.menu.hiddenCount", { count: hidden.size }) : t("set.menu.lead")}
        </span>
        <ChevronDown
          className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open &&
        HIDEABLE_SECTIONS.map((section) => {
          const id = `${prefix}-${section.href}`;
          return (
            <div
              key={section.href}
              className="flex items-center justify-between gap-6 px-4 py-3 transition-colors hover:bg-muted/30 sm:px-5"
              data-testid={`menu-section-${section.href.slice(1)}`}
            >
              <label htmlFor={id} className="cursor-pointer text-sm font-medium">
                {t(section.labelKey)}
              </label>
              <Switch
                id={id}
                checked={!hidden.has(section.href)}
                onChange={(show) => setHidden(section.href, !show)}
                aria-label={t(section.labelKey)}
              />
            </div>
          );
        })}
    </>
  );
}
