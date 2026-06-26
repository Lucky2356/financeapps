"use client";

import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/context";

// Opens the global quick-add dialog (the same one bound to Alt+N / the FAB).
export function QuickAddButton({ label }: { label?: string }) {
  const { t } = useI18n();
  return (
    <Button onClick={() => window.dispatchEvent(new Event("quick-add-open"))}>
      <Plus className="size-4" />
      {label ?? t("common.transaction")}
    </Button>
  );
}
