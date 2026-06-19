"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { Toaster } from "sonner";

import { AppSettingsSync } from "@/components/app-settings-sync";
import { CommandPalette } from "@/components/command-palette";
import { OnboardingTour } from "@/components/onboarding-tour";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <ConfirmProvider>
        <AppSettingsSync />
        <CommandPalette />
        <OnboardingTour />
        {children}
        <Toaster richColors closeButton position="top-right" />
      </ConfirmProvider>
    </NextThemesProvider>
  );
}
