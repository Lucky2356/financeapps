"use client";

import { Edit2, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { toast } from "sonner";

import { apiClient } from "@/lib/api/client";
import type { AccountsPageData } from "@/lib/data";
import { accountTypeLabel } from "@/lib/data";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function AccountManager({ data }: { data: AccountsPageData }) {
  const router = useRouter();

  async function submitAccount(event: FormEvent<HTMLFormElement>, method: "POST" | "PUT") {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());

    try {
      if (method === "POST") {
        await apiClient.post("/accounts", payload);
        toast.success("Счет добавлен");
      } else {
        await apiClient.put("/accounts", payload);
        toast.success("Счет обновлен");
      }
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось сохранить счет");
    }
  }

  async function removeAccount(id: string) {
    try {
      await apiClient.delete(`/accounts?id=${encodeURIComponent(id)}`);
      toast.success("Счет архивирован");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось архивировать счет");
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Общий баланс</CardTitle>
            <p className="mt-2 text-3xl font-semibold">{formatCurrency(data.totalBalance, data.currency)}</p>
          </div>
          <Dialog>
            <DialogTrigger asChild>
              <Button>
                <Plus className="size-4" />
                Счет
              </Button>
            </DialogTrigger>
            <AccountDialog title="Новый счет" onSubmit={(event) => submitAccount(event, "POST")} />
          </Dialog>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Счета</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Название</TableHead>
                  <TableHead>Тип</TableHead>
                  <TableHead>Валюта</TableHead>
                  <TableHead className="text-right">Баланс</TableHead>
                  <TableHead className="w-28 text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.accounts.map((account) => (
                  <TableRow key={account.id}>
                    <TableCell className="font-medium">{account.name}</TableCell>
                    <TableCell>{accountTypeLabel(account.type)}</TableCell>
                    <TableCell>{account.currency}</TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(account.balance, account.currency)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="icon" title="Редактировать">
                              <Edit2 className="size-4" />
                            </Button>
                          </DialogTrigger>
                          <AccountDialog title="Редактировать счет" account={account} onSubmit={(event) => submitAccount(event, "PUT")} />
                        </Dialog>
                        <form
                          onSubmit={(event) => {
                            event.preventDefault();
                            void removeAccount(account.id);
                          }}
                        >
                          <Button type="submit" variant="ghost" size="icon" title="Архивировать">
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        </form>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="grid gap-3 md:hidden">
            {data.accounts.map((account) => (
              <div key={account.id} className="rounded-lg border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{account.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{accountTypeLabel(account.type)}</p>
                  </div>
                  <p className="font-semibold">{formatCurrency(account.balance, account.currency)}</p>
                </div>
                <div className="mt-4 flex gap-2">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Edit2 className="size-4" />
                        Изменить
                      </Button>
                    </DialogTrigger>
                    <AccountDialog title="Редактировать счет" account={account} onSubmit={(event) => submitAccount(event, "PUT")} />
                  </Dialog>
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      void removeAccount(account.id);
                    }}
                  >
                    <Button type="submit" variant="outline" size="sm">
                      <Trash2 className="size-4 text-destructive" />
                      Архив
                    </Button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AccountDialog({
  title,
  account,
  onSubmit
}: {
  title: string;
  account?: AccountsPageData["accounts"][number];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      <form onSubmit={onSubmit} className="grid gap-4">
        {account ? <input type="hidden" name="id" value={account.id} /> : null}
        <input type="hidden" name="currency" value="RUB" />
        <div className="space-y-2">
          <Label>Название</Label>
          <Input name="name" defaultValue={account?.name ?? ""} required />
        </div>
        <div className="space-y-2">
          <Label>Тип</Label>
          <select name="type" defaultValue={account?.type ?? "DEBIT_CARD"} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
            <option value="CASH">Наличные</option>
            <option value="DEBIT_CARD">Дебетовая карта</option>
            <option value="SAVINGS">Накопительный счет</option>
            <option value="BROKERAGE">Брокерский счет</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label>Баланс</Label>
          <Input name="balance" type="number" step="0.01" defaultValue={account?.balance ?? 0} required />
        </div>
        <DialogFooter>
          <Button type="submit">Сохранить</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
