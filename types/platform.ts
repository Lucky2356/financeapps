export type AppEnvironment = "development" | "production";

export type RuntimeConfig = {
  environment: AppEnvironment;
  isStaticExport: boolean;
};

export type ExportFormat = "csv" | "json";
