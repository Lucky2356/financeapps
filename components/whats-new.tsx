"use client";

// «Что нового» — один раз после обновления.
//
// Слова — из CHANGELOG (lib/whats-new/releases.generated.json), без второго
// места правды. Выпуск только с исправлениями так и называется — «Исправления
// в …»: человеку, который ждал нового, честнее сказать, что это починка.
// Пропустил несколько выпусков — видит их все, новый раскрыт, прежние свёрнуты.

import { ChevronDown, RefreshCw, ShieldCheck, Sparkles, Trash2, Wrench } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { APP_VERSION } from "@/lib/constants";
import { useI18n } from "@/lib/i18n/context";
import { ONBOARDING_STORAGE_KEY } from "@/lib/onboarding";
import { readMine, writeMine } from "@/lib/storage/mine";
import type { WhatsNewItem, WhatsNewRelease } from "@/lib/whats-new/parse";
import releasesJson from "@/lib/whats-new/releases.generated.json";
import { decideWhatsNew, MAX_RELEASES, WHATS_NEW_KEY } from "@/lib/whats-new/seen";
import { cn } from "@/lib/utils";

const RELEASES = releasesJson as WhatsNewRelease[];

/** «Настройки → О приложении» открывает окно этим событием. */
export const WHATS_NEW_OPEN_EVENT = "finapps:whats-new-open";

function sectionIcon(title: string) {
  if (/^исправлен/i.test(title)) return Wrench;
  if (/^безопасность/i.test(title)) return ShieldCheck;
  if (/^убрано/i.test(title)) return Trash2;
  if (/^изменено/i.test(title)) return RefreshCw;
  return Sparkles;
}

function formatDate(iso: string, locale: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(locale === "en" ? "en-GB" : "ru-RU", {
    day: "numeric",
    month: "long"
  });
}

function Item({ item }: { item: WhatsNewItem }) {
  // «**Главное** — пояснение», «**Главное**: пояснение»: перед знаком
  // препинания пробел не нужен.
  const glue = item.lead && item.text && !/^[,.:;]/.test(item.text) ? " " : "";
  return (
    <li className="text-sm leading-relaxed">
      {item.lead ? <span className="font-medium text-foreground">{item.lead}</span> : null}
      {glue}
      <span className="text-muted-foreground">{item.text}</span>
    </li>
  );
}

function ReleaseBody({ release }: { release: WhatsNewRelease }) {
  if (release.kind === "fixes") {
    return (
      <ul className="list-disc space-y-2 pl-5 marker:text-muted-foreground">
        {release.sections.flatMap((section) =>
          section.items.map((item, index) => <Item key={`${section.title}-${index}`} item={item} />)
        )}
      </ul>
    );
  }
  return (
    <div className="space-y-4">
      {release.sections.map((section) => {
        const Icon = sectionIcon(section.title);
        return (
          <section key={section.title} className="space-y-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <span className="flex size-6 items-center justify-center rounded-md bg-primary/12 text-primary">
                <Icon className="size-3.5" />
              </span>
              {section.title}
            </h3>
            <ul className="list-disc space-y-2 pl-5 marker:text-muted-foreground">
              {section.items.map((item, index) => (
                <Item key={index} item={item} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

export function WhatsNewDialog({
  releases,
  open,
  onOpenChange
}: {
  releases: WhatsNewRelease[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, locale } = useI18n();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [newest, ...older] = releases;
  if (!newest) return null;

  const title =
    newest.kind === "fixes"
      ? t("wn.titleFixes", { version: newest.version })
      : t("wn.title", { version: newest.version });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl" data-testid="whats-new">
        <DialogHeader>
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary/12 text-primary">
            {newest.kind === "fixes" ? (
              <Wrench className="size-6" />
            ) : (
              <Sparkles className="size-6" />
            )}
          </span>
          <DialogTitle className="mt-3">{title}</DialogTitle>
          <DialogDescription className="leading-relaxed">
            <span className="tabular-nums">{formatDate(newest.date, locale)}</span>
            {newest.summary ? ` · ${newest.summary}` : null}
          </DialogDescription>
        </DialogHeader>

        <ReleaseBody release={newest} />

        {older.length > 0 ? (
          <div className="space-y-2 border-t pt-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("wn.earlier")}
            </p>
            {older.map((release) => {
              const isOpen = expanded === release.version;
              return (
                <div key={release.version} className="rounded-lg border">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm"
                    aria-expanded={isOpen}
                    onClick={() => setExpanded(isOpen ? null : release.version)}
                  >
                    <span className="font-medium tabular-nums">{release.version}</span>
                    <span className="text-muted-foreground">
                      {formatDate(release.date, locale)}
                      {release.kind === "fixes" ? ` · ${t("wn.fixesOnly")}` : ""}
                    </span>
                    <ChevronDown
                      className={cn(
                        "ml-auto size-4 shrink-0 transition-transform",
                        isOpen && "rotate-180"
                      )}
                    />
                  </button>
                  {isOpen ? (
                    <div className="space-y-3 border-t px-3 py-3">
                      {release.summary ? (
                        <p className="text-sm text-muted-foreground">{release.summary}</p>
                      ) : null}
                      <ReleaseBody release={release} />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>
            {t("wn.ok")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Сам решает, показать ли окно после обновления; открывается и из настроек. */
export function WhatsNew() {
  const [releases, setReleases] = useState<WhatsNewRelease[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let decision;
    try {
      decision = decideWhatsNew({
        seen: readMine(WHATS_NEW_KEY),
        current: APP_VERSION,
        onboarded: Boolean(readMine(ONBOARDING_STORAGE_KEY)),
        releases: RELEASES
      });
    } catch {
      return; // localStorage недоступен — окно просто не покажется
    }
    if (decision.show) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setReleases(decision.releases);
      setOpen(true);
    } else if (decision.remember) {
      remember();
    }
  }, []);

  useEffect(() => {
    function openHistory() {
      setReleases(RELEASES.slice(0, MAX_RELEASES));
      setOpen(true);
    }
    window.addEventListener(WHATS_NEW_OPEN_EVENT, openHistory);
    return () => window.removeEventListener(WHATS_NEW_OPEN_EVENT, openHistory);
  }, []);

  return (
    <WhatsNewDialog
      releases={releases}
      open={open}
      onOpenChange={(value) => {
        if (!value) remember();
        setOpen(value);
      }}
    />
  );
}

function remember() {
  try {
    writeMine(WHATS_NEW_KEY, APP_VERSION);
  } catch {
    /* ignore */
  }
}
