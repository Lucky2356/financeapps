"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="ru">
      <body style={{ margin: 0, padding: "40px 16px", fontFamily: "system-ui, sans-serif", textAlign: "center" }}>
        <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: "16px", maxWidth: "480px" }}>
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
          <h1 style={{ fontSize: "24px", fontWeight: "bold", margin: 0 }}>Что-то пошло не так</h1>
          {error.message ? (
            <p style={{ color: "#6b7280", margin: 0 }}>{error.message}</p>
          ) : (
            <p style={{ color: "#6b7280", margin: 0 }}>Произошла критическая ошибка приложения.</p>
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
            Попробовать снова
          </button>
        </div>
      </body>
    </html>
  );
}
