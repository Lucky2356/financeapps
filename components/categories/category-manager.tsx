"use client";

import { Edit2, Plus, Tag, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { apiClient } from "@/lib/api/client";
import type { CategoriesPageData } from "@/lib/data";
import { useApiPageData } from "@/hooks/use-api-page-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { EmptyState } from "@/components/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CategoryRow } from "@/types/finance";

const PRESET_COLORS = [
  "#16a34a",
  "#0d9488",
  "#2563eb",
  "#7c3aed",
  "#db2777",
  "#dc2626",
  "#ea580c",
  "#f97316",
  "#eab308",
  "#0891b2",
  "#64748b",
  "#84cc16"
];

export function CategoryManager({ data }: { data: CategoriesPageData }) {
  const router = useRouter();
  const { data: pageData, reload } = useApiPageData(data, "/categories");

  const incomeCategories = pageData.categories.filter((c) => c.kind === "INCOME");
  const expenseCategories = pageData.categories.filter((c) => c.kind === "EXPENSE");

  async function handleSubmit(event: FormEvent<HTMLFormElement>, method: "POST" | "PUT") {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());

    try {
      if (method === "POST") {
        await apiClient.post("/categories", payload);
        toast.success("Категория добавлена");
      } else {
        await apiClient.put("/categories", payload);
        toast.success("Категория обновлена");
      }
      await reload();
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось сохранить категорию");
    }
  }

  async function handleDelete(id: string) {
    try {
      await apiClient.delete(`/categories?id=${encodeURIComponent(id)}`);
      toast.success("Категория удалена");
      await reload();
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось удалить категорию");
    }
  }

  return (
    <div className="grid gap-5 md:grid-cols-2">
      <CategoryColumn
        title="Доходы"
        kind="INCOME"
        headerClass="text-green-700 dark:text-green-400"
        categories={incomeCategories}
        onSubmit={handleSubmit}
        onDelete={handleDelete}
      />
      <CategoryColumn
        title="Расходы"
        kind="EXPENSE"
        headerClass="text-orange-700 dark:text-orange-400"
        categories={expenseCategories}
        onSubmit={handleSubmit}
        onDelete={handleDelete}
      />
    </div>
  );
}

