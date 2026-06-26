"use client";

import type { ReactNode } from "react";

import { useI18n } from "@/lib/i18n/context";

// Page headers are translated on the client so the same component works in both
// the web (SSR) and desktop (static export) builds — text follows the user's
// chosen locale at runtime instead of being baked at build time. Callers pass
// catalog keys; a literal `title`/`description` is still accepted as a fallback
// for any not-yet-keyed surface.
export function PageHeader({
  titleKey,
  descriptionKey,
  title,
  description,
  actions
}: {
  titleKey?: string;
  descriptionKey?: string;
  title?: string;
  description?: string;
  actions?: ReactNode;
}) {
  const { t } = useI18n();
  const resolvedTitle = titleKey ? t(titleKey) : (title ?? "");
  const resolvedDescription = descriptionKey ? t(descriptionKey) : description;

  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{resolvedTitle}</h1>
        {resolvedDescription ? (
          <p className="mt-1.5 max-w-3xl text-sm text-muted-foreground">
            <span className="mr-1.5 inline-block size-1.5 translate-y-[-1px] rounded-full bg-primary/60 align-middle" />
            {resolvedDescription}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
