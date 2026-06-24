"use client";

import { Trash2, Wand2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { apiClient } from "@/lib/api/client";
import type { RulesPageData } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Categorization rules live in the local profile state (desktop) or the Rule
// table (web) — both behind the /rules endpoint, so the UI is identical.
export function RulesManager() {
  const [data, setData] = useState<RulesPageData | null>(null);
  const [match, setMatch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const next = await apiClient.get<RulesPageData>("/rules");
      setData(next);
      setCategoryId((current) => current || next.categories[0]?.id || "");
    } catch {
      // /rules is desktop-only; ignore where unavailable.
    }
  }

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<RulesPageData>("/rules")
      .then((next) => {
        if (cancelled) return;
        setData(next);
        setCategoryId((current) => current || next.categories[0]?.id || "");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function addRule() {
    if (!match.trim() || !categoryId) {
      toast.error("Укажите текст и категорию");
      return;
    }
    setSaving(true);
    try {
      await apiClient.post("/rules", { match: match.trim(), categoryId });
      setMatch("");
      toast.success("Правило добавлено");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось добавить правило");
    } finally {
      setSaving(false);
    }
  }

  async function removeRule(id: string) {
    try {
      await apiClient.delete(`/rules?id=${encodeURIComponent(id)}`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось удалить правило");
    }
  }

  if (!data) return null;

  const categoryLabel = (id: string) => data.categories.find((c) => c.id === id)?.label ?? "—";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wand2 className="size-4" />
          Правила авто-категоризации
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Если описание операции содержит текст — назначить категорию автоматически (при импорте и
          вводе). Правила приоритетнее подсказок по истории.
        </p>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div className="space-y-2">
            <Label>Содержит текст</Label>
            <Input
              value={match}
              onChange={(event) => setMatch(event.target.value)}
              placeholder="напр. Пятёрочка"
            />
          </div>
          <div className="space-y-2">
            <Label>Категория</Label>
            <select
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              {data.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </select>
          </div>
          <Button type="button" onClick={() => void addRule()} disabled={saving}>
            Добавить
          </Button>
        </div>

        {data.rules.length > 0 ? (
          <ul className="divide-y rounded-md border">
            {data.rules.map((rule) => (
              <li
                key={rule.id}
                className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
              >
                <span className="min-w-0 truncate">
                  «{rule.match}» →{" "}
                  <span className="font-medium">{categoryLabel(rule.categoryId)}</span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Удалить правило"
                  onClick={() => void removeRule(rule.id)}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Правил пока нет.</p>
        )}
      </CardContent>
    </Card>
  );
}
