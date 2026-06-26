"use client";

import { useI18n } from "@/lib/i18n/context";

// Small translated "loading…" card used as a Suspense fallback inside server
// components (which cannot call the useI18n hook directly).
export function LoadingCard({ messageKey }: { messageKey: string }) {
  const { t } = useI18n();
  return (
    <div className="rounded-lg border bg-card p-5 text-sm text-muted-foreground">
      {t(messageKey)}
    </div>
  );
}
