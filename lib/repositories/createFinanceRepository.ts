"use client";

import { apiClient } from "@/lib/api/client";
import { runtimeConfig } from "@/lib/platform/env";
import { ApiFinanceRepository } from "@/lib/repositories/ApiFinanceRepository";
import { LocalFinanceRepository } from "@/lib/repositories/LocalFinanceRepository";
import { createStorageAdapter } from "@/lib/storage/createStorageAdapter";

export function createFinanceRepository() {
  if (runtimeConfig.platform === "desktop" && runtimeConfig.desktopDataMode === "local") {
    return new LocalFinanceRepository(createStorageAdapter());
  }

  return new ApiFinanceRepository(apiClient);
}
