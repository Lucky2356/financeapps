import type {
  DeletePath,
  PathWithQuery,
  ReadPath,
  ReadResponses,
  WritePath
} from "@/lib/api/routes";

export type ApiRequestOptions = {
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

export interface ApiClient {
  /** Тип ответа выводится из пути — см. lib/api/routes.ts. */
  get<P extends ReadPath>(
    path: PathWithQuery<P>,
    options?: ApiRequestOptions
  ): Promise<ReadResponses[P]>;
  post<TResponse = unknown, TBody = unknown>(
    path: WritePath,
    body?: TBody,
    options?: ApiRequestOptions
  ): Promise<TResponse>;
  put<TResponse = unknown, TBody = unknown>(
    path: WritePath,
    body?: TBody,
    options?: ApiRequestOptions
  ): Promise<TResponse>;
  delete(path: DeletePath, options?: ApiRequestOptions): Promise<void>;
}
