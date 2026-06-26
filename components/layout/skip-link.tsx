"use client";

import { useI18n } from "@/lib/i18n/context";

// Keyboard-accessibility skip link. Client component so its label follows the
// user's locale (the surrounding LayoutShell is a server component).
export function SkipLink() {
  const { t } = useI18n();
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg"
    >
      {t("layout.skipLink")}
    </a>
  );
}
