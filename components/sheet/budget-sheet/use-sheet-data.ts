"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  EMPTY,
  EMPTY_REFS,
  type CellChange,
  type Facts
} from "@/components/sheet/budget-sheet/helpers";
import type { SheetFormat, SheetWords } from "@/components/sheet/sheet-types";
import { useApiPageData } from "@/hooks/use-api-page-data";
import { apiClient } from "@/lib/api/client";
import type { SheetPageData } from "@/lib/api/local/sheet";
import { clearMonth, copyMonth, factFill } from "@/lib/sheet/fill";
import { computeSheet, nextMonth } from "@/lib/sheet/model";

/**
 * Таблица из книги и запись в неё: чтение, правки клеток, отмена и правки
 * целыми месяцами. Факт из учёта читается здесь же.
 */
export function useSheetData({
  sheetId,
  current,
  words,
  format
}: {
  sheetId: string;
  current: string;
  words: SheetWords;
  format: SheetFormat;
}) {
  const { data: loaded, reload } = useApiPageData(
    EMPTY,
    `/sheet?sheet=${encodeURIComponent(sheetId)}`
  );
  const { data: refs, reload: reloadRefs } = useApiPageData(EMPTY_REFS, "/import");

  // Правки видны сразу, а в книгу уходят следом — ждать ответа на каждую
  // клетку в таблице на 20 столбцов было бы мучением.
  const [sheet, setSheet] = useState<SheetPageData>(loaded);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSheet(loaded);
  }, [loaded]);

  const [undo, setUndo] = useState<CellChange[][]>([]);
  const [facts, setFacts] = useState<Facts>({});

  const computed = useMemo(() => computeSheet(sheet), [sheet]);
  const categories = refs.categories;
  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories]
  );

  // Факт из учёта нужен всегда: строка выбранной клетки сверяет с ним план, не
  // только режим «Сравнить». Читается на весь размах таблицы и заново — только
  // когда размах изменился, а не на каждую правку клетки.
  const rangeFrom = computed.rows[0]?.month ?? "";
  const rangeTo = computed.rows[computed.rows.length - 1]?.month ?? "";
  useEffect(() => {
    if (!rangeFrom) return;
    let alive = true;
    apiClient
      .get(`/sheet/facts?from=${rangeFrom}&to=${rangeTo}`)
      .then((result) => alive && setFacts(result.months))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [rangeFrom, rangeTo]);

  // ── Запись ──────────────────────────────────────────────────────────────

  const save = useCallback(
    async (changes: CellChange[], options: { undoable?: boolean } = {}) => {
      if (changes.length === 0) return;
      if (options.undoable !== false) {
        const before = changes.map((change) => ({
          ...change,
          input:
            sheet.cells.find(
              (cell) => cell.month === change.month && cell.columnId === change.columnId
            )?.input ?? ""
        }));
        setUndo((stack) => [...stack.slice(-49), before]);
      }
      setSheet((was) => {
        let cells = was.cells;
        let months = was.months;
        for (const change of changes) {
          cells = cells.filter(
            (cell) => !(cell.month === change.month && cell.columnId === change.columnId)
          );
          if (change.input.trim()) cells = [...cells, change];
          if (!months.includes(change.month)) months = [...months, change.month].sort();
        }
        return { ...was, cells, months };
      });
      try {
        await apiClient.post("/sheet", { sheetId, action: "setCells", cells: changes });
      } catch (cause) {
        toast.error((cause as Error).message);
        await reload();
      }
    },
    [sheet.cells, reload, sheetId]
  );

  async function act(body: Record<string, unknown>, done?: string) {
    try {
      const result = await apiClient.post("/sheet", { ...body, sheetId });
      await reload();
      if (done) toast.success(done);
      return result;
    } catch (cause) {
      toast.error((cause as Error).message);
      return null;
    }
  }

  function undoLast() {
    const last = undo[undo.length - 1];
    if (!last) return;
    setUndo((stack) => stack.slice(0, -1));
    void save(last, { undoable: false });
  }

  // ── Массовые правки ─────────────────────────────────────────────────────

  async function addMonthsAfter(count: number) {
    let at = sheet.months[sheet.months.length - 1] ?? current;
    try {
      for (let index = 0; index < count; index += 1) {
        at = nextMonth(at);
        await apiClient.post("/sheet", { sheetId, action: "addMonth", month: at });
      }
      await reload();
      toast.success(format(words.monthsAdded, { count }));
    } catch (cause) {
      toast.error((cause as Error).message);
    }
  }

  function copyFromPrevious(month: string) {
    const index = computed.rows.findIndex((row) => row.month === month);
    if (index < 1) return;
    const changes = copyMonth(computed.rows, sheet.columns, computed.rows[index - 1].month, month);
    if (changes.length === 0) {
      toast(words.copyNothing);
      return;
    }
    void save(changes).then(() => toast.success(format(words.copied, { count: changes.length })));
  }

  function clearWholeMonth(month: string) {
    const changes = clearMonth(computed.rows, sheet.columns, month);
    if (changes.length === 0) return;
    void save(changes).then(() => toast.success(format(words.cleared, { count: changes.length })));
  }

  async function fillFromLedger() {
    if (computed.rows.length === 0) return;
    try {
      const result = await apiClient.get(`/sheet/facts?from=${rangeFrom}&to=${rangeTo}`);
      const changes = factFill(computed.rows, sheet.columns, result.months, {
        before: current,
        incomeCategoryIds: new Set(
          categories.filter((category) => category.kind === "INCOME").map((category) => category.id)
        )
      });
      if (changes.length === 0) {
        toast(words.fillFromLedgerNothing);
        return;
      }
      await save(changes);
      toast.success(format(words.fillFromLedgerDone, { count: changes.length }));
    } catch (cause) {
      toast.error((cause as Error).message);
    }
  }

  return {
    sheet,
    reload,
    reloadRefs,
    computed,
    categories,
    categoryById,
    facts,
    save,
    act,
    undoLast,
    addMonthsAfter,
    copyFromPrevious,
    clearWholeMonth,
    fillFromLedger
  };
}
