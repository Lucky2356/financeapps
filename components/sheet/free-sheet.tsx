"use client";

// Свободный лист: клетки как в Excel.
//
// Сюда попадает всё, что из Excel переносится не бюджетом: списки, расчёты,
// таблички кредитов. Управление — как в Excel и как в бюджетном листе: выбор
// нажатием, ввод — двойным нажатием, Enter или просто набором; Enter — вниз,
// Tab — вправо, стрелки, Delete, Ctrl+V блоком прямо из Excel. Число и формула
// (`=СУММ(1;2)`, `1200*3`) считаются, остальное — текст как есть.

import { Plus, Rows3, Columns3 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { QUIET_BUTTON } from "@/components/sheet/sheet-types";
import { Button } from "@/components/ui/button";
import { useApiPageData } from "@/hooks/use-api-page-data";
import { apiClient } from "@/lib/api/client";
import { columnLetter, freeValue, type WorkbookPage } from "@/lib/api/local/sheets";
import { useI18n } from "@/lib/i18n/context";
import { gridFromText } from "@/lib/sheet/import";
import { cn } from "@/lib/utils";

type Cell = { r: number; c: number; input: string };
type Position = { r: number; c: number };

const EMPTY: WorkbookPage = {
  sheets: [],
  sheet: { id: "", name: "", kind: "free" },
  budget: null,
  free: { rows: 30, cols: 8, cells: [] }
};

export function FreeSheet({ sheetId, onChanged }: { sheetId: string; onChanged: () => void }) {
  const { t, locale } = useI18n();
  const { data, reload } = useApiPageData(EMPTY, `/workbook?sheet=${encodeURIComponent(sheetId)}`);
  const free = data.free ?? EMPTY.free!;

  // Правки видны сразу, в книгу уходят следом.
  const [inputs, setInputs] = useState<Map<string, string>>(new Map());
  const [size, setSize] = useState({ rows: free.rows, cols: free.cols });
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setInputs(new Map(free.cells.map((cell) => [`${cell.r}|${cell.c}`, cell.input])));
    setSize({ rows: free.rows, cols: free.cols });
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [free]);

  const [selected, setSelected] = useState<Position | null>(null);
  const [editing, setEditing] = useState<{ position: Position; draft: string } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  // Ввод закрыт с клавиатуры (Enter, Tab, Esc) — следующая потеря фокуса полем
  // ввода уже ничего не значит. Без этого «сохранить на месте» при потере фокуса
  // возвращало выбор на ту же клетку, и Enter не опускал вниз.
  const closedByKey = useRef(false);

  const number = useCallback(
    (value: number) =>
      value.toLocaleString(locale === "en" ? "en-GB" : "ru-RU", { maximumFractionDigits: 2 }),
    [locale]
  );

  const save = useCallback(
    async (cells: Cell[]) => {
      setInputs((was) => {
        const next = new Map(was);
        for (const cell of cells) {
          if (cell.input.trim()) next.set(`${cell.r}|${cell.c}`, cell.input);
          else next.delete(`${cell.r}|${cell.c}`);
        }
        return next;
      });
      setSize((was) => ({
        rows: Math.max(was.rows, ...cells.map((cell) => cell.r + 1)),
        cols: Math.max(was.cols, ...cells.map((cell) => cell.c + 1))
      }));
      try {
        await apiClient.post("/sheet", { sheetId, action: "setFree", cells });
      } catch (cause) {
        toast.error((cause as Error).message);
        await reload();
      }
    },
    [sheetId, reload]
  );

  async function act(body: Record<string, unknown>) {
    try {
      await apiClient.post("/sheet", { sheetId, ...body });
      await reload();
      onChanged();
    } catch (cause) {
      toast.error((cause as Error).message);
    }
  }

  function commit(position: Position, draft: string, then: "down" | "right" | "stay") {
    if (then !== "stay") closedByKey.current = true;
    const before = inputs.get(`${position.r}|${position.c}`) ?? "";
    setEditing(null);
    if (draft !== before) void save([{ ...position, input: draft }]);
    const next =
      then === "down"
        ? { r: position.r + 1, c: position.c }
        : then === "right"
          ? { r: position.r, c: position.c + 1 }
          : position;
    setSelected(next);
    gridRef.current?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (editing || !selected) return;
    const move = (dr: number, dc: number) => {
      event.preventDefault();
      setSelected({
        r: Math.max(0, Math.min(size.rows - 1, selected.r + dr)),
        c: Math.max(0, Math.min(size.cols - 1, selected.c + dc))
      });
    };
    if (event.key === "ArrowDown") return move(1, 0);
    if (event.key === "ArrowUp") return move(-1, 0);
    if (event.key === "ArrowRight") return move(0, 1);
    if (event.key === "ArrowLeft") return move(0, -1);
    if (event.key === "Tab") return move(0, event.shiftKey ? -1 : 1);
    if (event.key === "Enter" || event.key === "F2") {
      event.preventDefault();
      setEditing({ position: selected, draft: inputs.get(`${selected.r}|${selected.c}`) ?? "" });
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      void save([{ ...selected, input: "" }]);
      return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      setEditing({ position: selected, draft: event.key });
    }
  }

  function onPaste(event: React.ClipboardEvent<HTMLDivElement>) {
    if (editing || !selected) return;
    const text = event.clipboardData.getData("text/plain");
    if (!text) return;
    event.preventDefault();
    const grid = gridFromText(text);
    const cells: Cell[] = [];
    grid.forEach((line, dr) =>
      line.forEach((input, dc) => cells.push({ r: selected.r + dr, c: selected.c + dc, input }))
    );
    if (cells.length) void save(cells);
  }

  const values = useMemo(() => {
    const map = new Map<string, ReturnType<typeof freeValue>>();
    for (const [key, input] of inputs) map.set(key, freeValue(input));
    return map;
  }, [inputs]);

  const rows = Array.from({ length: size.rows }, (_, index) => index);
  const cols = Array.from({ length: size.cols }, (_, index) => index);

  return (
    <div className="space-y-3" data-testid="free-sheet">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={QUIET_BUTTON}
          onClick={() => void act({ action: "resizeFree", rows: size.rows + 10, cols: size.cols })}
        >
          <Plus className="size-4" />
          {t("wb.addRows")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={QUIET_BUTTON}
          onClick={() => void act({ action: "resizeFree", rows: size.rows, cols: size.cols + 1 })}
        >
          <Plus className="size-4" />
          {t("wb.addCol")}
        </Button>
        {selected ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className={QUIET_BUTTON}
              onClick={() => void act({ action: "removeFreeRow", index: selected.r })}
            >
              <Rows3 className="size-4" />
              {t("wb.removeRow", { row: selected.r + 1 })}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className={QUIET_BUTTON}
              onClick={() => void act({ action: "removeFreeCol", index: selected.c })}
            >
              <Columns3 className="size-4" />
              {t("wb.removeCol", { col: columnLetter(selected.c) })}
            </Button>
          </>
        ) : null}
        <p className="w-full text-xs text-muted-foreground sm:ml-auto sm:w-auto">
          {t("wb.freeHint")}
        </p>
      </div>

      <div
        ref={gridRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        className="max-h-[70vh] overflow-auto rounded-lg border bg-card outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="free-grid"
      >
        <table className="border-separate border-spacing-0 text-sm tabular-nums">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-30 min-w-10 border-b border-r bg-muted px-2 py-1" />
              {cols.map((c) => (
                <th
                  key={c}
                  scope="col"
                  className={cn(
                    "sticky top-0 z-20 min-w-28 border-b border-r bg-muted px-2 py-1 text-center text-xs font-semibold text-muted-foreground",
                    selected?.c === c && "bg-foreground/10 text-foreground"
                  )}
                >
                  {columnLetter(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r}>
                <th
                  scope="row"
                  className={cn(
                    "sticky left-0 z-10 border-b border-r bg-muted px-2 py-1 text-right text-xs font-semibold text-muted-foreground",
                    selected?.r === r && "bg-foreground/10 text-foreground"
                  )}
                >
                  {r + 1}
                </th>
                {cols.map((c) => {
                  const key = `${r}|${c}`;
                  const input = inputs.get(key) ?? "";
                  const shown = values.get(key);
                  const isSelected = selected?.r === r && selected?.c === c;
                  const isEditing = editing?.position.r === r && editing.position.c === c;
                  const numeric = shown?.value !== null && shown?.value !== undefined;
                  return (
                    <td
                      key={c}
                      data-cell={`${columnLetter(c)}${r + 1}`}
                      className={cn(
                        "relative h-9 max-w-[16rem] border-b border-r px-2",
                        numeric ? "text-right" : "text-left",
                        shown?.error && "text-destructive",
                        isSelected && "outline outline-2 -outline-offset-2 outline-foreground"
                      )}
                      title={
                        shown?.error
                          ? t("wb.formulaError")
                          : input.startsWith("=")
                            ? input
                            : undefined
                      }
                      onClick={() => {
                        setSelected({ r, c });
                        gridRef.current?.focus();
                      }}
                      onDoubleClick={() => setEditing({ position: { r, c }, draft: input })}
                    >
                      {isEditing ? (
                        <input
                          autoFocus
                          className="absolute inset-0 w-full bg-card px-2 text-sm outline-none ring-2 ring-inset ring-foreground"
                          value={editing.draft}
                          aria-label={`${columnLetter(c)}${r + 1}`}
                          onChange={(event) =>
                            setEditing({ position: { r, c }, draft: event.target.value })
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              commit({ r, c }, editing.draft, "down");
                            } else if (event.key === "Tab") {
                              event.preventDefault();
                              commit({ r, c }, editing.draft, "right");
                            } else if (event.key === "Escape") {
                              event.preventDefault();
                              closedByKey.current = true;
                              setEditing(null);
                              gridRef.current?.focus();
                            }
                          }}
                          onBlur={() => {
                            if (closedByKey.current) {
                              closedByKey.current = false;
                              return;
                            }
                            commit({ r, c }, editing.draft, "stay");
                          }}
                        />
                      ) : (
                        <span className="block truncate">
                          {shown?.error ? "#!" : numeric ? number(shown!.value!) : input}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
