"use client";

// Переключатели «Разделы меню»: что показывать в боковой панели, во вкладках,
// в нижней панели телефона и в поиске.

import { useId } from "react";

import { Switch } from "@/components/ui/switch";
import { useHiddenSections } from "@/hooks/use-hidden-sections";
import { useI18n } from "@/lib/i18n/context";
import { HIDEABLE_SECTIONS } from "@/lib/nav-visibility";

export function MenuSectionRows() {
  const { t } = useI18n();
  const { hidden, setHidden } = useHiddenSections();
  const prefix = useId();
  return (
    <>
      <p className="px-4 py-3 text-xs leading-relaxed text-muted-foreground sm:px-5">
        {t("set.menu.lead")}
      </p>
      {HIDEABLE_SECTIONS.map((section) => {
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
