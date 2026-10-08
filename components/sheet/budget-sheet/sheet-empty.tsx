"use client";

import { FileUp, Sparkles } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";

import { SheetImportDialog } from "@/components/sheet/sheet-import-dialog";
import { QUIET_BUTTON, type SheetFormat, type SheetWords } from "@/components/sheet/sheet-types";
import { SheetWizard } from "@/components/sheet/sheet-wizard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { ImportPageData } from "@/lib/data";
import { cn } from "@/lib/utils";

/** Таблицы ещё нет: три шага и три способа начать. */
export function SheetEmpty({
  sheetId,
  words,
  format,
  categories,
  current,
  wizardOpen,
  setWizardOpen,
  importOpen,
  setImportOpen,
  act,
  reload,
  reloadRefs
}: {
  sheetId: string;
  words: SheetWords;
  format: SheetFormat;
  categories: ImportPageData["categories"];
  current: string;
  wizardOpen: boolean;
  setWizardOpen: Dispatch<SetStateAction<boolean>>;
  importOpen: boolean;
  setImportOpen: Dispatch<SetStateAction<boolean>>;
  act: (body: Record<string, unknown>, done?: string) => Promise<unknown>;
  reload: () => Promise<void>;
  reloadRefs: () => Promise<void>;
}) {
  const steps = [
    { n: 1, title: words.emptyStep1, text: words.emptyStep1Text },
    { n: 2, title: words.emptyStep2, text: words.emptyStep2Text },
    { n: 3, title: words.emptyStep3, text: words.emptyStep3Text }
  ];
  return (
    <>
      <Card data-testid="sheet-empty">
        <CardContent className="space-y-6 p-6">
          <div className="mx-auto max-w-xl space-y-2 text-center">
            <h2 className="text-lg font-semibold">{words.emptyTitle}</h2>
            <p className="text-sm text-muted-foreground">{words.emptyLead}</p>
          </div>
          {/* Настоящая последовательность — поэтому с цифрами. */}
          <ol className="grid gap-3 sm:grid-cols-3">
            {steps.map((step) => (
              <li key={step.n} className="flex gap-3 rounded-lg border bg-card p-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-foreground">
                  {step.n}
                </span>
                <span>
                  <span className="block text-sm font-medium">{step.title}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{step.text}</span>
                </span>
              </li>
            ))}
          </ol>
          <div className="flex flex-col justify-center gap-2 sm:flex-row">
            <Button
              type="button"
              className="h-auto min-h-10 w-full whitespace-normal py-2 sm:w-auto"
              onClick={() => setWizardOpen(true)}
            >
              <Sparkles className="size-4" />
              {words.emptyCreate}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-auto min-h-10 w-full whitespace-normal py-2 sm:w-auto"
              onClick={() => setImportOpen(true)}
            >
              <FileUp className="size-4" />
              {words.emptyImport}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className={cn(
                "h-auto min-h-10 w-full whitespace-normal py-2 sm:w-auto",
                QUIET_BUTTON
              )}
              onClick={() => void act({ action: "start", from: current })}
            >
              {words.emptyStart}
            </Button>
          </div>
        </CardContent>
      </Card>
      <SheetWizard
        sheetId={sheetId}
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        categories={categories}
        current={current}
        words={words}
        format={format}
        onCreated={async () => {
          await Promise.all([reload(), reloadRefs()]);
        }}
      />
      <SheetImportDialog
        sheetId={sheetId}
        open={importOpen}
        onOpenChange={setImportOpen}
        categories={categories}
        hasSheet={false}
        onImported={async () => {
          await Promise.all([reload(), reloadRefs()]);
        }}
      />
    </>
  );
}
