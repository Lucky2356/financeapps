// Типы маршрутов: какие пути есть и что каждый отвечает.
//
// Ответ не пишется руками — он выводится из обработчика пути в таблице
// маршрутов. Экран, который спрашивает `apiClient.get("/accounts")`, получает
// ровно тот тип, что возвращает обработчик, а путь, которого нет, не
// компилируется.
//
// Записи устроены так же, с одной поправкой: путь может делать разные дела по
// полю `action` в теле (lib/api/local/writes.ts, byAction). Тогда ответ берётся
// у того дела, что названо в теле; если `action` известно только как строка —
// это любой из ответов пути.
//
// Только типы: модуль ничего не тянет за собой в сборку.

import type { LocalApiClient } from "@/lib/api/LocalApiClient";
import type { MARKET_READS, STATE_READS } from "@/lib/api/local/reads";
import type { STATE_DELETES, STATE_WRITES } from "@/lib/api/local/writes";

type Handler = (...args: never[]) => unknown;

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

type WriteHandlers = typeof STATE_WRITES & StoreWrites;

/** Путь записи без параметров. */
export type WriteRoute = keyof WriteHandlers & string;

export type WritePath = PathWithQuery<WriteRoute>;

export type DeletePath = PathWithQuery<keyof typeof STATE_DELETES | keyof StoreDeletes>;

type Answer<H> = H extends Handler ? Awaited<ReturnType<H>> : never;

/** Что отвечает дело `Action` пути с таблицей дел. */
type ActionAnswer<Actions, Fallback, Action> = Action extends keyof Actions
  ? Answer<Actions[Action]>
  : string extends Action
    ? Answer<Actions[keyof Actions]> | Answer<Fallback>
    : Answer<Fallback>;

/**
 * Тело, в котором `action` может быть, но какое — не известно: `unknown` или
 * словарь `Record<string, …>`. Ответ тогда — любой из ответов пути.
 */
type MayCarryAction<Body> = unknown extends Body
  ? true
  : Body extends object
    ? string extends keyof Body
      ? true
      : false
    : false;

type AnswerFor<H, Body> = H extends { actions: infer Actions; fallback: infer Fallback }
  ? Body extends { action: infer Action }
    ? ActionAnswer<Actions, Fallback, Action>
    : MayCarryAction<Body> extends true
      ? Answer<Actions[keyof Actions]> | Answer<Fallback>
      : Answer<Fallback>
  : Answer<H>;

/** Путь записи и тело запроса → что запись отвечает. */
export type WriteResponse<Route extends WriteRoute, Body> = AnswerFor<WriteHandlers[Route], Body>;
