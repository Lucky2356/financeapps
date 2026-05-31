"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { Toaster } from "sonner";

import { AppSettingsSync } from "@/components/app-settings-sync";
import { CommandPalette } from "@/components/command-palette";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <AppSettingsSync />
      <CommandPalette />
      {children}
      <Toaster richColors closeButton position="top-right" />
    </NextThemesProvider>
  );
}
