import { LocalApiClient } from "@/lib/api/LocalApiClient";
import type { ApiClient, ApiRequestOptions } from "@/lib/api/ApiClient";
import { emitDataChanged } from "@/lib/api/data-events";

// One client, one data source: everything the app knows lives in the device's
// IndexedDB and is served by LocalApiClient. There is no remote API left to
// fall back to.
//
// Every write is announced (see lib/api/data-events) so each mounted screen can
// re-read itself. This wrapper is the single place that knows a write happened,
// which means no caller can forget to announce one; reads pass straight through.
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
    const result = await this.inner.post<TResponse, TBody>(path, body, options);
    emitDataChanged();
    return result;
  }

  async put<TResponse, TBody = unknown>(
    path: string,
    body?: TBody,
    options?: ApiRequestOptions
  ): Promise<TResponse> {
    const result = await this.inner.put<TResponse, TBody>(path, body, options);
    emitDataChanged();
    return result;
  }

  async delete<T>(path: string, options?: ApiRequestOptions): Promise<T> {
    const result = await this.inner.delete<T>(path, options);
    emitDataChanged();
    return result;
  }
}

export function createApiClient(): ApiClient {
  return new NotifyingApiClient(new LocalApiClient());
}

export const apiClient = createApiClient();
