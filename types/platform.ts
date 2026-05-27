export type AppPlatform = "web" | "android" | "desktop";
export type AppEnvironment = "development" | "production";
export type ApiMode = "cloud" | "local" | "mock";
export type DesktopDataMode = "cloud" | "local";

export type RuntimeConfig = {
  platform: AppPlatform;
  environment: AppEnvironment;
  apiMode: ApiMode;
  apiBaseUrl: string;
  desktopDataMode: DesktopDataMode;
  isStaticExport: boolean;
};

export type ExportFormat = "csv" | "json";
