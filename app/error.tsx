"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function Error({
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
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 text-center">
      <AlertTriangle className="size-12 text-destructive" />
      <div>
        <h2 className="text-2xl font-bold">Что-то пошло не так</h2>
        {error.message ? (
          <p className="mt-2 text-muted-foreground">{error.message}</p>
        ) : (
          <p className="mt-2 text-muted-foreground">Произошла непредвиденная ошибка. Попробуйте ещё раз.</p>
        )}
        {error.digest ? (
          <code className="mt-2 block text-xs text-muted-foreground">{error.digest}</code>
        ) : null}
      </div>
      <Button onClick={reset}>
        <RefreshCw className="size-4" />
        Попробовать снова
      </Button>
    </div>
  );
}
