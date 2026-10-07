"use client";

// «Таблица» — своя таблица бюджета, как у человека в Excel.
//
// Как в Excel и работает: ячейку выделяют нажатием, вводят двойным нажатием
// или просто начав печатать, Enter уводит вниз, Tab — вправо, стрелки ходят,
// Delete стирает, Ctrl+C/Ctrl+V копируют — в том числе целый блок прямо из
// Excel, Ctrl+Z отменяет. Остаток и Итог считаются сами (серым — посчитанное).
//
// Чем больше, чем Excel: статья, связанная с категорией, открывает свои
// операции в учёте — названием столбца за всё время, значком ↗ у ячейки — за
// её месяц. И «Сравнить с учётом» показывает под числом, сколько на самом деле
// ушло.
//
// На телефоне та же таблица (липкий месяц, прокрутка вбок), а ячейка
// правится в окне: в клетку шириной в палец формулу не напечатать.

import { useMemo, useRef, useState } from "react";

import { cellBarInfo } from "@/components/sheet/budget-sheet/cell-bar-info";
import { SheetColumnDialog } from "@/components/sheet/budget-sheet/column-dialog-host";
import { exportCsv } from "@/components/sheet/budget-sheet/export-csv";
import {
  HELP_KEY,
  VIEW_KEY,
  remember,
  thisMonth,
  type PhoneView
} from "@/components/sheet/budget-sheet/helpers";
import { MonthMenuDialog } from "@/components/sheet/budget-sheet/month-menu-dialog";
import { PhoneCellDialog } from "@/components/sheet/budget-sheet/phone-cell-editor";
import { SheetEmpty } from "@/components/sheet/budget-sheet/sheet-empty";
import { SheetGrid } from "@/components/sheet/budget-sheet/sheet-grid";
import { SheetTargets } from "@/components/sheet/budget-sheet/sheet-targets";
import { SheetToolbar } from "@/components/sheet/budget-sheet/sheet-toolbar";
import { TargetDialog } from "@/components/sheet/budget-sheet/target-dialog";
import { useSheetData } from "@/components/sheet/budget-sheet/use-sheet-data";
import { useSheetEdits } from "@/components/sheet/budget-sheet/use-sheet-edits";
import { useSheetPrefs } from "@/components/sheet/budget-sheet/use-sheet-prefs";
import type { ColumnDraft } from "@/components/sheet/column-dialog";
import { SheetCellBar } from "@/components/sheet/sheet-cell-bar";
import { SheetHelp } from "@/components/sheet/sheet-help";
import { SheetImportDialog } from "@/components/sheet/sheet-import-dialog";
import { SheetMonthView } from "@/components/sheet/sheet-month-view";
import { SheetSummary } from "@/components/sheet/sheet-summary";
import { useSheetText } from "@/components/sheet/sheet-text";
import type { DisplayColumn, Position } from "@/components/sheet/sheet-types";
import { Segmented } from "@/components/ui/segmented";
import { useMediaQuery } from "@/hooks/use-media-query";
import { formatCurrency } from "@/lib/format";
import { firstShortfall, focusRow, monthsAhead } from "@/lib/sheet/insights";
import { isSavingsKind, orderedColumns } from "@/lib/sheet/model";

