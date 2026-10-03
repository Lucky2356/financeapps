"use client";

// «Семья»: кто сколько потратил за месяц и кто кому должен.
//
// Наверху — участники и «это устройство — чьё»: новые траты с него сразу
// помечаются этим человеком. Ниже — месяц: у каждого личные траты и его доля
// общих. Внизу — долги по общим тратам за всё время и «Рассчитались»: отдали
// деньги из рук в руки — долг гаснет, в учёте при этом ничего не двигается.

import {
  ChevronLeft,
  ChevronRight,
  HandCoins,
  Pencil,
  Plus,
  Smartphone,
  Trash2
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EMPTY_FAMILY, FAMILY_ME_KEY, type FamilyPage } from "@/components/family/family-fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApiPageData } from "@/hooks/use-api-page-data";
import { apiClient } from "@/lib/api/client";
import type { Member } from "@/lib/family/family";
import { formatCurrency } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { readMine, writeMine } from "@/lib/storage/mine";

function shiftMonth(month: string, delta: number): string {
  const [year, value] = month.split("-").map(Number);
  const date = new Date(year, value - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function thisMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function Dot({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="size-2.5 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
    />
  );
}

export function FamilyScreen() {
  const { t, locale } = useI18n();
  const confirm = useConfirm();
  const [month, setMonth] = useState(thisMonth);
  const { data, reload } = useApiPageData<FamilyPage>(EMPTY_FAMILY, `/family?month=${month}`);
  const [me, setMe] = useState<string>(() => readMine(FAMILY_ME_KEY) ?? "");
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string; since: string } | null>(
    null
  );

  const members = data.members;
  const picture = data.picture;
  const byId = new Map(members.map((member) => [member.id, member]));
  const money = (value: number) => formatCurrency(value);
  const monthLabel = new Date(`${month}-01T12:00:00`).toLocaleDateString(
    locale === "en" ? "en-GB" : "ru-RU",
    { month: "long", year: "numeric" }
  );

  async function act(body: Record<string, unknown>) {
    try {
      const result = await apiClient.post<Member>("/family", body);
      await reload();
      return result;
    } catch (cause) {
      toast.error((cause as Error).message);
      return null;
    }
  }

  async function add() {
    const member = await act({ action: "addMember", name: newName });
    if (!member) return;
    setNewName("");
    // Первый участник на этом устройстве — скорее всего, сам человек. «Своего»
    // могли и удалить (на другом устройстве) — тогда тоже выбрать заново.
    if (!members.some((item) => item.id === me)) chooseMe(member.id);
  }

  function chooseMe(id: string) {
    setMe(id);
    writeMine(FAMILY_ME_KEY, id);
  }

  async function remove(member: Member) {
    const ok = await confirm({
      title: t("family.removeConfirm", { name: member.name }),
      description: t("family.removeHint"),
      confirmLabel: t("family.remove"),
      destructive: true
    });
    if (!ok) return;
    if (me === member.id) chooseMe("");
    await act({ action: "removeMember", id: member.id });
  }

  async function settle(debt: { from: string; to: string; amount: number }) {
    const from = byId.get(debt.from)?.name ?? "";
    const to = byId.get(debt.to)?.name ?? "";
    const ok = await confirm({
      title: t("family.settleConfirm", { from, to, amount: money(debt.amount) }),
      description: t("family.settleHint"),
      confirmLabel: t("family.settle")
    });
    if (!ok) return;
    if (await act({ action: "settle", ...debt })) toast.success(t("family.settled"));
  }

  const addForm = (
    <form
      className="flex flex-wrap gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void add();
      }}
    >
      <Input
        aria-label={t("family.name")}
        placeholder={t("family.namePlaceholder")}
        maxLength={40}
        className="w-48 flex-1 sm:flex-none"
        value={newName}
        onChange={(event) => setNewName(event.target.value)}
        data-testid="family-name"
      />
      <Button type="submit" disabled={!newName.trim()} data-testid="family-add">
        <Plus className="size-4" />
        {t("family.add")}
      </Button>
    </form>
  );

  if (members.length === 0) {
    return (
      <Card data-testid="family-empty">
        <CardHeader>
          <CardTitle>{t("family.emptyTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="max-w-prose list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>{t("family.empty1")}</li>
            <li>{t("family.empty2")}</li>
            <li>{t("family.empty3")}</li>
          </ul>
          {addForm}
        </CardContent>
      </Card>
    );
  }

  const meKnown = members.some((member) => member.id === me);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("family.members")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="divide-y rounded-lg border" data-testid="family-members">
            {members.map((member) => (
              <li key={member.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <Dot color={member.color} />
                <span className="min-w-0 flex-1 truncate font-medium">
                  {member.name}
                  {member.since ? (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {t("family.sinceShort", {
                        date: new Date(`${member.since}T12:00:00`).toLocaleDateString(
                          locale === "en" ? "en-GB" : "ru-RU"
                        )
                      })}
                    </span>
                  ) : null}
                </span>
                {member.id === me ? (
                  <span className="flex items-center gap-1 rounded-full bg-foreground/[0.08] px-2 py-0.5 text-xs">
                    <Smartphone className="size-3" />
                    {t("family.thisDevice")}
                  </span>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground"
                    onClick={() => chooseMe(member.id)}
                  >
                    {t("family.itsMe")}
                  </Button>
                )}
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={t("family.rename", { name: member.name })}
                  onClick={() =>
                    setRenaming({ id: member.id, name: member.name, since: member.since ?? "" })
                  }
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={t("family.removeOne", { name: member.name })}
                  onClick={() => void remove(member)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
          {!meKnown ? <p className="text-sm text-muted-foreground">{t("family.pickMe")}</p> : null}
          {addForm}
        </CardContent>
      </Card>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("family.prevMonth")}
          onClick={() => setMonth((value) => shiftMonth(value, -1))}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <span className="min-w-40 text-center font-semibold capitalize" data-testid="family-month">
          {monthLabel}
        </span>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("family.nextMonth")}
          disabled={month >= thisMonth()}
          onClick={() => setMonth((value) => shiftMonth(value, 1))}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {picture ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="family-spend">
          {picture.perMember.map((row) => (
            <Card key={row.id} data-testid="family-person">
              <CardContent className="space-y-3 pt-5">
                <div className="flex items-center gap-2">
                  <Dot color={row.color} />
                  <span className="font-medium">{row.name}</span>
                  <span className="ml-auto text-lg font-semibold tabular-nums">
                    {money(row.total)}
                  </span>
                </div>
                <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm tabular-nums">
                  <dt className="text-muted-foreground">{t("family.personal")}</dt>
                  <dd className="text-right">{money(row.personal)}</dd>
                  <dt className="text-muted-foreground">{t("family.share")}</dt>
                  <dd className="text-right">{money(row.sharedShare)}</dd>
                  <dt className="text-muted-foreground">{t("family.paidShared")}</dt>
                  <dd className="text-right">{money(row.sharedPaid)}</dd>
                </dl>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {picture ? (
        <p className="text-sm text-muted-foreground" data-testid="family-totals">
          {t("family.sharedTotal", { amount: money(picture.sharedTotal) })}
          {picture.unassigned > 0
            ? ` · ${t("family.unassigned", { amount: money(picture.unassigned) })}`
            : ""}
        </p>
      ) : null}

      {picture && members.length > 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("family.debts")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {picture.debts.length === 0 ? (
              <p className="text-sm text-muted-foreground" data-testid="family-even">
                {t("family.even")}
              </p>
            ) : (
              <ul className="divide-y rounded-lg border" data-testid="family-debts">
                {picture.debts.map((debt) => {
                  const from = byId.get(debt.from);
                  const to = byId.get(debt.to);
                  return (
                    <li
                      key={`${debt.from}-${debt.to}`}
                      className="flex flex-wrap items-center gap-2 px-3 py-2"
                      data-testid="family-debt"
                    >
                      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5">
                        <span className="flex items-center gap-1.5 font-medium">
                          {from ? <Dot color={from.color} /> : null}
                          {from?.name}
                        </span>
                        <span className="text-muted-foreground">{t("family.owes")}</span>
                        <span className="flex items-center gap-1.5 font-medium">
                          {to ? <Dot color={to.color} /> : null}
                          {to?.name}
                        </span>
                      </span>
                      <span className="font-semibold tabular-nums">{money(debt.amount)}</span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void settle(debt)}
                        data-testid="family-settle"
                      >
                        <HandCoins className="size-4" />
                        {t("family.settle")}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">{t("family.debtsHint")}</p>
          </CardContent>
        </Card>
      ) : null}

      <Dialog open={renaming !== null} onOpenChange={(open) => (open ? null : setRenaming(null))}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("family.renameTitle")}</DialogTitle>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!renaming) return;
              void act({
                action: "renameMember",
                id: renaming.id,
                name: renaming.name,
                since: renaming.since
              }).then((done) => (done ? setRenaming(null) : null));
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="family-rename">{t("family.name")}</Label>
              <Input
                id="family-rename"
                autoFocus
                maxLength={40}
                value={renaming?.name ?? ""}
                onChange={(event) =>
                  setRenaming((was) => (was ? { ...was, name: event.target.value } : was))
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="family-since">{t("family.since")}</Label>
              <Input
                id="family-since"
                type="date"
                value={renaming?.since ?? ""}
                onChange={(event) =>
                  setRenaming((was) => (was ? { ...was, since: event.target.value } : was))
                }
                data-testid="family-since"
              />
              <p className="text-xs text-muted-foreground">{t("family.sinceHint")}</p>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={!renaming?.name.trim()}>
                {t("common.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
