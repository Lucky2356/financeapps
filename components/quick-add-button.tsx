"use client";

import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

// Opens the global quick-add dialog (the same one bound to Alt+N / the FAB).
export function QuickAddButton({ label = "Операция" }: { label?: string }) {
  return (
    <Button onClick={() => window.dispatchEvent(new Event("quick-add-open"))}>
      <Plus className="size-4" />
      {label}
    </Button>
  );
}
