import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "ru.finassistant.mvp",
  appName: "Финансовый помощник",
  webDir: "out",
  server: {
    androidScheme: "https"
  }
};

export default config;
