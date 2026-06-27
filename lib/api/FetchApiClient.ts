import type { ApiClient, ApiRequestOptions } from "@/lib/api/ApiClient";

export class FetchApiClient implements ApiClient {
  constructor(private readonly baseUrl: string) {}

  get<T>(path: string, options?: ApiRequestOptions): Promise<T> {
    return this.request<T>(path, { method: "GET", ...options });
  }

  post<TResponse, TBody = unknown>(
    path: string,
    body?: TBody,
    options?: ApiRequestOptions
  ): Promise<TResponse> {
    return this.request<TResponse>(path, {
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
      ...options
    });
  }

  put<TResponse, TBody = unknown>(
    path: string,
    body?: TBody,
    options?: ApiRequestOptions
  ): Promise<TResponse> {
    return this.request<TResponse>(path, {
      method: "PUT",
      body: body === undefined ? undefined : JSON.stringify(body),
      ...options
    });
  }

  delete<T>(path: string, options?: ApiRequestOptions): Promise<T> {
    return this.request<T>(path, { method: "DELETE", ...options });
  }

  private async request<T>(path: string, init: RequestInit & ApiRequestOptions): Promise<T> {
    const response = await fetch(this.url(path), {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(init.headers ?? {})
      }
    });

    if (!response.ok) {
      const text = await response.text();
      let message: string;
      try {
        const payload = JSON.parse(text) as { error?: string };
        message = payload.error ?? text;
      } catch {
        message = text;
      }
      throw new Error(message || `API request failed: ${response.status}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  private url(path: string) {
    if (path.startsWith("http")) return path;

    const base = this.baseUrl.endsWith("/") ? this.baseUrl.slice(0, -1) : this.baseUrl;
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return `${base}${normalizedPath}`;
  }
}
