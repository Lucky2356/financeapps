"use client";

// Общая рамка экранов замка: карточка посреди пустого окна, заголовок, ошибка.
//
// Живёт отдельно от самих экранов НЕ ради порядка. Пока рамка лежала внутри
// первого запуска, всякий, кому нужна была только она, тянул за собой первый
// запуск целиком — а с ним клиент данных и хранилище устройства. Для экрана
// «кто за компьютером» это значило бы, что выбор человека зависит от модуля,
// который сам ждёт, пока человек будет выбран.

import { cn } from "@/lib/utils";

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-sm">{children}</div>
    </div>
  );
}

export function Head({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <h1 className="flex items-center gap-2 text-lg font-semibold">
      <span className="text-muted-foreground">{icon}</span>
      {title}
    </h1>
  );
}

export function Problem({ text, className }: { text: string | null; className?: string }) {
  if (!text) return null;
  return (
    <p role="alert" className={cn("text-sm font-medium text-destructive", className)}>
      {text}
    </p>
  );
}