export function BudgetSheet({ sheetId = "main" }: { sheetId?: string }) {
  const { words, format, locale } = useSheetText();
  const current = thisMonth();
  const {
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
  } = useSheetData({ sheetId, current, words, format });
  const phone = useMediaQuery("(max-width: 767px)");

  const [showHidden, setShowHidden] = useState(false);
  const [columnDialog, setColumnDialog] = useState<ColumnDraft | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [phoneCell, setPhoneCell] = useState<Position | null>(null);
  const [monthMenu, setMonthMenu] = useState<string | null>(null);
  const [targetOpen, setTargetOpen] = useState(false);
  // На телефоне редкие действия — под «Ещё»: иначе панель занимала полэкрана,
  // а таблица начиналась ниже сгиба.
  const [more, setMore] = useState(false);
  const [monthIndex, setMonthIndex] = useState<number | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const barInput = useRef<HTMLInputElement>(null);
  const { compare, setCompare, density, setDensity, view, setView, helpOpen, setHelpOpen } =
    useSheetPrefs();

  const display = useMemo<DisplayColumn[]>(() => {
    const visible = orderedColumns(sheet.columns).filter((column) => showHidden || !column.hidden);
    const main = visible.filter((column) => !isSavingsKind(column.kind));
    const savings = visible.filter((column) => isSavingsKind(column.kind));
    return [
      ...main.map((column) => ({ type: "column" as const, column })),
      { type: "total" as const },
      ...savings.map((column) => ({ type: "column" as const, column })),
      { type: "savingsTotal" as const }
    ];
  }, [sheet.columns, showHidden]);

  const hiddenCount = sheet.columns.filter((column) => column.hidden).length;

  const money = (value: number) => formatCurrency(Math.round(value), "RUB");
  const plain = (value: number) =>
    value.toLocaleString(locale === "en" ? "en-GB" : "ru-RU", { maximumFractionDigits: 2 });

  const {
    selected,
    setSelected,
    editing,
    setEditing,
    tableRef,
    columnAt,
    startEdit,
    commit,
    fillDown,
    onKeyDown,
    onPaste,
    onEditKeyDown,
    onBarFocus,
    onBarChange,
    barDraft,
    goToMonth,
    copyToNextMonth,
    clearSelected
  } = useSheetEdits({
    display,
    computed,
    phone,
    view,
    current,
    words,
    format,
    save,
    undoLast,
    setPhoneCell,
    setMonthIndex
  });

  // ── Вид ─────────────────────────────────────────────────────────────────

  if (sheet.columns.length === 0) {
    return (
      <SheetEmpty
        sheetId={sheetId}
        words={words}
        format={format}
        categories={categories}
        current={current}
        wizardOpen={wizardOpen}
        setWizardOpen={setWizardOpen}
        importOpen={importOpen}
        setImportOpen={setImportOpen}
        act={act}
        reload={reload}
        reloadRefs={reloadRefs}
      />
    );
  }

  const selectedRow = selected ? computed.rows[selected.row] : null;
  const focus = focusRow(computed.rows, current);
  const shortfall = firstShortfall(computed.rows, current);
  const hasSavings = sheet.columns.some((column) => isSavingsKind(column.kind));
  const focusIndex = focus ? computed.rows.findIndex((row) => row.month === focus.month) : 0;
  const shownIndex = Math.max(0, Math.min(computed.rows.length - 1, monthIndex ?? focusIndex));
  const showTable = !phone || view === "table";

  return (
    <div className="space-y-3" data-testid="budget-sheet">
      {/* Панель: то, что делают с таблицей целиком. */}
      <SheetToolbar
        words={words}
        phone={phone}
        sheet={sheet}
        current={current}
        focus={focus}
        hiddenCount={hiddenCount}
        helpOpen={helpOpen}
        setHelpOpen={setHelpOpen}
        more={more}
        setMore={setMore}
        density={density}
        setDensity={setDensity}
        showHidden={showHidden}
        setShowHidden={setShowHidden}
        compare={compare}
        setCompare={setCompare}
        setColumnDialog={setColumnDialog}
        setTargetOpen={setTargetOpen}
        setImportOpen={setImportOpen}
        act={act}
        fillFromLedger={fillFromLedger}
        goToMonth={goToMonth}
        addMonthsAfter={addMonthsAfter}
        exportCsv={() => exportCsv(display, computed.rows, words)}
      />

      {helpOpen ? (
        <SheetHelp
          words={words}
          showKeys={!phone}
          onClose={() => {
            setHelpOpen(false);
            remember(HELP_KEY, "1");
          }}
        />
      ) : null}

      {focus ? (
        <SheetSummary
          row={focus}
          words={words}
          format={format}
          locale={locale}
          money={money}
          hasSavings={hasSavings}
          shortfall={shortfall}
          monthsLeft={monthsAhead(computed.rows, current)}
          onShowMonth={goToMonth}
          onAddYear={() => void addMonthsAfter(12)}
        />
      ) : null}

      <SheetTargets
        rows={computed.rows}
        targets={sheet.targets}
        money={money}
        onRemove={(id) => void act({ action: "removeTarget", id })}
      />

      {phone ? (
        <Segmented<PhoneView>
          ariaLabel={words.viewTable}
          className="w-full max-w-xs"
          value={view}
          options={[
            { value: "months", label: words.viewMonths },
            { value: "table", label: words.viewTable }
          ]}
          onChange={(next) => {
            setView(next);
            remember(VIEW_KEY, next);
          }}
        />
      ) : (
        <SheetCellBar
          words={words}
          format={format}
          info={cellBarInfo({
            phone,
            selected,
            selectedRow,
            display,
            editing,
            facts,
            words,
            format,
            locale,
            money,
            plain
          })}
          draft={barDraft}
          inputRef={barInput}
          onFocus={onBarFocus}
          onChange={onBarChange}
          onKeyDown={onEditKeyDown}
          onBlur={() => commit()}
          onFillDown={() => selected && fillDown(selected)}
          onNextMonth={() => selected && copyToNextMonth(selected)}
          onClear={() => selected && clearSelected(selected)}
        />
      )}

      {phone && view === "months" ? (
        <SheetMonthView
          rows={computed.rows}
          display={display}
          index={shownIndex}
          current={current}
          words={words}
          locale={locale}
          plain={plain}
          onIndex={setMonthIndex}
          onEdit={setPhoneCell}
        />
      ) : null}

      {/* Сама таблица. Шапка и месяц липкие; прокрутка — внутри. */}
      <SheetGrid
        tableRef={tableRef}
        words={words}
        format={format}
        locale={locale}
        showTable={showTable}
        display={display}
        computed={computed}
        current={current}
        density={density}
        compare={compare}
        facts={facts}
        phone={phone}
        categoryById={categoryById}
        selected={selected}
        setSelected={setSelected}
        editing={editing}
        setEditing={setEditing}
        setColumnDialog={setColumnDialog}
        setMonthMenu={setMonthMenu}
        setPhoneCell={setPhoneCell}
        startEdit={startEdit}
        commit={commit}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onEditKeyDown={onEditKeyDown}
        plain={plain}
      />

      <SheetColumnDialog
        columnDialog={columnDialog}
        setColumnDialog={setColumnDialog}
        categories={categories}
        columns={sheet.columns}
        act={act}
      />

      <SheetImportDialog
        sheetId={sheetId}
        open={importOpen}
        onOpenChange={setImportOpen}
        categories={categories}
        hasSheet
        onImported={async () => {
          await Promise.all([reload(), reloadRefs()]);
        }}
      />

      <PhoneCellDialog
        phoneCell={phoneCell}
        setPhoneCell={setPhoneCell}
        columnAt={columnAt}
        rows={computed.rows}
        words={words}
        format={format}
        locale={locale}
        facts={facts}
        save={save}
        fillDown={fillDown}
      />

      <MonthMenuDialog
        monthMenu={monthMenu}
        setMonthMenu={setMonthMenu}
        rows={computed.rows}
        words={words}
        format={format}
        locale={locale}
        copyFromPrevious={copyFromPrevious}
        clearWholeMonth={clearWholeMonth}
        setSelected={setSelected}
        act={act}
      />

      <TargetDialog
        open={targetOpen}
        words={words}
        onClose={() => setTargetOpen(false)}
        onSave={async (target) => {
          await act({ action: "setTarget", ...target });
          setTargetOpen(false);
        }}
      />
    </div>
  );
}