function CategoryColumn({
  title,
  kind,
  headerClass,
  categories,
  onSubmit,
  onDelete
}: {
  title: string;
  kind: "INCOME" | "EXPENSE";
  headerClass: string;
  categories: CategoryRow[];
  onSubmit: (event: FormEvent<HTMLFormElement>, method: "POST" | "PUT") => void;
  onDelete: (id: string) => void;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className={headerClass}>{title}</CardTitle>
        <Dialog>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="size-4" />
              Добавить
            </Button>
          </DialogTrigger>
          <CategoryDialog
            title={`Новая категория — ${title}`}
            defaultKind={kind}
            onSubmit={(event) => onSubmit(event, "POST")}
          />
        </Dialog>
      </CardHeader>
      <CardContent>
        {categories.length === 0 ? (
          <EmptyState icon={Tag} title="Нет категорий" description="Добавьте первую категорию." />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Категория</TableHead>
                    <TableHead>Метки</TableHead>
                    <TableHead className="text-right">Операции</TableHead>
                    <TableHead className="w-20 text-right">Действия</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories.map((category) => (
                    <CategoryTableRow
                      key={category.id}
                      category={category}
                      onSubmit={onSubmit}
                      onDelete={onDelete}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile cards */}
            <div className="grid gap-3 md:hidden">
              {categories.map((category) => (
                <CategoryCard
                  key={category.id}
                  category={category}
                  onSubmit={onSubmit}
                  onDelete={onDelete}
                />
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function CategoryTableRow({
  category,
  onSubmit,
  onDelete
}: {
  category: CategoryRow;
  onSubmit: (event: FormEvent<HTMLFormElement>, method: "POST" | "PUT") => void;
  onDelete: (id: string) => void;
}) {
  const canDelete = category.transactionCount === 0;

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-2">
          <span
            className="inline-block size-3.5 shrink-0 rounded-full border"
            style={{ backgroundColor: category.color }}
          />
          <span className="font-medium">{category.name}</span>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          {category.isEssential && (
            <Badge variant="secondary" className="text-xs">
              Обязательная
            </Badge>
          )}
          {category.isSubscription && (
            <Badge variant="secondary" className="text-xs">
              Подписка
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell className="text-right">
        <span className="text-sm text-muted-foreground">{category.transactionCount}</span>
      </TableCell>
      <TableCell>
        <div className="flex justify-end gap-1">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" title="Редактировать" aria-label="Редактировать категорию">
                <Edit2 className="size-4" />
              </Button>
            </DialogTrigger>
            <CategoryDialog
              title="Редактировать категорию"
              category={category}
              defaultKind={category.kind}
              onSubmit={(event) => onSubmit(event, "PUT")}
            />
          </Dialog>
          <Button
            variant="ghost"
            size="icon"
            disabled={!canDelete}
            title={canDelete ? "Удалить" : `Нельзя удалить: ${category.transactionCount} операций`}
            aria-label="Удалить категорию"
            onClick={() => canDelete && onDelete(category.id)}
          >
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function CategoryCard({
  category,
  onSubmit,
  onDelete
}: {
  category: CategoryRow;
  onSubmit: (event: FormEvent<HTMLFormElement>, method: "POST" | "PUT") => void;
  onDelete: (id: string) => void;
}) {
  const canDelete = category.transactionCount === 0;

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className="inline-block size-4 shrink-0 rounded-full border"
            style={{ backgroundColor: category.color }}
          />
          <p className="font-semibold">{category.name}</p>
        </div>
        <span className="text-sm text-muted-foreground">{category.transactionCount} опер.</span>
      </div>
      {(category.isEssential || category.isSubscription) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {category.isEssential && <Badge variant="secondary" className="text-xs">Обязательная</Badge>}
          {category.isSubscription && <Badge variant="secondary" className="text-xs">Подписка</Badge>}
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Edit2 className="size-4" />
              Изменить
            </Button>
          </DialogTrigger>
          <CategoryDialog
            title="Редактировать категорию"
            category={category}
            defaultKind={category.kind}
            onSubmit={(event) => onSubmit(event, "PUT")}
          />
        </Dialog>
        <Button
          variant="outline"
          size="sm"
          disabled={!canDelete}
          title={canDelete ? "Удалить" : `Нельзя удалить: ${category.transactionCount} операций`}
          onClick={() => canDelete && onDelete(category.id)}
        >
          <Trash2 className="size-4 text-destructive" />
          Удалить
        </Button>
      </div>
    </div>
  );
}

function CategoryDialog({
  title,
  category,
  defaultKind,
  onSubmit
}: {
  title: string;
  category?: CategoryRow;
  defaultKind: "INCOME" | "EXPENSE";
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [selectedColor, setSelectedColor] = useState(category?.color ?? PRESET_COLORS[0]);
  const [isEssential, setIsEssential] = useState(category?.isEssential ?? false);
  const [isSubscription, setIsSubscription] = useState(category?.isSubscription ?? false);

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      <form onSubmit={onSubmit} className="grid gap-4">
        {category ? <input type="hidden" name="id" value={category.id} /> : null}
        <input type="hidden" name="kind" value={defaultKind} />
        <input type="hidden" name="color" value={selectedColor} />
        <input type="hidden" name="isEssential" value={String(isEssential)} />
        <input type="hidden" name="isSubscription" value={String(isSubscription)} />

        <div className="space-y-2">
          <Label>Название</Label>
          <Input name="name" defaultValue={category?.name ?? ""} minLength={2} maxLength={80} required />
        </div>

        <div className="space-y-2">
          <Label>Цвет</Label>
          <div className="flex flex-wrap gap-2">
            {PRESET_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className="size-7 rounded-full border-2 transition-transform hover:scale-110"
                style={{
                  backgroundColor: color,
                  borderColor: selectedColor === color ? "hsl(var(--foreground))" : "transparent"
                }}
                onClick={() => setSelectedColor(color)}
                aria-label={`Цвет ${color}`}
              />
            ))}
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span
              className="inline-block size-4 rounded-full border"
              style={{ backgroundColor: selectedColor }}
            />
            <span>{selectedColor}</span>
          </div>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 rounded border accent-primary"
            checked={isEssential}
            onChange={(e) => setIsEssential(e.target.checked)}
          />
          <span>Обязательная (критически необходимые расходы)</span>
        </label>

        {defaultKind === "EXPENSE" && (
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 rounded border accent-primary"
              checked={isSubscription}
              onChange={(e) => setIsSubscription(e.target.checked)}
            />
            <span>Подписка (регулярные сервисные платежи)</span>
          </label>
        )}

        <DialogFooter>
          <Button type="submit">Сохранить</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
