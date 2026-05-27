"use client";

import { Download, FileJson, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { apiClient } from "@/lib/api/client";
import type { ImportPageData, TransactionsPageData } from "@/lib/data";
import { createFileSystemAdapter } from "@/lib/files/createFileSystemAdapter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CsvImportMapper } from "@/services/import/CsvImportMapper";
import { ExportService } from "@/services/export/ExportService";

export function ImportExportPanel({
  data,
  transactions
}: {
  data: ImportPageData;
  transactions: TransactionsPageData["transactions"];
}) {
  const [fields, setFields] = useState<string[]>([]);
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const fileSystem = useMemo(() => createFileSystemAdapter(), []);
  const router = useRouter();

  async function pickCsv() {
    const file = await fileSystem.pickTextFile(".csv,text/csv");
    if (!file) return;

    const parsed = new CsvImportMapper().parse(file.content);
    setFields(parsed.fields);
    setRows(parsed.rows.slice(0, 100));
    setErrors(parsed.errors);
  }

  async function exportCsv() {
    const content = new ExportService().transactionsToCsv(transactions);
    await fileSystem.saveTextFile("transactions-export.csv", content, "text/csv;charset=utf-8");
  }

  async function exportJson() {
    const content = new ExportService().transactionsToJson(transactions);
    await fileSystem.saveTextFile("transactions-export.json", content, "application/json;charset=utf-8");
  }

  async function submitImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());

    try {
      await apiClient.post("/import", payload);
      toast.success("CSV импортирован");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось импортировать CSV");
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Экспорт данных</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={exportCsv}>
            <Download className="size-4" />
            CSV
          </Button>
          <Button type="button" variant="outline" onClick={exportJson}>
            <FileJson className="size-4" />
            JSON
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Импорт CSV</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={pickCsv}>
              <Upload className="size-4" />
              Загрузить CSV
            </Button>
            <p className="self-center text-sm text-muted-foreground">Поддерживаются колонки даты, суммы, описания, категории и счета.</p>
          </div>

          {errors.length > 0 ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {errors.slice(0, 3).join("; ")}
            </div>
          ) : null}

          {fields.length > 0 ? (
            <form onSubmit={submitImport} className="space-y-4">
              <input type="hidden" name="rows" value={JSON.stringify(rows)} />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <ColumnSelect label="Дата" name="dateColumn" fields={fields} preferred={["date", "Дата"]} required />
                <ColumnSelect label="Сумма" name="amountColumn" fields={fields} preferred={["amount", "Сумма"]} required />
                <ColumnSelect label="Описание" name="descriptionColumn" fields={fields} preferred={["description", "Описание"]} />
                <ColumnSelect label="Категория" name="categoryColumn" fields={fields} preferred={["category", "Категория"]} />
                <ColumnSelect label="Счет" name="accountColumn" fields={fields} preferred={["account", "Счет"]} />
              </div>
              <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
                При импорте положительные суммы станут доходами, отрицательные — расходами. Если счет или категория не найдены,
                используются первый счет и создаваемая импортная категория.
              </div>
              <Button type="submit">Импортировать операции</Button>
            </form>
          ) : null}
        </CardContent>
      </Card>

      {rows.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Предпросмотр строк</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    {fields.slice(0, 6).map((field) => (
                      <TableHead key={field}>{field}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 8).map((row, index) => (
                    <TableRow key={index}>
                      {fields.slice(0, 6).map((field) => (
                        <TableCell key={field}>{String(row[field] ?? "")}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="grid gap-3 md:hidden">
              {rows.slice(0, 8).map((row, index) => (
                <div key={index} className="rounded-lg border p-4 text-sm">
                  {fields.slice(0, 5).map((field) => (
                    <div key={field} className="flex justify-between gap-3 py-1">
                      <span className="text-muted-foreground">{field}</span>
                      <span className="text-right">{String(row[field] ?? "")}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Справочники для импорта</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <p className="font-medium">Счета</p>
            <p className="mt-1 text-muted-foreground">{data.accounts.map((account) => account.name).join(", ")}</p>
          </div>
          <div>
            <p className="font-medium">Категории</p>
            <p className="mt-1 text-muted-foreground">{data.categories.map((category) => category.label).join(", ")}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ColumnSelect({
  label,
  name,
  fields,
  preferred,
  required
}: {
  label: string;
  name: string;
  fields: string[];
  preferred: string[];
  required?: boolean;
}) {
  const defaultValue = fields.find((field) => preferred.some((item) => item.toLowerCase() === field.toLowerCase())) ?? "";

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <select name={name} defaultValue={defaultValue} required={required} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
        <option value="">Не выбрано</option>
        {fields.map((field) => (
          <option key={field} value={field}>
            {field}
          </option>
        ))}
      </select>
    </div>
  );
}
