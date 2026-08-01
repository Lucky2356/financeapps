import { LocalApiClient } from "@/lib/api/LocalApiClient";
import type { ApiClient } from "@/lib/api/ApiClient";

// One client, one data source: everything the app knows lives in the device's
// IndexedDB and is served by LocalApiClient. There is no remote API left to
// fall back to.
export function createApiClient(): ApiClient {
  return new LocalApiClient();
}

export const apiClient = createApiClient();
