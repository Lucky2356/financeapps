"use client";

import { useState } from "react";

import type { useSheetText } from "@/components/sheet/sheet-text";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { evaluate } from "@/lib/sheet/formula";

export function TargetDialog({
  open,
  words,
  onClose,
  onSave
}: {
  open: boolean;
  words: ReturnType<typeof useSheetText>["words"];
  onClose: () => void;
  onSave: (target: { label: string; date: string; amount: number }) => void;
}) {
  const [label, setLabel] = useState(words.targetDefault);
  const [date, setDate] = useState("");
  const [amount, setAmount] = useState("");
  const value = evaluate(amount);
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!value || !value.ok || !date) return;
            onSave({ label, date, amount: value.value });
          }}
        >
          <DialogHeader>
            <DialogTitle>{words.addTarget}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="target-label">{words.targetLabel}</Label>
            <Input
              id="target-label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="target-date">{words.targetDate}</Label>
            <Input
              id="target-date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="target-amount">{words.targetAmount}</Label>
            <Input
              id="target-amount"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {words.cancel}
            </Button>
            <Button type="submit" disabled={!value || !value.ok || !date || !label.trim()}>
              {words.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
