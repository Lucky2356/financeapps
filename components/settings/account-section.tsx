"use client";

import { KeyRound, Trash2 } from "lucide-react";
import { signOut } from "next-auth/react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isLocalDesktopMode } from "@/lib/platform/env";

// Account self-service for web users: change password and delete account.
// Web-only (desktop has no auth / on-device data).
export function AccountSection() {
  if (isLocalDesktopMode) return null;
  return <AccountSectionInner />;
}

function AccountSectionInner() {
  const [changing, setChanging] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const currentPassword = String(form.get("currentPassword") ?? "");
    const newPassword = String(form.get("newPassword") ?? "");
    const confirmPassword = String(form.get("confirmPassword") ?? "");
    if (newPassword !== confirmPassword) {
      toast.error("Новый пароль и подтверждение не совпадают");
      return;
    }
    setChanging(true);
    try {
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Не удалось изменить пароль");
      }
      toast.success("Пароль изменён");
      event.currentTarget.reset();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось изменить пароль");
    } finally {
      setChanging(false);
    }
  }

  async function deleteAccount() {
    if (!deletePassword) {
      toast.error("Введите пароль для подтверждения");
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: deletePassword })
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Не удалось удалить аккаунт");
      }
      toast.success("Аккаунт удалён");
      await signOut({ callbackUrl: "/login" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось удалить аккаунт");
      setDeleting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-4" />
          Аккаунт и безопасность
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Change password */}
        <form onSubmit={changePassword} className="space-y-3">
          <p className="text-sm font-medium">Смена пароля</p>
          <div className="space-y-2">
            <Label htmlFor="currentPassword">Текущий пароль</Label>
            <Input
              id="currentPassword"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="newPassword">Новый пароль (мин. 8)</Label>
              <Input
                id="newPassword"
                name="newPassword"
                type="password"
                minLength={8}
                autoComplete="new-password"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Подтвердите пароль</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                minLength={8}
                autoComplete="new-password"
                required
              />
            </div>
          </div>
          <Button type="submit" disabled={changing}>
            {changing ? "Сохранение…" : "Изменить пароль"}
          </Button>
        </form>

        {/* Delete account */}
        <div className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm font-medium text-destructive">Удаление аккаунта</p>
          <p className="text-sm text-muted-foreground">
            Аккаунт и все ваши данные (счета, операции, бюджеты, цели и т.д.) будут удалены
            безвозвратно. Перед удалением рекомендуем скачать резервную копию на странице «Импорт».
          </p>
          <Dialog
            open={deleteOpen}
            onOpenChange={(open) => {
              setDeleteOpen(open);
              if (!open) setDeletePassword("");
            }}
          >
            <DialogTrigger asChild>
              <Button variant="destructive">
                <Trash2 className="size-4" />
                Удалить аккаунт
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Удалить аккаунт навсегда?</DialogTitle>
                <DialogDescription>
                  Это действие необратимо. Введите пароль, чтобы подтвердить удаление аккаунта и всех
                  данных.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="deletePassword">Пароль</Label>
                <Input
                  id="deletePassword"
                  type="password"
                  autoComplete="current-password"
                  value={deletePassword}
                  onChange={(event) => setDeletePassword(event.target.value)}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
                  Отмена
                </Button>
                <Button variant="destructive" onClick={() => void deleteAccount()} disabled={deleting}>
                  {deleting ? "Удаление…" : "Удалить навсегда"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  );
}
