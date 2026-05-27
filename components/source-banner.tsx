import { AlertTriangle } from "lucide-react";

import type { DataSource } from "@/types/finance";

export function SourceBanner({ source }: { source: DataSource }) {
  if (source !== "demo-fallback") return null;

  return (
    <div className="flex items-start gap-3 rounded-lg border border-warning/35 bg-warning/15 p-4 text-sm text-warning-foreground">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div>
        <p className="font-medium">Показаны встроенные демо-данные</p>
        <p className="mt-1 text-muted-foreground">
          Подключите PostgreSQL через `DATABASE_URL`, выполните миграции и seed, чтобы включить полноценное сохранение данных.
        </p>
      </div>
    </div>
  );
}
