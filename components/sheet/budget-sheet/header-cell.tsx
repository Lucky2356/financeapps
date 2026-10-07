"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";

import { TINT } from "@/components/sheet/budget-sheet/helpers";
import type { useSheetText } from "@/components/sheet/sheet-text";
import type { DisplayColumn } from "@/components/sheet/sheet-types";
import { isSavingsKind } from "@/lib/sheet/model";
import { cn } from "@/lib/utils";

export function HeaderCell({
  item,
  last,
  active,
  words,
  href,
  categoryName,
  onOpen
}: {
  item: DisplayColumn;
  last: boolean;
  /** В этом столбце выбрана клетка — шапка подсвечивается. */
  active: boolean;
  words: ReturnType<typeof useSheetText>["words"];
  href: string | null;
  categoryName?: string;
  onOpen: () => void;
}) {
  if (item.type !== "column") {
    return (
      <th
        className={cn(
          "border-b px-2 py-2.5 text-right text-[13px] font-bold",
          active ? cn(TINT.ink14, "text-foreground") : TINT.warning25,
          !last && "border-r"
        )}
      >
        {item.type === "total" ? words.total : words.savingsTotal}
      </th>
    );
  }
  const { column } = item;
  return (
    <th
      className={cn(
        "max-w-[10rem] border-b border-r px-2 py-2.5 align-bottom text-[13px] font-semibold",
        column.kind === "note" ? "min-w-[11rem] text-left" : "text-right",
        // Полоска сверху говорит, что за столбец, раньше названия: доход — зелёная,
        // сбережения — бирюзовая, текст — серая.
        column.kind === "income" && "border-t-2 border-t-success",
        column.kind === "note" && "border-t-2 border-t-muted-foreground/40",
        isSavingsKind(column.kind) ? TINT.success10 : "bg-muted",
        active && cn(TINT.ink14, "text-foreground"),
        column.hidden && "opacity-50"
      )}
      title={
        categoryName
          ? `${words.operations}: ${categoryName}`
          : `${words.kinds[column.kind]} — ${words.kindHints[column.kind]}`
      }
    >
      <span
        className={cn(
          "flex items-end gap-1",
          column.kind === "note" ? "justify-start" : "justify-end"
        )}
      >
        {href ? (
          <Link
            href={href}
            className="line-clamp-2 text-foreground underline decoration-muted-foreground decoration-dotted underline-offset-4 hover:decoration-solid"
          >
            {column.name}
          </Link>
        ) : (
          <span className="line-clamp-2">{column.name}</span>
        )}
        <button
          type="button"
          aria-label={`${words.column}: ${column.name}`}
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted-foreground/10"
          onClick={onOpen}
        >
          <ChevronDown className="size-3.5" />
        </button>
      </span>
      {/* Вид столбца — подписью, если название его не повторяет («Подушка на
          начало» под «Подушкой на начало» читалась как опечатка). */}
      {column.kind !== "expense" &&
      words.kinds[column.kind].toLowerCase() !== column.name.trim().toLowerCase() ? (
        <span className="block text-[10px] font-normal text-muted-foreground">
          {words.kinds[column.kind]}
        </span>
      ) : null}
    </th>
  );
}
