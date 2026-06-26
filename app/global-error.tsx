"use client";

import { useEffect, useState } from "react";

import { translate, DEFAULT_LOCALE, LOCALES, type Locale } from "@/lib/i18n/catalog";

// The global error boundary replaces the entire document, so it renders OUTSIDE
// the I18nProvider. We read the saved locale straight from localStorage so this
// last-resort screen still follows the user's language choice.
function readLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  const saved = window.localStorage.getItem("app-locale");
  return (LOCALES as readonly string[]).includes(saved ?? "") ? (saved as Locale) : DEFAULT_LOCALE;
}

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    console.error(error);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocale(readLocale());
  }, [error]);

  const t = (key: string) => translate(locale, key);

  return (
    <html lang={locale}>
      <body
        style={{
          margin: 0,
          padding: "40px 16px",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center"
        }}
      >
        <div
          style={{
            display: "inline-flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "16px",
            maxWidth: "480px"
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#ef4444"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
          </svg>
          <h1 style={{ fontSize: "24px", fontWeight: "bold", margin: 0 }}>{t("error.title")}</h1>
          {error.message ? (
            <p style={{ color: "#6b7280", margin: 0 }}>{error.message}</p>
          ) : (
            <p style={{ color: "#6b7280", margin: 0 }}>{t("error.criticalDescription")}</p>
          )}
          {error.digest ? (
            <code style={{ fontSize: "12px", color: "#9ca3af" }}>{error.digest}</code>
          ) : null}
          <button
            onClick={reset}
            style={{
              padding: "8px 20px",
              backgroundColor: "#3b82f6",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "14px"
            }}
          >
            {t("error.retry")}
          </button>
        </div>
      </body>
    </html>
  );
}
