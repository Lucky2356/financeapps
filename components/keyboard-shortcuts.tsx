"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/lib/i18n/context";

const shortcuts = [
  { keys: "Alt+N", descKey: "set.shortcut.add" },
  { keys: "Alt+T", descKey: "set.shortcut.transactions" },
  { keys: "Alt+D", descKey: "set.shortcut.home" },
  { keys: "Alt+A", descKey: "set.shortcut.analytics" },
  { keys: "?", descKey: "set.shortcut.help" }
];

export function KeyboardShortcuts() {
  const router = useRouter();
  const { t } = useI18n();
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
      } else if (
        (event.key === "?" || (event.code === "Slash" && event.shiftKey)) &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
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
          <DialogTitle>{t("set.about.shortcuts")}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2">
          {shortcuts.map((s) => (
            <div
              key={s.keys}
              className="flex items-center justify-between rounded-md border px-3 py-2"
            >
              <span className="text-sm text-muted-foreground">{t(s.descKey)}</span>
              <kbd className="rounded bg-muted px-2 py-1 font-mono text-xs">{s.keys}</kbd>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{t("ks.footer")}</p>
      </DialogContent>
    </Dialog>
  );
}
