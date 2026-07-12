import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

import "@/app/globals.css";
import { LayoutShell } from "@/components/layout-shell";
import { Providers } from "@/components/providers";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { APP_NAME } from "@/lib/constants";
import { APPEARANCE_FOUC_SCRIPT } from "@/lib/appearance";

const inter = Inter({ subsets: ["latin", "cyrillic"], display: "swap" });

export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `%s | ${APP_NAME}`
  },
  description:
    "Учёт личных финансов: операции, бюджеты, цели, долги, прогноз и аналитика. Десктоп (офлайн) и веб.",
  keywords: ["личные финансы", "бюджет", "учёт расходов", "финансовый помощник", "накопления"],
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: APP_NAME,
    statusBarStyle: "default"
  },
  openGraph: {
    title: APP_NAME,
    description:
      "Учёт личных финансов: операции, бюджеты, цели, долги, прогноз и аналитика. Десктоп (офлайн) и веб.",
    type: "website",
    locale: "ru_RU",
    siteName: APP_NAME
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#101421" }
  ]
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        {/* Stamp accent/density onto <html> before first paint (no flash). */}
        <script dangerouslySetInnerHTML={{ __html: APPEARANCE_FOUC_SCRIPT }} />
      </head>
      <body className={inter.className}>
        <Providers>
          <LayoutShell>{children}</LayoutShell>
          <ServiceWorkerRegister />
        </Providers>
      </body>
    </html>
  );
}
