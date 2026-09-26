"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { Toaster } from "sonner";

import { AppSettingsSync } from "@/components/app-settings-sync";
import { AutomationRunner } from "@/components/automation-runner";
import { CommandPalette } from "@/components/command-palette";
import { OnboardingTour } from "@/components/onboarding-tour";
import { PreferencesRoot } from "@/components/preferences-root";
import { StartScreen } from "@/components/start-screen";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { I18nProvider } from "@/lib/i18n/context";
import { VaultGate } from "@/components/vault/vault-gate";
import { WindowTheme } from "@/components/window-theme";

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
        <WindowTheme />
        <ConfirmProvider>
          {/* Всё, что читает книгу, — за воротами замка, и ничего мимо них.
              Держи мы тут хоть что-то снаружи, оно принялось бы за работу над
              запертой книгой: обучение вылезло бы поверх формы ввода пароля,
              фоновые задачи полезли бы читать и получили бы «заперто».
              Оповещения остаются снаружи нарочно — чтобы замку было чем
              пожаловаться. */}
          <VaultGate>
            <AppSettingsSync />
            <AutomationRunner />
            <CommandPalette />
            <OnboardingTour />
            <StartScreen />
            <PreferencesRoot>{children}</PreferencesRoot>
          </VaultGate>
          <Toaster richColors closeButton position="top-right" />
        </ConfirmProvider>
      </NextThemesProvider>
    </I18nProvider>
  );
}
