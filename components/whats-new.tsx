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

// КОРОТКО, ПОДРОБНО — ПО НАЖАТИЮ. В 2.2.0 окно показывало все пункты целиком,
// с пояснениями, — на телефоне это были экраны текста, и дочитывать их никто
// не стал бы. Теперь пункт — одна строка с главным; пояснение раскрывается
// нажатием, одно за раз. Разделы, кроме первого, свёрнуты.

/** «— делает всё сразу» → «Делает всё сразу»: пояснение без тире в начале. */
function explanation(text: string): string {
  const bare = text.replace(/^[\s—–:,.-]+/, "");
  return bare.charAt(0).toUpperCase() + bare.slice(1);
}

function Item({
  item,
  open,
  onToggle
}: {
  item: WhatsNewItem;
  open: boolean;
  onToggle: () => void;
}) {
  // Без жирного или без пояснения раскрывать нечего — пункт одной строкой.
  if (!item.lead || !item.text) {
    return <li className="py-1.5 text-sm leading-snug">{item.lead || item.text}</li>;
  }
  return (
    <li>
      <button
        type="button"
        className="flex w-full items-start gap-2 py-1.5 text-left text-sm leading-snug"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className="flex-1 font-medium">{item.lead}</span>
        <ChevronDown
          className={cn(
            "mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
        />
      </button>
      {open ? (
        <p className="pb-2 pr-6 text-sm leading-relaxed text-muted-foreground">
          {explanation(item.text)}
        </p>
      ) : null}
    </li>
  );
}

function ReleaseBody({ release }: { release: WhatsNewRelease }) {
  const [openItem, setOpenItem] = useState<string | null>(null);
  const [openSections, setOpenSections] = useState<Set<string>>(
    () => new Set(release.sections.slice(0, 1).map((section) => section.title))
  );
  const toggleItem = (key: string) => setOpenItem((was) => (was === key ? null : key));
  const list = (items: WhatsNewItem[], prefix: string) => (
    <ul className="divide-y divide-border/60">
      {items.map((item, index) => {
        const key = `${prefix}-${index}`;
        return (
          <Item key={key} item={item} open={openItem === key} onToggle={() => toggleItem(key)} />
        );
      })}
    </ul>
  );

  if (release.kind === "fixes") {
    return list(
      release.sections.flatMap((section) => section.items),
      "fixes"
    );
  }
  return (
    <div className="space-y-2">
      {release.sections.map((section) => {
        const Icon = sectionIcon(section.title);
        const isOpen = openSections.has(section.title);
        return (
          <section key={section.title}>
            <button
              type="button"
              className="flex w-full items-center gap-2 py-1 text-left text-sm font-semibold"
              aria-expanded={isOpen}
              onClick={() =>
                setOpenSections((was) => {
                  const next = new Set(was);
                  if (next.has(section.title)) next.delete(section.title);
                  else next.add(section.title);
                  return next;
                })
              }
            >
              <span className="flex size-6 items-center justify-center rounded-md bg-primary/12 text-primary">
                <Icon className="size-3.5" />
              </span>
              <span className="flex-1">
                {section.title}
                <span className="ml-1.5 font-normal tabular-nums text-muted-foreground">
                  · {section.items.length}
                </span>
              </span>
              <ChevronDown
                className={cn(
                  "size-4 shrink-0 text-muted-foreground transition-transform",
                  isOpen && "rotate-180"
                )}
              />
            </button>
            {isOpen ? <div className="pl-8">{list(section.items, section.title)}</div> : null}
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
      <DialogContent
        className="gap-3 p-5 pb-0 sm:max-w-lg sm:p-6 sm:pb-0"
        data-testid="whats-new"
        // Фокус не на первый раздел: рамка фокуса на нём выглядела как ошибка.
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
              {newest.kind === "fixes" ? (
                <Wrench className="size-5" />
              ) : (
                <Sparkles className="size-5" />
              )}
            </span>
            <div className="min-w-0">
              <DialogTitle>{title}</DialogTitle>
              <p className="text-xs text-muted-foreground tabular-nums">
                {formatDate(newest.date, locale)}
              </p>
            </div>
          </div>
          {newest.summary ? (
            <DialogDescription className="leading-snug">{newest.summary}</DialogDescription>
          ) : (
            <DialogDescription className="sr-only">{title}</DialogDescription>
          )}
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

        {/* «Понятно» всегда на виду: подвал прилипает к низу окна, как ни
            прокручивай. */}
        <DialogFooter className="sticky bottom-0 -mx-5 border-t bg-card px-5 py-3 sm:-mx-6 sm:px-6">
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
