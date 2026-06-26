"use client";

import { Download } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/context";

export function ImportLinkButton() {
  const { t } = useI18n();
  return (
    <Button asChild variant="outline">
      <Link href="/import">
        <Download className="size-4" />
        {t("nav.import")}
      </Link>
    </Button>
  );
}
