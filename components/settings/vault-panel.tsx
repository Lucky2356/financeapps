"use client";

// Замок в настройках: чем открывается эта книга и что с этим можно сделать.

import { Lock, LockOpen } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { announceVaultChanged } from "@/components/vault/vault-gate";
import { useI18n } from "@/lib/i18n/context";
import { accountService } from "@/lib/vault/runtime";

export function VaultPanel() {
  const { t } = useI18n();
  const [remembered, setRemembered] = useState<boolean | null>(null);
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void Promise.resolve().then(async () => {
      setRemembered(await accountService.remembered());
      setHasPassword(await accountService.hasPassword());
    });
  }, []);

  /**
   * Задать пароль записи, заведённой без него.
   *
   * Отдельно от смены пароля, и не для красоты: менять нечего — случайного
   * пароля не знает никто, включая приложение. Ставится он кодом
   * восстановления, который лежит в памяти устройства ровно для этого.
   */
  async function setFirstPassword(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await accountService.setPassword(next);
      setNext("");
      setHasPassword(true);
      setRemembered(false);
      toast.success(t("vault.settings.passwordSet"));
    } catch (cause) {
      toast.error((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await accountService.changePassword(current, next);
      setCurrent("");
      setNext("");
      toast.success(t("vault.settings.changed"));
    } catch (cause) {
      toast.error((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lock className="size-4" />
          {t("vault.settings.title")}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{t("vault.settings.desc")}</p>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="space-y-2">
          {remembered === null ? null : (
            <p className="text-sm">
              {t(remembered ? "vault.settings.remembered" : "vault.settings.asks")}
            </p>
          )}
          {remembered && hasPassword ? (
            <Button
              type="button"
              variant="secondary"
              // Надпись длинная, а кнопки не переносят строк: в окне 360 px
              // она вылезала за правый край. На узком — во всю ширину и с
              // переносом, на широком — по содержимому, как все остальные.
              className="h-auto w-full whitespace-normal py-2 sm:w-auto"
              onClick={async () => {
                await accountService.forgetDevice();
                setRemembered(false);
                toast.success(t("vault.settings.forgotten"));
              }}
            >
              {t("vault.settings.forget")}
            </Button>
          ) : null}
        </div>

        {hasPassword === false ? (
          <form onSubmit={setFirstPassword} className="space-y-3 border-t pt-4">
            <p className="text-sm text-muted-foreground">{t("vault.settings.noPassword")}</p>
            <div className="space-y-2">
              <Label htmlFor="vault-first">{t("vault.settings.next")}</Label>
              <Input
                id="vault-first"
                type="password"
                autoComplete="new-password"
                value={next}
                onChange={(event) => setNext(event.target.value)}
                required
              />
            </div>
            <Button type="submit" disabled={busy}>
              {t("vault.settings.setPassword")}
            </Button>
          </form>
        ) : null}

        <form
          onSubmit={changePassword}
          className={`space-y-3 border-t pt-4 ${hasPassword === false ? "hidden" : ""}`}
        >
          <div className="space-y-2">
            <Label htmlFor="vault-current">{t("vault.settings.current")}</Label>
            <Input
              id="vault-current"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="vault-next">{t("vault.settings.next")}</Label>
            <Input
              id="vault-next"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(event) => setNext(event.target.value)}
              required
            />
          </div>
          <Button type="submit" disabled={busy}>
            {t("vault.settings.change")}
          </Button>
        </form>

        {/* «Запереть» — то же, что выйти: ключ уходит из памяти, устройство
            забывает его, и данные снова спрашивают пароль.
            У записи БЕЗ пароля отпирать потом нечем, поэтому кнопки нет вовсе.
            Служба такой вызов тоже отклоняет — надеяться на то, что экран не
            ошибётся, нельзя. */}
        <div className={`border-t pt-4 ${hasPassword === false ? "hidden" : ""}`}>
          <Button
            type="button"
            variant="secondary"
            onClick={async () => {
              await accountService.lock();
              announceVaultChanged();
            }}
          >
            <LockOpen className="mr-2 size-4" />
            {t("vault.settings.lock")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
