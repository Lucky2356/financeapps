"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { SessionProvider } from "next-auth/react";
import { Toaster } from "sonner";

import { AppSettingsSync } from "@/components/app-settings-sync";
import { AutomationRunner } from "@/components/automation-runner";
import { CommandPalette } from "@/components/command-palette";
import { OnboardingTour } from "@/components/onboarding-tour";
import { SessionGate } from "@/components/auth/session-gate";
import { UserMenu } from "@/components/auth/user-menu";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { I18nProvider } from "@/lib/i18n/context";
import { isLocalDesktopMode } from "@/lib/platform/env";

export function Providers({ children }: { children: React.ReactNode }) {
  const inner = (
    <ConfirmProvider>
      <AppSettingsSync />
      <AutomationRunner />
      <CommandPalette />
      <OnboardingTour />
      {children}
      <Toaster richColors closeButton position="top-right" />
    </ConfirmProvider>
  );

  return (
    <I18nProvider>
      <NextThemesProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        {isLocalDesktopMode ? (
          // Desktop (local): no web auth — data lives on-device.
          inner
        ) : (
          // Web: gate the app behind a session and expose sign-out.
          <SessionProvider>
            <SessionGate>{inner}</SessionGate>
            <UserMenu />
          </SessionProvider>
        )}
      </NextThemesProvider>
    </I18nProvider>
  );
}
