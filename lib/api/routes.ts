// Типы маршрутов: какие пути есть и что каждый отвечает.
//
// Ответ чтения не пишется руками — он выводится из обработчика пути в таблице
// маршрутов. Экран, который спрашивает `apiClient.get("/accounts")`, получает
// ровно тот тип, что возвращает обработчик, а путь, которого нет, не
// компилируется.
//
// У записей так не выйдет: один путь делает разные дела по полю `action` в
// теле, и ответ у каждого дела свой. Поэтому для записей проверяется сам путь,
// а тип ответа по-прежнему называет вызывающий.
//
// Только типы: модуль ничего не тянет за собой в сборку.

import type { LocalApiClient } from "@/lib/api/LocalApiClient";
import type { MARKET_READS, STATE_READS } from "@/lib/api/local/reads";
import type { STATE_DELETES, STATE_WRITES } from "@/lib/api/local/writes";

type ResponsesOf<Table> = {
  [Path in keyof Table]: Table[Path] extends (...args: never[]) => infer Result
    ? Awaited<Result>
    : never;
};

type StoreReads = LocalApiClient["storeReads"];
type StoreWrites = LocalApiClient["storeWrites"];
type StoreDeletes = LocalApiClient["storeDeletes"];

/** Путь чтения → что он отвечает. */
export type ReadResponses = ResponsesOf<typeof STATE_READS> &
  ResponsesOf<typeof MARKET_READS> &
  ResponsesOf<StoreReads>;

export type ReadPath = keyof ReadResponses;

/** Путь как есть или с параметрами после «?». */
export type PathWithQuery<Path extends string> = Path | `${Path}?${string}`;

export type WritePath = PathWithQuery<keyof typeof STATE_WRITES | keyof StoreWrites>;

export type DeletePath = PathWithQuery<keyof typeof STATE_DELETES | keyof StoreDeletes>;
