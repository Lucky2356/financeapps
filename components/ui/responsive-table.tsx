import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

// Одни и те же данные двумя лицами: таблица на широком экране, карточки на
// телефоне.
//
// Так уже сделано в операциях, счетах, лимитах, категориях и плановых платежах
// — но каждый раз своей разметкой, написанной заново. Семь остальных таблиц
// карточек не получили вовсе, и на телефоне их просто плющило: четыре колонки
// денег в 296 px дают по 74 px на колонку, и каждая сумма переносится в три
// строки. Две таблицы отчётов даже не лежали в контейнере с прокруткой.
//
// Здесь колонка описывается один раз и знает оба своих вида: заголовок в
// таблице становится подписью поля в карточке. Дублировать разметку больше не
// нужно, и разъехаться двум видам негде.
//
// Имя не DataView: так называется встроенный объект JavaScript для работы с
// двоичными буферами, и своё такое же затеняет его в пределах модуля.
export type ResponsiveColumn<T> = {
  /**
   * Заголовок колонки в таблице; он же — подпись поля в карточке. Строка, а не
   * произвольная разметка: она же служит ключом строки списка, а ключ по номеру
   * в массиве React запрещает не из вредности — при изменении набора колонок он
   * сопоставляет старое состояние с чужой колонкой.
   */
  header: string;
  cell: (row: T) => ReactNode;
  align?: "left" | "right";
  /**
   * Главное поле строки. В карточке идёт заголовком во всю ширину, без
   * подписи: «Продукты», а не «Категория: Продукты».
   */
  primary?: boolean;
  /**
   * Не показывать в карточке. Для колонок, которые на телефоне только шумят, —
   * скажем, повтор того, что уже сказано соседним полем.
   */
  tableOnly?: boolean;
  /** Ширина колонки в таблице (класс Tailwind). На карточку не влияет. */
  className?: string;
};

export function ResponsiveTable<T>({
  columns,
  rows,
  rowKey,
  empty,
  footer,
  cardAction
}: {
  columns: Array<ResponsiveColumn<T>>;
  rows: T[];
  rowKey: (row: T) => string;
  /** Что показать вместо всего, когда строк нет. */
  empty?: ReactNode;
  /** Итоговая строка под обоими видами — одна на оба, а не по одной на каждый. */
  footer?: ReactNode;
  /** Действие строки — кнопка удаления и подобное. Одно и то же в обоих видах. */
  cardAction?: (row: T) => ReactNode;
}) {
  if (rows.length === 0 && empty !== undefined) {
    return <>{empty}</>;
  }

  const cardColumns = columns.filter((column) => !column.tableOnly);
  const primary = cardColumns.find((column) => column.primary);
  const rest = cardColumns.filter((column) => column !== primary);

  return (
    <>
      {/* Таблица шире карточки, поэтому прокрутка своя: страница вбок не ездит
          (см. app/globals.css), а таблица — может. */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              {columns.map((column) => (
                <th
                  key={column.header}
                  className={cn("py-2", column.align === "right" && "text-right", column.className)}
                >
                  {column.header}
                </th>
              ))}
              {cardAction ? <th className="w-12 py-2" /> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)} className="border-b last:border-0">
                {columns.map((column) => (
                  <td
                    key={column.header}
                    className={cn("py-2", column.align === "right" && "text-right")}
                  >
                    {column.cell(row)}
                  </td>
                ))}
                {cardAction ? <td className="py-2 text-right">{cardAction(row)}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-2 md:hidden">
        {rows.map((row) => (
          <div key={rowKey(row)} className="rounded-lg border p-3">
            {primary || cardAction ? (
              <div className="flex items-start justify-between gap-2">
                {primary ? (
                  <div className="min-w-0 text-sm font-semibold">{primary.cell(row)}</div>
                ) : (
                  <span />
                )}
                {cardAction ? <span className="shrink-0">{cardAction(row)}</span> : null}
              </div>
            ) : null}
            <dl className={cn("grid gap-x-3 gap-y-1 text-sm", (primary || cardAction) && "mt-2")}>
              {rest.map((column) => (
                <div key={column.header} className="flex items-baseline justify-between gap-3">
                  <dt className="shrink-0 text-xs text-muted-foreground">{column.header}</dt>
                  <dd className="min-w-0 text-right">{column.cell(row)}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>

      {/* Подвал — один на оба вида: он одинаковый, а второй такой же в разметке
          означал бы два элемента с одним data-testid и вечную неоднозначность
          в проверках. */}
      {footer ? <div className="mt-3 border-t pt-3">{footer}</div> : null}
    </>
  );
}
