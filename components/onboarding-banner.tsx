"use client";

import { X, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "onboarding_dismissed_v1";

export function OnboardingBanner({ hasTransactions }: { hasTransactions: boolean }) {
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(STORAGE_KEY) === "true";
  });

  if (hasTransactions || dismissed) return null;

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, "true");
    setDismissed(true);
  }

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/8 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">Добро пожаловать в Финансовый помощник</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Начните с нескольких шагов, чтобы получить максимум от приложения.
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={dismiss} aria-label="Закрыть подсказку">
          <X className="size-4" />
        </Button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {[
          { step: "1", title: "Добавьте счёт", href: "/accounts", desc: "Наличные, карта или брокерский счёт" },
          { step: "2", title: "Запишите операцию", href: "/transactions", desc: "Или импортируйте CSV из банка" },
          { step: "3", title: "Задайте бюджеты", href: "/budgets", desc: "Установите лимиты по категориям" },
        ].map(({ step, title, href, desc }) => (
          <Link
            key={step}
            href={href}
            className="group flex items-start gap-3 rounded-lg border bg-card p-3 text-sm transition-colors hover:border-primary/50 hover:bg-primary/5"
          >
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              {step}
            </span>
            <div>
              <p className="font-medium group-hover:text-primary">{title}</p>
              <p className="mt-0.5 text-muted-foreground">{desc}</p>
            </div>
          </Link>
        ))}
      </div>
      <div className="mt-3 flex justify-end">
        <Button variant="ghost" size="sm" onClick={dismiss}>
          Скрыть подсказку
          <ArrowRight className="size-3" />
        </Button>
      </div>
    </div>
  );
}
