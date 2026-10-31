// Что модули хранилища получают от LocalApiClient: само хранилище и доступ к
// книге текущего профиля — прочитать, сохранить, забыть закэшированное,
// встать в очередь записей. Кэш, очередь и единственная точка сохранения
// остаются в клиенте (lib/api/LocalApiClient.ts); профили, копии, корзина,
// фото и восстановление — в lib/api/local/*, и зовут их через этот контекст.
//
// Только типы: модуль ничего не тянет за собой и не создаёт кругов импорта.

import type { LocalState } from "@/lib/api/local/state";
import type { StorageAdapter } from "@/lib/storage/StorageAdapter";

export type SaveOptions = { stamp?: boolean; trash?: boolean };

export type StoreContext = {
  readonly storage: StorageAdapter;
  /** Книга текущего профиля (см. LocalApiClient.state). */
  state(mutable?: boolean): Promise<LocalState>;
  /** Единственная дверь, через которую книга попадает на диск (LocalApiClient.save). */
  save(state: LocalState, options?: SaveOptions): Promise<void>;
  /** Книгу поменяли в обход save — забыть закэшированную. */
  invalidateStateCache(): void;
  /** Очередь записей (LocalApiClient.serialize). */
  serialize<T>(operation: () => Promise<T>): Promise<T>;
};
