import { FetchApiClient } from "@/lib/api/FetchApiClient";
import { LocalApiClient } from "@/lib/api/LocalApiClient";
import { MockApiClient } from "@/lib/api/MockApiClient";
import type { ApiClient } from "@/lib/api/ApiClient";
import { runtimeConfig } from "@/lib/platform/env";

export function createApiClient(): ApiClient {
  if (runtimeConfig.platform === "desktop" && runtimeConfig.desktopDataMode === "local") {
    return new LocalApiClient();
  }

  if (runtimeConfig.apiMode === "mock") {
    return new MockApiClient();
  }

  return new FetchApiClient(runtimeConfig.apiBaseUrl);
}

export const apiClient = createApiClient();
