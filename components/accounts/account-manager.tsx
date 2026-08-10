"use client";

import { Edit2, Plus, ReceiptText, Trash2, WalletCards } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useState } from "react";

import { earnsInterest, interestSchedule, totalInterest } from "@/lib/accounts/interest";
import { apiClient } from "@/lib/api/client";
import type { AccountsPageData } from "@/lib/data";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import { formatCurrency } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { useApiPageData } from "@/hooks/use-api-page-data";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";

export function AccountManager({ data }: { data: AccountsPageData }) {
  const router = useRouter();
  const { t } = useI18n();
  const { data: pageData, reload } = useApiPageData(data, "/accounts");
  const { run } = useApiMutation();
  const [addOpen, setAddOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AccountsPageData["accounts"][number] | null>(
    null
  );

  async function refresh() {
    await reload();
    router.refresh();
  }

  async function submitAccount(event: FormEvent<HTMLFormElement>, method: "POST" | "PUT") {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());

    await run(
      () =>
        method === "POST"
          ? apiClient.post("/accounts", payload)
          : apiClient.put("/accounts", payload),
      {
        success: method === "POST" ? t("acc.toast.added") : t("acc.toast.updated"),
        error: t("acc.toast.saveError"),
        onSuccess: async () => {
          if (method === "POST") setAddOpen(false);
          else setEditingAccount(null);
          await refresh();
        }
      }
    );
  }

  async function removeAccount(id: string) {
    await run(() => apiClient.delete(`/accounts?id=${encodeURIComponent(id)}`), {
      success: t("acc.toast.archived"),
      error: t("acc.toast.archiveError"),
      onSuccess: refresh
    });
  }

  return (
    <div className="space-y-5">
      {/* The total lives in the headline card at the top of the screen now, and
          the "add" button moved onto the list's own header — one card, one
          number, no repetition. */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t("acc.title")}</CardTitle>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="size-4" />
                {t("acc.addButton")}
              </Button>
            </DialogTrigger>
            <AccountDialog
              title={t("acc.new")}
              onSubmit={(event) => submitAccount(event, "POST")}
            />
          </Dialog>
        </CardHeader>
        <CardContent>
          {pageData.accounts.length === 0 ? (
            <EmptyState
              icon={WalletCards}
              title={t("acc.empty.title")}
              description={t("acc.empty.desc")}
              action={
                <Button onClick={() => setAddOpen(true)}>
                  <Plus className="size-4" />
                  {t("acc.empty.cta")}
                </Button>
              }
            />
          ) : (
            <>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("common.name")}</TableHead>
                      <TableHead>{t("common.type")}</TableHead>
                      <TableHead>{t("common.currency")}</TableHead>
                      <TableHead className="text-right">{t("common.balance")}</TableHead>
                      <TableHead className="w-28 text-right">{t("common.actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageData.accounts.map((account) => (
                      <TableRow key={account.id}>
                        <TableCell className="font-medium">
                          <Link
                            href={`/transactions?accountId=${encodeURIComponent(account.id)}`}
                            className="hover:text-primary hover:underline"
                            title={t("acc.showTransactions", { name: account.name })}
                          >
                            {account.name}
                          </Link>
                        </TableCell>
                        <TableCell>
                          {t(`accountType.${account.type}`)}
                          <InterestNote account={account} />
                        </TableCell>
                        <TableCell>{account.currency}</TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatCurrency(account.balance, account.currency)}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button
                              asChild
                              variant="ghost"
                              size="icon"
                              title={t("acc.transactionsAria")}
                              aria-label={t("acc.transactionsAria")}
                            >
                              <Link
                                href={`/transactions?accountId=${encodeURIComponent(account.id)}`}
                              >
                                <ReceiptText className="size-4" />
                              </Link>
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              title={t("common.editAria")}
                              aria-label={t("acc.edit")}
                              onClick={() => setEditingAccount(account)}
                            >
                              <Edit2 className="size-4" />
                            </Button>
                            <form
                              onSubmit={(event) => {
                                event.preventDefault();
                                void removeAccount(account.id);
                              }}
                            >
                              <Button
                                type="submit"
                                variant="ghost"
                                size="icon"
                                title={t("acc.archiveAria")}
                                aria-label={t("acc.archiveAria")}
                              >
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
                {pageData.accounts.map((account) => (
                  <div key={account.id} className="rounded-lg border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{account.name}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {t(`accountType.${account.type}`)}
                        </p>
                        <InterestNote account={account} />
                      </div>
                      <p className="font-semibold">
                        {formatCurrency(account.balance, account.currency)}
                      </p>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/transactions?accountId=${encodeURIComponent(account.id)}`}>
                          <ReceiptText className="size-4" />
                          {t("common.transactions")}
                        </Link>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingAccount(account)}
                      >
                        <Edit2 className="size-4" />
                        {t("common.edit")}
                      </Button>
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          void removeAccount(account.id);
                        }}
                      >
                        <Button type="submit" variant="outline" size="sm">
                          <Trash2 className="size-4 text-destructive" />
                          {t("common.archive")}
                        </Button>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Single controlled dialog for editing any account */}
      <Dialog
        open={editingAccount !== null}
        onOpenChange={(open) => {
          if (!open) setEditingAccount(null);
        }}
      >
        {editingAccount && (
          <AccountDialog
            title={t("acc.edit")}
            account={editingAccount}
            onSubmit={(event) => submitAccount(event, "PUT")}
          />
        )}
      </Dialog>
    </div>
  );
}

// The rate an account earns, plus what it adds over a year — the number the
// owner actually wants to see next to a savings balance.
function InterestNote({ account }: { account: AccountsPageData["accounts"][number] }) {
  const { t } = useI18n();
  if (!earnsInterest(account)) return null;
  return (
    <p className="mt-1 text-xs text-success">
      {t("acc.interest.year", {
        rate: account.interestRate ?? 0,
        total: formatCurrency(
          totalInterest(interestSchedule(account, new Date(), 365)),
          account.currency
        )
      })}
    </p>
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
  const { t } = useI18n();
  // The savings terms only make sense where money is parked, so they follow the
  // chosen type instead of cluttering every account form.
  const [type, setType] = useState(account?.type ?? "DEBIT_CARD");
  const earnsInterest = type === "SAVINGS" || type === "BROKERAGE";

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      <form onSubmit={onSubmit} className="grid gap-4">
        {account ? <input type="hidden" name="id" value={account.id} /> : null}
        <div className="space-y-2">
          <Label>{t("common.name")}</Label>
          <Input name="name" defaultValue={account?.name ?? ""} required />
        </div>
        <div className="space-y-2">
          <Label>{t("common.currency")}</Label>
          <Select name="currency" defaultValue={account?.currency ?? "RUB"}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SUPPORTED_CURRENCIES.map((item) => (
                <SelectItem key={item.code} value={item.code}>
                  {item.code} — {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>{t("common.type")}</Label>
          <Select name="type" value={type} onValueChange={setType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="CASH">{t("accountType.CASH")}</SelectItem>
              <SelectItem value="DEBIT_CARD">{t("accountType.DEBIT_CARD")}</SelectItem>
              <SelectItem value="SAVINGS">{t("accountType.SAVINGS")}</SelectItem>
              <SelectItem value="BROKERAGE">{t("accountType.BROKERAGE")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>{t("common.balance")}</Label>
          <Input
            name="balance"
            type="number"
            step="0.01"
            defaultValue={account?.balance ?? 0}
            required
          />
        </div>
        {earnsInterest ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("acc.rate")}</Label>
              <Input
                name="interestRate"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                defaultValue={account?.interestRate ?? ""}
              />
              <p className="text-xs text-muted-foreground">{t("acc.rate.hint")}</p>
            </div>
            <div className="space-y-2">
              <Label>{t("acc.compounding")}</Label>
              <Select
                name="interestCompounding"
                defaultValue={account?.interestCompounding ?? "MONTHLY"}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MONTHLY">{t("acc.compounding.MONTHLY")}</SelectItem>
                  <SelectItem value="QUARTERLY">{t("acc.compounding.QUARTERLY")}</SelectItem>
                  <SelectItem value="YEARLY">{t("acc.compounding.YEARLY")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : null}
        <DialogFooter>
          <Button type="submit">{t("common.save")}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
