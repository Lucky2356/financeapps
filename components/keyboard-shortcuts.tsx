"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const shortcuts = [
  { keys: "Alt+N", description: "Быстрое добавление операции" },
  { keys: "Alt+T", description: "Перейти к операциям" },
  { keys: "Alt+D", description: "Перейти на главную" },
  { keys: "Alt+A", description: "Перейти к аналитике" },
  { keys: "?", description: "Показать эту справку" },
];

export function KeyboardShortcuts() {
  const router = useRouter();
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      // Don't fire when typing in inputs
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement
      ) {
        return;
      }

      // Use event.code (physical key) so shortcuts work on any keyboard layout,
      // including Russian — event.key would be "т"/"е" etc. on a Cyrillic layout.
      if (event.altKey && event.code === "KeyN") {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent("quick-add-open"));
      } else if (event.altKey && event.code === "KeyT") {
        event.preventDefault();
        router.push("/transactions");
      } else if (event.altKey && event.code === "KeyD") {
        event.preventDefault();
        router.push("/");
      } else if (event.altKey && event.code === "KeyA") {
        event.preventDefault();
        router.push("/analytics");
      } else if ((event.key === "?" || (event.code === "Slash" && event.shiftKey)) && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        setShowHelp(true);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [router]);

  return (
    <Dialog open={showHelp} onOpenChange={setShowHelp}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Горячие клавиши</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2">
          {shortcuts.map((s) => (
            <div key={s.keys} className="flex items-center justify-between rounded-md border px-3 py-2">
              <span className="text-sm text-muted-foreground">{s.description}</span>
              <kbd className="rounded bg-muted px-2 py-1 font-mono text-xs">{s.keys}</kbd>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Горячие клавиши не работают, когда фокус находится в поле ввода.</p>
      </DialogContent>
    </Dialog>
  );
}
