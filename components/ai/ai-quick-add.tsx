"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { apiClient } from "@/lib/api/client";
import { isLocalDesktopMode } from "@/lib/platform/env";
import { formatInputDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import type { ImportPageData, SettingsPageData } from "@/lib/data";
import type { AiParseContext, AiTransactionDraft } from "@/lib/ai/parse-transaction";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// AI-assisted transaction entry (plan D3). Renders only when the user has
// opted in (Settings → ИИ-ассистент). Turns a free-text phrase into a draft
// transaction the user reviews and confirms before anything is saved.
export function AiQuickAdd() {
  const router = useRouter();
  const { t } = useI18n();
  const [settings, setSettings] = useState<SettingsPageData | null>(null);
  const [refs, setRefs] = useState<ImportPageData | null>(null);
  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<AiTransactionDraft | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<SettingsPageData>("/settings")
      .then((data) => {
        if (!cancelled) setSettings(data);
      })
      .catch(() => {
        /* settings unavailable — keep hidden */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!settings?.aiEnabled) return null;

  async function loadRefs(): Promise<ImportPageData | null> {
    if (refs) return refs;
    try {
      const data = await apiClient.get<ImportPageData>("/import");
      setRefs(data);
      return data;
    } catch {
      return null;
    }
  }

  function buildContext(data: ImportPageData, currency: string): AiParseContext {
    return {
      today: formatInputDate(new Date()),
      currency: currency || "RUB",
      categories: data.categories.map((c) => ({ id: c.id, label: c.label, kind: c.kind })),
      accounts: data.accounts
        .filter((a) => !(a as { isArchived?: boolean }).isArchived)
        .map((a) => ({ id: a.id, name: a.name }))
    };
  }

  async function recognise() {
    if (!text.trim()) return toast.error(t("ai.err.enterText"));
    const data = await loadRefs();
    if (!data) return toast.error(t("ai.err.loadRefs"));
    const context = buildContext(data, settings?.currency ?? "RUB");

    try {
      setParsing(true);
      let result: AiTransactionDraft;
      if (isLocalDesktopMode) {
        const apiKey = settings?.aiApiKey ?? "";
        if (!apiKey) {
          toast.error(t("ai.err.noKey"));
          return;
        }
        const { requestTransactionDraft } = await import("@/services/ai/AiAssistantService");
        result = await requestTransactionDraft({
          text,
          context,
          apiKey,
          model: settings?.aiModel || undefined,
          provider: (settings?.aiProvider as "anthropic" | "openai" | "deepseek") || undefined,
          effort: settings?.aiEffort || undefined
        });
      } else {
        result = await apiClient.post<AiTransactionDraft>("/ai/parse", { text, context });
      }
      setDraft(result);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("ai.err.recognise"));
    } finally {
      setParsing(false);
    }
  }

  async function save() {
    if (!draft) return;
    if (!draft.accountId) return toast.error(t("ai.selectAccount"));
    if (!draft.categoryId) return toast.error(t("ai.selectCategory"));
    try {
      setSaving(true);
      await apiClient.post("/transactions", {
        amount: String(draft.amount),
        type: draft.type,
        accountId: draft.accountId,
        categoryId: draft.categoryId,
        date: draft.date,
        description: draft.description ?? ""
      });
      toast.success(t("tx.toast.added"));
      setDraft(null);
      setText("");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("tx.toast.saveError"));
    } finally {
      setSaving(false);
    }
  }

  const categoriesForType = (refs?.categories ?? []).filter((c) => c.kind === draft?.type);
  const activeAccounts = (refs?.accounts ?? []).filter(
    (a) => !(a as { isArchived?: boolean }).isArchived
  );

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4 text-primary" />
          {t("ai.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("ai.placeholder")}
            onKeyDown={(e) => {
              if (e.key === "Enter") void recognise();
            }}
          />
          <Button type="button" onClick={() => void recognise()} disabled={parsing}>
            {parsing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            {t("ai.recognise")}
          </Button>
        </div>

        {draft && (
          <div className="grid gap-3 rounded-lg border bg-muted/20 p-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">{t("tx.type")}</Label>
              <Select
                value={draft.type}
                onValueChange={(value) =>
                  setDraft({
                    ...draft,
                    type: value as AiTransactionDraft["type"],
                    categoryId: null
                  })
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EXPENSE">{t("tx.type.expense")}</SelectItem>
                  <SelectItem value="INCOME">{t("tx.type.income")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("common.amount")}</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                value={draft.amount}
                onChange={(e) => setDraft({ ...draft, amount: Number(e.target.value) })}
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("common.category")}</Label>
              <Select
                value={draft.categoryId ?? undefined}
                onValueChange={(value) => setDraft({ ...draft, categoryId: value || null })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder={t("ai.selectCategory")} />
                </SelectTrigger>
                <SelectContent>
                  {categoriesForType.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("common.account")}</Label>
              <Select
                value={draft.accountId ?? undefined}
                onValueChange={(value) => setDraft({ ...draft, accountId: value || null })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder={t("ai.selectAccount")} />
                </SelectTrigger>
                <SelectContent>
                  {activeAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("common.date")}</Label>
              <Input
                type="date"
                value={draft.date}
                onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("tx.col.description")}</Label>
              <Input
                value={draft.description ?? ""}
                onChange={(e) => setDraft({ ...draft, description: e.target.value || null })}
                maxLength={180}
                className="h-9"
              />
            </div>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button type="button" variant="outline" onClick={() => setDraft(null)}>
                {t("tx.dialog.cancel")}
              </Button>
              <Button type="button" onClick={() => void save()} disabled={saving}>
                {saving ? t("tx.dialog.saving") : t("common.save")}
              </Button>
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground">{t("ai.footer")}</p>
      </CardContent>
    </Card>
  );
}
