"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/context";

export default function Error({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useI18n();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 text-center">
      <AlertTriangle className="size-12 text-destructive" />
      <div>
        <h2 className="text-2xl font-bold">{t("error.title")}</h2>
        {error.message ? (
          <p className="mt-2 text-muted-foreground">{error.message}</p>
        ) : (
          <p className="mt-2 text-muted-foreground">{t("error.description")}</p>
        )}
        {error.digest ? (
          <code className="mt-2 block text-xs text-muted-foreground">{error.digest}</code>
        ) : null}
      </div>
      <Button onClick={reset}>
        <RefreshCw className="size-4" />
        {t("error.retry")}
      </Button>
    </div>
  );
}
