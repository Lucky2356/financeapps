"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { apiClient } from "@/lib/api/client";
import { isLocalDesktopMode } from "@/lib/platform/env";
import { formatInputDate } from "@/lib/format";
import type { ImportPageData, SettingsPageData } from "@/lib/data";
import type { AiParseContext, AiTransactionDraft } from "@/lib/ai/parse-transaction";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// AI-assisted transaction entry (plan D3). Renders only when the user has
// opted in (Settings → ИИ-ассистент). Turns a free-text phrase into a draft
// transaction the user reviews and confirms before anything is saved.
export function AiQuickAdd() {
  const router = useRouter();
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
    if (!text.trim()) return toast.error("Введите описание операции");
    const data = await loadRefs();
    if (!data) return toast.error("Не удалось загрузить категории и счета");
    const context = buildContext(data, settings?.currency ?? "RUB");

    try {
      setParsing(true);
      let result: AiTransactionDraft;
      if (isLocalDesktopMode) {
        const apiKey = settings?.aiApiKey ?? "";
        if (!apiKey) {
          toast.error("Укажите API-ключ Anthropic в настройках");
          return;
        }
        const { requestTransactionDraft } = await import("@/services/ai/AiAssistantService");
        result = await requestTransactionDraft({
          text,
          context,
          apiKey,
          model: settings?.aiModel || undefined
        });
      } else {
        result = await apiClient.post<AiTransactionDraft>("/ai/parse", { text, context });
      }
      setDraft(result);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось распознать операцию");
    } finally {
      setParsing(false);
    }
  }

  async function save() {
    if (!draft) return;
    if (!draft.accountId) return toast.error("Выберите счёт");
    if (!draft.categoryId) return toast.error("Выберите категорию");
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
      toast.success("Операция добавлена");
      setDraft(null);
      setText("");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось сохранить операцию");
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
          Добавить операцию текстом
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Например: потратил 1200 на кофе картой"
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
            Распознать
          </Button>
        </div>

        {draft && (
          <div className="grid gap-3 rounded-lg border bg-muted/20 p-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Тип</Label>
              <select
                value={draft.type}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    type: e.target.value as AiTransactionDraft["type"],
                    categoryId: null
                  })
                }
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                <option value="EXPENSE">Расход</option>
                <option value="INCOME">Доход</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Сумма</Label>
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
              <Label className="text-xs">Категория</Label>
              <select
                value={draft.categoryId ?? ""}
                onChange={(e) => setDraft({ ...draft, categoryId: e.target.value || null })}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                <option value="">Выберите категорию</option>
                {categoriesForType.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Счёт</Label>
              <select
                value={draft.accountId ?? ""}
                onChange={(e) => setDraft({ ...draft, accountId: e.target.value || null })}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                <option value="">Выберите счёт</option>
                {activeAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Дата</Label>
              <Input
                type="date"
                value={draft.date}
                onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Описание</Label>
              <Input
                value={draft.description ?? ""}
                onChange={(e) => setDraft({ ...draft, description: e.target.value || null })}
                maxLength={180}
                className="h-9"
              />
            </div>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button type="button" variant="outline" onClick={() => setDraft(null)}>
                Отмена
              </Button>
              <Button type="button" onClick={() => void save()} disabled={saving}>
                {saving ? "Сохранение…" : "Сохранить"}
              </Button>
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Описание отправляется во внешний сервис Anthropic для распознавания. Перед сохранением
          проверьте поля.
        </p>
      </CardContent>
    </Card>
  );
}
