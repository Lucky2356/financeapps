import { LocalApiClient } from "@/lib/api/LocalApiClient";
import type { ApiClient, ApiRequestOptions } from "@/lib/api/ApiClient";
import { emitDataChanged } from "@/lib/api/data-events";
import { clearPageData } from "@/lib/api/page-data-cache";

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

export const apiClient = createApiClient();
