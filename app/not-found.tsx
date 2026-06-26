"use client";

import { Home, SearchX } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/context";

export default function NotFound() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 text-center">
      <SearchX className="size-16 text-muted-foreground" />
      <div>
        <h1 className="text-8xl font-bold tracking-tight">404</h1>
        <p className="mt-2 text-xl text-muted-foreground">{t("notFound.title")}</p>
      </div>
      <Button asChild>
        <Link href="/">
          <Home className="size-4" />
          {t("notFound.home")}
        </Link>
      </Button>
    </div>
  );
}
