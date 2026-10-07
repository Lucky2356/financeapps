import type {
  DeletePath,
  PathWithQuery,
  ReadPath,
  ReadResponses,
  WriteResponse,
  WriteRoute
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
  /** Тип ответа — из пути и поля `action` в теле, см. lib/api/routes.ts. */
  post<P extends WriteRoute, const Body = undefined>(
    path: PathWithQuery<P>,
    body?: Body,
    options?: ApiRequestOptions
  ): Promise<WriteResponse<P, Body>>;
  put<P extends WriteRoute, const Body = undefined>(
    path: PathWithQuery<P>,
    body?: Body,
    options?: ApiRequestOptions
  ): Promise<WriteResponse<P, Body>>;
  delete(path: DeletePath, options?: ApiRequestOptions): Promise<void>;
}
