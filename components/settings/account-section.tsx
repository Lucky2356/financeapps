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
import { useI18n } from "@/lib/i18n/context";
import { isLocalDesktopMode } from "@/lib/platform/env";

// Account self-service for web users: change password and delete account.
// Web-only (desktop has no auth / on-device data).
export function AccountSection() {
  if (isLocalDesktopMode) return null;
  return <AccountSectionInner />;
}

function AccountSectionInner() {
  const { t } = useI18n();
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
      toast.error(t("set.account.mismatch"));
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
        throw new Error(data?.error ?? t("set.account.changeFail"));
      }
      toast.success(t("set.account.changed"));
      event.currentTarget.reset();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("set.account.changeFail"));
    } finally {
      setChanging(false);
    }
  }

  async function deleteAccount() {
    if (!deletePassword) {
      toast.error(t("set.account.needPassword"));
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
        throw new Error(data?.error ?? t("set.account.deleteFail"));
      }
      toast.success(t("set.account.deleted"));
      await signOut({ callbackUrl: "/login" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("set.account.deleteFail"));
      setDeleting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-4" />
          {t("set.account.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Change password */}
        <form onSubmit={changePassword} className="space-y-3">
          <p className="text-sm font-medium">{t("set.account.changePassword")}</p>
          <div className="space-y-2">
            <Label htmlFor="currentPassword">{t("set.account.current")}</Label>
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
              <Label htmlFor="newPassword">{t("set.account.new")}</Label>
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
              <Label htmlFor="confirmPassword">{t("set.account.confirm")}</Label>
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
            {changing ? t("set.saving") : t("set.account.changeBtn")}
          </Button>
        </form>

        {/* Delete account */}
        <div className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm font-medium text-destructive">{t("set.account.deleteSection")}</p>
          <p className="text-sm text-muted-foreground">{t("set.account.deleteDesc")}</p>
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
                {t("set.account.deleteBtn")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("set.account.deleteConfirmTitle")}</DialogTitle>
                <DialogDescription>{t("set.account.deleteConfirmDesc")}</DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="deletePassword">{t("set.account.password")}</Label>
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
                  {t("common.cancel")}
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => void deleteAccount()}
                  disabled={deleting}
                >
                  {deleting ? t("set.account.deleting") : t("set.account.deleteForever")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  );
}
