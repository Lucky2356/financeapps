"use client";

// Свободный лист: клетки как в Excel.
//
// Сюда попадает всё, что из Excel переносится не бюджетом: списки, расчёты,
// таблички кредитов. Управление — как в Excel и как в бюджетном листе: выбор
// нажатием, ввод — двойным нажатием, Enter или просто набором; Enter — вниз,
// Tab — вправо, стрелки, Delete, Ctrl+V блоком прямо из Excel.
//
// И то, без чего «как в Excel» не выходило: ссылки в формулах (`=A1*B1`,
// `=СУММ(B2:B20)`, lib/sheet/free-grid.ts), выделение диапазона (Shift со
// стрелками, Shift+нажатие, протяжка мышью) с суммой выделенного внизу,
// Ctrl+C / Ctrl+X / Ctrl+Z, строка формулы над листом — в ней видно и
// правится то, что в клетке на самом деле, — и вставка строки или столбца.

import { Columns3, Plus, Rows3, Undo2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { QUIET_BUTTON } from "@/components/sheet/sheet-types";
import { Button } from "@/components/ui/button";
import { useApiPageData } from "@/hooks/use-api-page-data";
import { apiClient } from "@/lib/api/client";
import { columnLetter, freeValue, type WorkbookPage } from "@/lib/api/local/sheets";
import { useI18n } from "@/lib/i18n/context";
import { evaluateFreeGrid } from "@/lib/sheet/free-grid";
import {
  boxOf,
  inBox,
  positionsIn,
  selectionAsText,
  selectionStats,
  type Position,
  type Selection
} from "@/lib/sheet/free-selection";
import { gridFromClipboard } from "@/lib/sheet/import";
import { cn } from "@/lib/utils";

type Cell = { r: number; c: number; input: string };

const EMPTY: WorkbookPage = {
  sheets: [],
  sheet: { id: "", name: "", kind: "free" },
  budget: null,
  free: { rows: 30, cols: 8, cells: [] }
};

/** Сколько правок помнит Ctrl+Z. */
const UNDO_DEPTH = 50;

const keyOf = ({ r, c }: Position) => `${r}|${c}`;

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

  const [selection, setSelection] = useState<Selection | null>(null);
  const selected = selection?.focus ?? null;
  const box = selection ? boxOf(selection) : null;
  const [editing, setEditing] = useState<{ position: Position; draft: string } | null>(null);
  // Строка формулы: свой черновик, пока в ней печатают.
  const [barDraft, setBarDraft] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  // Протяжка мышью: нажата ли кнопка над листом.
  const dragging = useRef(false);
  // Ввод закрыт с клавиатуры (Enter, Tab, Esc) — следующая потеря фокуса полем
  // ввода уже ничего не значит. Без этого «сохранить на месте» при потере фокуса
  // возвращало выбор на ту же клетку, и Enter не опускал вниз.
  const closedByKey = useRef(false);
  // Что было в клетках до каждой правки — для Ctrl+Z.
  const [history, setHistory] = useState<Cell[][]>([]);

  useEffect(() => {
    const up = () => {
      dragging.current = false;
    };
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, []);

  const number = useCallback(
    (value: number) =>
      value.toLocaleString(locale === "en" ? "en-GB" : "ru-RU", { maximumFractionDigits: 2 }),
    [locale]
  );

  const save = useCallback(
    async (cells: Cell[], options: { undoable?: boolean } = {}) => {
      if (options.undoable !== false) {
        const before = cells.map((cell) => ({ ...cell, input: inputs.get(keyOf(cell)) ?? "" }));
        setHistory((was) => [...was.slice(-(UNDO_DEPTH - 1)), before]);
      }
      setInputs((was) => {
        const next = new Map(was);
        for (const cell of cells) {
          if (cell.input.trim()) next.set(keyOf(cell), cell.input);
          else next.delete(keyOf(cell));
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
    [sheetId, reload, inputs]
  );

  function undo() {
    const last = history[history.length - 1];
    if (!last) return;
    setHistory((was) => was.slice(0, -1));
    void save(last, { undoable: false });
  }

  async function act(body: Record<string, unknown>) {
    try {
      await apiClient.post("/sheet", { sheetId, ...body });
      // Строки и столбцы сдвинулись — прежние «до правки» указывают не туда.
      setHistory([]);
      await reload();
      onChanged();
    } catch (cause) {
      toast.error((cause as Error).message);
    }
  }

  function select(position: Position, extend = false) {
    setBarDraft(null);
    setSelection((was) =>
      extend && was
        ? { anchor: was.anchor, focus: position }
        : { anchor: position, focus: position }
    );
  }

  function commit(position: Position, draft: string, then: "down" | "right" | "stay") {
    if (then !== "stay") closedByKey.current = true;
    const before = inputs.get(keyOf(position)) ?? "";
    setEditing(null);
    if (draft !== before) void save([{ ...position, input: draft }]);
    const next =
      then === "down"
        ? { r: position.r + 1, c: position.c }
        : then === "right"
          ? { r: position.r, c: position.c + 1 }
          : position;
    select(next);
    gridRef.current?.focus();
  }

  function clearSelection() {
    if (!box) return;
    const cells = positionsIn(box)
      .filter((position) => inputs.has(keyOf(position)))
      .map((position) => ({ ...position, input: "" }));
    if (cells.length) void save(cells);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (editing || !selected) return;
    const ctrl = event.ctrlKey || event.metaKey;
    const move = (dr: number, dc: number) => {
      event.preventDefault();
      select(
        {
          r: Math.max(0, Math.min(size.rows - 1, selected.r + dr)),
          c: Math.max(0, Math.min(size.cols - 1, selected.c + dc))
        },
        event.shiftKey && event.key !== "Tab"
      );
    };
    if (event.key === "ArrowDown") return move(1, 0);
    if (event.key === "ArrowUp") return move(-1, 0);
    if (event.key === "ArrowRight") return move(0, 1);
    if (event.key === "ArrowLeft") return move(0, -1);
    if (event.key === "Tab") return move(0, event.shiftKey ? -1 : 1);
    if (ctrl && event.key.toLowerCase() === "z") {
      event.preventDefault();
      undo();
      return;
    }
    if (ctrl && event.key.toLowerCase() === "a") {
      event.preventDefault();
      setSelection({ anchor: { r: 0, c: 0 }, focus: { r: size.rows - 1, c: size.cols - 1 } });
      return;
    }
    // Ctrl+C и Ctrl+X — через события буфера ниже: так браузер сам кладёт текст.
    if (ctrl) return;
    if (event.key === "Enter" || event.key === "F2") {
      event.preventDefault();
      setEditing({ position: selected, draft: inputs.get(keyOf(selected)) ?? "" });
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      clearSelection();
      return;
    }
    if (event.key.length === 1 && !event.altKey) {
      event.preventDefault();
      setEditing({ position: selected, draft: event.key });
    }
  }

  function onCopy(event: React.ClipboardEvent<HTMLDivElement>) {
    if (editing || !box) return;
    event.preventDefault();
    event.clipboardData.setData("text/plain", selectionAsText(box, inputs));
  }

  function onCut(event: React.ClipboardEvent<HTMLDivElement>) {
    if (editing || !box) return;
    onCopy(event);
    clearSelection();
  }

  function onPaste(event: React.ClipboardEvent<HTMLDivElement>) {
    if (editing || !box) return;
    const text = event.clipboardData.getData("text/plain");
    if (!text) return;
    event.preventDefault();
    const grid = gridFromClipboard(text);
    const cells: Cell[] = [];
    // Одна клетка в буфере и выделен диапазон — заполнить им весь диапазон,
    // как в Excel. Иначе — блок с верхнего левого угла выделения.
    if (grid.length === 1 && grid[0].length === 1) {
      for (const position of positionsIn(box)) cells.push({ ...position, input: grid[0][0] });
    } else {
      grid.forEach((line, dr) =>
        line.forEach((input, dc) => cells.push({ r: box.top + dr, c: box.left + dc, input }))
      );
    }
    if (cells.length) void save(cells);
  }

  const values = useMemo(() => evaluateFreeGrid(inputs, freeValue), [inputs]);
  const stats =
    box && (box.bottom > box.top || box.right > box.left) ? selectionStats(box, values) : null;

  const rows = Array.from({ length: size.rows }, (_, index) => index);
  const cols = Array.from({ length: size.cols }, (_, index) => index);
  const address = selected ? `${columnLetter(selected.c)}${selected.r + 1}` : "";
  const barValue = barDraft ?? (selected ? (inputs.get(keyOf(selected)) ?? "") : "");

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
              onClick={() => void act({ action: "insertFreeRow", index: selected.r })}
              data-testid="free-insert-row"
            >
              <Rows3 className="size-4" />
              {t("wb.insertRow")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className={QUIET_BUTTON}
              onClick={() => void act({ action: "insertFreeCol", index: selected.c })}
            >
              <Columns3 className="size-4" />
              {t("wb.insertCol")}
            </Button>
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
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={QUIET_BUTTON}
          disabled={history.length === 0}
          onClick={undo}
          data-testid="free-undo"
        >
          <Undo2 className="size-4" />
          {t("wb.undo")}
        </Button>
      </div>

      {/* Строка формулы: в клетке видно посчитанное, здесь — что в ней на
          самом деле, и это можно править, не открывая клетку. */}
      <div className="flex items-center gap-2 rounded-lg border bg-card px-2 py-1.5">
        <span
          className="min-w-12 rounded bg-muted px-2 py-1 text-center text-xs font-semibold tabular-nums text-muted-foreground"
          data-testid="free-address"
        >
          {address || "—"}
        </span>
        <span className="text-sm italic text-muted-foreground">fx</span>
        <input
          className="h-8 min-w-0 flex-1 bg-transparent px-1 text-sm outline-none disabled:opacity-60"
          disabled={!selected}
          value={barValue}
          aria-label={t("wb.formulaBar", { cell: address })}
          placeholder={selected ? t("wb.formulaBarHint") : t("wb.formulaBarPick")}
          data-testid="free-formula-bar"
          onChange={(event) => setBarDraft(event.target.value)}
          onKeyDown={(event) => {
            if (!selected) return;
            if (event.key === "Enter") {
              event.preventDefault();
              const draft = barDraft ?? inputs.get(keyOf(selected)) ?? "";
              setBarDraft(null);
              commit(selected, draft, "down");
            } else if (event.key === "Escape") {
              event.preventDefault();
              setBarDraft(null);
              gridRef.current?.focus();
            }
          }}
          onBlur={() => {
            if (!selected || barDraft === null) return;
            const draft = barDraft;
            setBarDraft(null);
            if (draft !== (inputs.get(keyOf(selected)) ?? "")) {
              void save([{ ...selected, input: draft }]);
            }
          }}
        />
      </div>

      <div
        ref={gridRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onCopy={onCopy}
        onCut={onCut}
        onPaste={onPaste}
        className="max-h-[70vh] select-none overflow-auto rounded-lg border bg-card outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                    "sticky top-0 z-20 min-w-28 cursor-pointer border-b border-r bg-muted px-2 py-1 text-center text-xs font-semibold text-muted-foreground",
                    box && c >= box.left && c <= box.right && "bg-foreground/10 text-foreground"
                  )}
                  // Нажатие на букву — весь столбец, как в Excel.
                  onClick={(event) => {
                    setBarDraft(null);
                    setSelection((was) => ({
                      anchor: event.shiftKey && was ? { r: 0, c: was.anchor.c } : { r: 0, c },
                      focus: { r: size.rows - 1, c }
                    }));
                    gridRef.current?.focus();
                  }}
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
                    "sticky left-0 z-10 cursor-pointer border-b border-r bg-muted px-2 py-1 text-right text-xs font-semibold text-muted-foreground",
                    box && r >= box.top && r <= box.bottom && "bg-foreground/10 text-foreground"
                  )}
                  // Нажатие на номер — вся строка.
                  onClick={(event) => {
                    setBarDraft(null);
                    setSelection((was) => ({
                      anchor: event.shiftKey && was ? { r: was.anchor.r, c: 0 } : { r, c: 0 },
                      focus: { r, c: size.cols - 1 }
                    }));
                    gridRef.current?.focus();
                  }}
                >
                  {r + 1}
                </th>
                {cols.map((c) => {
                  const key = `${r}|${c}`;
                  const input = inputs.get(key) ?? "";
                  const shown = values.get(key);
                  const isFocus = selected?.r === r && selected?.c === c;
                  const isInRange = !!box && inBox(box, r, c) && !isFocus;
                  const isEditing = editing?.position.r === r && editing.position.c === c;
                  const numeric = shown?.value !== null && shown?.value !== undefined;
                  return (
                    <td
                      key={c}
                      data-cell={`${columnLetter(c)}${r + 1}`}
                      aria-selected={isFocus || isInRange}
                      className={cn(
                        "relative h-9 max-w-[16rem] border-b border-r px-2",
                        numeric ? "text-right" : "text-left",
                        shown?.error && "text-destructive",
                        isInRange && "bg-primary/10",
                        isFocus && "outline outline-2 -outline-offset-2 outline-foreground"
                      )}
                      title={
                        shown?.error
                          ? t("wb.formulaError")
                          : input.startsWith("=")
                            ? input
                            : undefined
                      }
                      onPointerDown={(event) => {
                        if (event.button !== 0 || isEditing) return;
                        dragging.current = true;
                        select({ r, c }, event.shiftKey);
                        gridRef.current?.focus();
                      }}
                      onPointerEnter={() => {
                        if (!dragging.current) return;
                        setSelection((was) =>
                          was ? { anchor: was.anchor, focus: { r, c } } : was
                        );
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

      {/* Строка состояния, как в Excel: сумма выделенного — ради неё лист
          чаще всего и открывают. */}
      <div className="flex min-h-5 flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span data-testid="free-stats" className="tabular-nums">
          {stats
            ? t("wb.stats", {
                sum: number(stats.sum),
                average: number(stats.average),
                count: stats.count
              })
            : null}
        </span>
        <span>{t("wb.freeHint")}</span>
      </div>
    </div>
  );
}
