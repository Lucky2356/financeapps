import { LocalApiClient } from "@/lib/api/LocalApiClient";
import type { ApiClient, ApiRequestOptions } from "@/lib/api/ApiClient";
import { emitDataChanged } from "@/lib/api/data-events";
import { clearPageData } from "@/lib/api/page-data-cache";
import { syncStorage } from "@/lib/vault/runtime";

// One client, one data source: everything the app knows lives in the device's
// IndexedDB and is served by LocalApiClient. There is no remote API left to
// fall back to.
//
// Every write is announced (see lib/api/data-events) so each mounted screen can
// re-read itself. This wrapper is the single place that knows a write happened,
// which means no caller can forget to announce one; reads pass straight through.
//
// Здесь же забывается память об уже показанных экранах — но не на всякой
// записи, а только на тех, после которых книга перестаёт быть той же самой:
// восстановление из копии, смена профиля, очистка хранилища. Для остальных
// записей память как раз и нужна: экран берёт из неё числа мгновенно и
// обновляет их, когда придёт свежий ответ.
//
// Проверка живёт тут по той же причине, что и оповещение: одно место, о
// котором нельзя забыть, добавляя новый экран или новый вызов.
const RESETS_IDENTITY = ["/backup", "/profiles/switch", "/storage/clear"];

function forgetShownScreensIfIdentityChanged(path: string): void {
  const route = path.split("?")[0];
  if (RESETS_IDENTITY.includes(route)) clearPageData();
}
export class NotifyingApiClient implements ApiClient {
  constructor(private readonly inner: ApiClient) {}

  get<T>(path: string, options?: ApiRequestOptions): Promise<T> {
    return this.inner.get<T>(path, options);
  }

  async post<TResponse, TBody = unknown>(
    path: string,
    body?: TBody,
    options?: ApiRequestOptions
  ): Promise<TResponse> {
    forgetShownScreensIfIdentityChanged(path);
    const result = await this.inner.post<TResponse, TBody>(path, body, options);
    emitDataChanged();
    return result;
  }

  async put<TResponse, TBody = unknown>(
    path: string,
    body?: TBody,
    options?: ApiRequestOptions
  ): Promise<TResponse> {
    forgetShownScreensIfIdentityChanged(path);
    const result = await this.inner.put<TResponse, TBody>(path, body, options);
    emitDataChanged();
    return result;
  }

  async delete<T>(path: string, options?: ApiRequestOptions): Promise<T> {
    forgetShownScreensIfIdentityChanged(path);
    const result = await this.inner.delete<T>(path, options);
    emitDataChanged();
    return result;
  }
}

export function createApiClient(): ApiClient {
  return new NotifyingApiClient(new LocalApiClient());
}

/** То немногое, что нужно отсюда от слоя синхронизации. */
type AnnouncesArrivals = { onApplied(listener: () => void): () => void };

/**
 * Книга, приехавшая с другого устройства, поднимает экраны так же, как своя.
 *
 * Оповещение о записи выше ставится на КАЖДУЮ запись приложения — чтобы ни один
 * экран не пришлось учить, какие правки его касаются. Но книга приезжает не
 * через приложение: слой синхронизации сливает её и кладёт в хранилище сам,
 * ниже этого места, и сюда не заходит вовсе.
 *
 * Поэтому два устройства с открытыми приложениями вели себя так: операция,
 * заведённая на телефоне, доезжала до компьютера, ложилась на диск — и не
 * появлялась на экране до перезапуска. В обе стороны, симметрично. Снаружи это
 * и есть «синхронизации нет», хотя по journalctl видно, что всё доехало.
 *
 * Приезды объединяются: одна операция вызывает обмен по нескольким ячейкам, и
 * два устройства успевают перекинуть книгу друг другу по разу. Поднимать все
 * экраны на каждый шаг этого разговора незачем.
 */
export function refreshWhenBooksArrive(
  sync: AnnouncesArrivals,
  client: { forgetCachedState(): void },
  schedule: (run: () => void) => void = (run) => setTimeout(run, 150)
): () => void {
  let waiting = false;
  return sync.onApplied(() => {
    if (waiting) return;
    waiting = true;
    schedule(() => {
      waiting = false;
      // Забыть кэш ЗДЕСЬ, а не в момент объявления. Слияние случается и посреди
      // записи самого приложения — а оно сразу за записью кладёт в кэш СВОЮ
      // версию книги, без подмешанных чужих строк. Забудь мы кэш раньше, эта
      // строка вернула бы его обратно, и экран честно перечитал бы неверное.
      client.forgetCachedState();
      emitDataChanged();
    });
  });
}

/**
 * Вернулись к приложению — сходить за свежим, не дожидаясь подписки.
 *
 * Подписка на события переподключается сама, но с растущей паузой до минуты: на
 * телефоне соединение рвётся каждый раз, когда приложение уходит в фон, и пауза
 * успевает вырасти. Человек, открывший приложение, ждёт своих чисел сейчас, а не
 * через минуту, — и ровно в эту минуту он и решит, что синхронизация не работает.
 *
 * Тот же повод — возвращение сети. Очередь разберётся и сама по своему счётчику
 * повторов, но ждать его незачем, когда уже известно, что связь есть.
 *
 * Это ускорение, а не путь: сойтись всё обязано и без единого события — на
 * ближайшем чтении или записи.
 */
export function flushWhenAppReturns(sync: { flush(): Promise<void> }): () => void {
  if (typeof window === "undefined") return () => {};

  const wake = () => {
    if (document.visibilityState === "visible") void sync.flush();
  };
  const online = () => void sync.flush();

  document.addEventListener("visibilitychange", wake);
  window.addEventListener("online", online);
  return () => {
    document.removeEventListener("visibilitychange", wake);
    window.removeEventListener("online", online);
  };
}

const local = new LocalApiClient();

export const apiClient: ApiClient = new NotifyingApiClient(local);

refreshWhenBooksArrive(syncStorage, local);
flushWhenAppReturns(syncStorage);
