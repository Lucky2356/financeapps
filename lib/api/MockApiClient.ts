import type { ApiClient, ApiRequestOptions } from "@/lib/api/ApiClient";

export class MockApiClient implements ApiClient {
  constructor(private readonly fixtures: Record<string, unknown> = {}) {}

  async get<T>(path: string): Promise<T> {
    return this.resolve<T>(path);
  }

  async post<TResponse, TBody = unknown>(_path: string, _body?: TBody, _options?: ApiRequestOptions): Promise<TResponse> {
    void _path;
    void _body;
    void _options;
    return { ok: true } as TResponse;
  }

  async put<TResponse, TBody = unknown>(_path: string, _body?: TBody, _options?: ApiRequestOptions): Promise<TResponse> {
    void _path;
    void _body;
    void _options;
    return { ok: true } as TResponse;
  }

  async delete<T>(_path: string, _options?: ApiRequestOptions): Promise<T> {
    void _path;
    void _options;
    return { ok: true } as T;
  }

  private async resolve<T>(path: string): Promise<T> {
    if (!(path in this.fixtures)) {
      throw new Error(`MockApiClient fixture not found for ${path}`);
    }

    return this.fixtures[path] as T;
  }
}
