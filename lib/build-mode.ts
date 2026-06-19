export function isStaticExportBuild() {
  return process.env.NEXT_OUTPUT === "export";
}

export function isNextBuildCommand() {
  const lifecycle = process.env.npm_lifecycle_event ?? "";
  return (
    process.env.NEXT_BUILD_SKIP_DB === "1" || lifecycle === "build" || lifecycle === "build:web"
  );
}

export function shouldUseBuildFallbackData() {
  return isStaticExportBuild() || isNextBuildCommand();
}
