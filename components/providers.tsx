"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { Toaster } from "sonner";

import { AppSettingsSync } from "@/components/app-settings-sync";
import { AutomationRunner } from "@/components/automation-runner";
import { CommandPalette } from "@/components/command-palette";
import { OnboardingTour } from "@/components/onboarding-tour";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { I18nProvider } from "@/lib/i18n/context";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <NextThemesProvider
        attribute="class"
        // Nocturne is a dark system; the light theme is its derivative, so a
        // fresh install opens dark unless the owner says otherwise.
        defaultTheme="dark"
        enableSystem
        disableTransitionOnChange
      >
        {/* No accounts and no sign-in: the data lives on the device (Windows or
            Android), so there is nothing to gate the app behind. */}
        <ConfirmProvider>
          <AppSettingsSync />
          <AutomationRunner />
          <CommandPalette />
          <OnboardingTour />
          {children}
          <Toaster richColors closeButton position="top-right" />
        </ConfirmProvider>
      </NextThemesProvider>
    </I18nProvider>
  );
}
