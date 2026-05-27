export type ApiRequestOptions = {
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

export interface ApiClient {
  get<T>(path: string, options?: ApiRequestOptions): Promise<T>;
  post<TResponse, TBody = unknown>(path: string, body?: TBody, options?: ApiRequestOptions): Promise<TResponse>;
  put<TResponse, TBody = unknown>(path: string, body?: TBody, options?: ApiRequestOptions): Promise<TResponse>;
  delete<T>(path: string, options?: ApiRequestOptions): Promise<T>;
}
