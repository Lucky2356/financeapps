"use client";

import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/context";

// Triggers the browser print dialog (also "Save as PDF"). The print stylesheet
// in globals.css hides the chrome and renders a clean report. Works in the web
// app and inside the Tauri WebView2 shell.
export function PrintButton({ label }: { label?: string }) {
  const { t } = useI18n();
  return (
    <Button variant="outline" onClick={() => window.print()} className="print:hidden">
      <Printer className="size-4" />
      {label ?? t("common.print")}
    </Button>
  );
}
