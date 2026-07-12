"use client";

import { CircleDollarSign, Gauge, LineChart, ShieldCheck, Wallet } from "lucide-react";

import { DownloadDesktopButton } from "@/components/auth/download-desktop-button";
import { APP_NAME } from "@/lib/constants";
import { useI18n } from "@/lib/i18n/context";

const features = [
  { icon: Wallet, key: "auth.feature.accounts" },
  { icon: Gauge, key: "auth.feature.budgets" },
  { icon: LineChart, key: "auth.feature.forecast" },
  { icon: ShieldCheck, key: "auth.feature.privacy" }
];

// Marketing shell for the auth pages (login / register): a value-prop panel
// beside the form on large screens, just the form on small ones. Web-only.
export function AuthScreen({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="mx-auto grid min-h-[80vh] w-full max-w-5xl items-center gap-10 py-8 lg:grid-cols-2">
      <section className="relative hidden flex-col gap-6 overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-card to-card p-8 shadow-soft lg:flex">
        {/* Soft brand glow in the corner. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-[radial-gradient(circle,hsl(var(--primary)/0.18),transparent_70%)]"
        />
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-sidebar-accent text-white shadow-sm">
            <CircleDollarSign className="size-6" />
          </span>
          <div>
            <p className="text-lg font-semibold">{APP_NAME}</p>
            <p className="text-sm text-muted-foreground">{t("auth.tagline")}</p>
          </div>
        </div>
        <h1 className="text-2xl font-bold leading-snug">{t("auth.heading")}</h1>
        <ul className="space-y-3">
          {features.map((feature) => (
            <li key={feature.key} className="flex items-start gap-3 text-sm">
              <feature.icon className="mt-0.5 size-5 shrink-0 text-primary" />
              <span>{t(feature.key)}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">{t("auth.disclaimer")}</p>
      </section>
      <div className="w-full max-w-sm justify-self-center space-y-4 lg:justify-self-end">
        {children}
        <DownloadDesktopButton />
      </div>
    </div>
  );
}
