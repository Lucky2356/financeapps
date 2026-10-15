"use client";

import { useSearchParams } from "next/navigation";
import { createContext, useContext, type ReactNode } from "react";

import type { TransactionsPageData } from "@/lib/data";

import { useTransactionsData } from "@/components/transactions/transaction-manager/use-transactions-data";

type TransactionsPage = ReturnType<typeof useTransactionsData>;

const TransactionsDataContext = createContext<TransactionsPage | null>(null);

/**
 * Одна копия списка операций на весь экран «Учёт».
 *
 * Фильтры стоят теперь наверху экрана, над аналитикой, а список — внизу, и
 * обоим нужны одни и те же данные: фильтрам — счета и категории, списку — сами
 * строки. Читай их каждый сам, за каждым изменением адреса шло бы два запроса
 * вместо одного, и фильтр мог бы на мгновение показать другие счета, чем список.
 */
export function TransactionsDataProvider({
  data,
  children
}: {
  data: TransactionsPageData;
  children: ReactNode;
}) {
  const paramsString = useSearchParams().toString();
  const value = useTransactionsData(data, paramsString);
  return (
    <TransactionsDataContext.Provider value={value}>{children}</TransactionsDataContext.Provider>
  );
}

/** Общая копия, если экран её завёл; `null` — компонент стоит сам по себе. */
export function useSharedTransactionsData(): TransactionsPage | null {
  return useContext(TransactionsDataContext);
}

/** Общая копия списка; вне TransactionsDataProvider — ошибка сборки экрана. */
export function useTransactionsPage(): TransactionsPage {
  const value = useContext(TransactionsDataContext);
  if (!value) throw new Error("useTransactionsPage: нет TransactionsDataProvider выше по дереву");
  return value;
}
