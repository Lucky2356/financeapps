"use client";

// Экран замка: пароль при запуске и путь назад для того, кто его забыл.

import { Lock, LifeBuoy } from "lucide-react";
import { useState } from "react";

import { Head, Problem, Shell } from "@/components/vault/shell";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/lib/i18n/context";
import { accountService } from "@/lib/vault/runtime";

export function UnlockScreen({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const confirm = useConfirm();
  const [mode, setMode] = useState<"password" | "recover">("password");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [code, setCode] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function attempt(run: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await run();
      onDone();
    } catch (cause) {
      setError((cause as Error).message || t("vault.unlock.wrong"));
    } finally {
      setBusy(false);
    }
  }

  if (mode === "recover") {
    return (
      <Shell>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void attempt(() => accountService.resetPassword(code, nextPassword));
          }}
        >
          <Head icon={<LifeBuoy className="size-5" />} title={t("vault.recover.title")} />
          <p className="text-sm text-muted-foreground">{t("vault.recover.lead")}</p>

          <div className="space-y-2">
            <Label htmlFor="vault-code">{t("vault.recover.code")}</Label>
            <Textarea
              id="vault-code"
              rows={3}
              autoComplete="off"
              autoCapitalize="none"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="vault-new-password">{t("vault.recover.newPassword")}</Label>
            <Input
              id="vault-new-password"
              type="password"
              autoComplete="new-password"
              value={nextPassword}
              onChange={(event) => setNextPassword(event.target.value)}
              required
            />
          </div>

          <Problem text={error} />
          <Button type="submit" className="w-full" disabled={busy}>
            {t("vault.recover.submit")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={() => {
              setError(null);
              setMode("password");
            }}
          >
            {t("vault.recover.back")}
          </Button>
        </form>
      </Shell>
    );
  }

  return (
    <Shell>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void attempt(() => accountService.unlock(password, { remember }));
        }}
      >
        <Head icon={<Lock className="size-5" />} title={t("vault.unlock.title")} />
        <p className="text-sm text-muted-foreground">{t("vault.unlock.lead")}</p>

        <div className="space-y-2">
          <Label htmlFor="vault-unlock-password">{t("vault.setup.password")}</Label>
          <Input
            id="vault-unlock-password"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>

        {/* Галка и под ней прямая строка о том, чем за неё платят. Написать
            «удобно» и умолчать про цену — значит продать человеку то, чего он
            не покупал. */}
        <div className="space-y-1.5 rounded-lg border bg-muted/30 p-3">
          <label className="flex items-start gap-2.5 text-sm font-medium">
            <input
              type="checkbox"
              className="mt-0.5 size-4 shrink-0 accent-primary"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
            />
            {t("vault.unlock.remember")}
          </label>
          <p className="pl-[1.625rem] text-xs text-muted-foreground">
            {t("vault.unlock.rememberHint")}
          </p>
        </div>

        <Problem text={error} />
        <Button type="submit" className="w-full" disabled={busy}>
          {t("vault.unlock.submit")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="w-full"
          onClick={() => {
            setError(null);
            setMode("recover");
          }}
        >
          {t("vault.unlock.forgot")}
        </Button>

        {/* Последняя дверь. Без неё потерявший и пароль, и код остался бы с
            приложением, которое не открывается и не сбрасывается, — и стал бы
            сносить его вместе с папкой данных, наугад. Пусть лучше выход будет
            назван своими словами и стоит за подтверждением. */}
        <button
          type="button"
          className="w-full pt-1 text-center text-xs text-muted-foreground underline-offset-4 hover:underline"
          onClick={async () => {
            const sure = await confirm({
              title: t("vault.wipe.title"),
              description: t("vault.wipe.body"),
              confirmLabel: t("vault.wipe.confirm"),
              destructive: true
            });
            if (!sure) return;
            await accountService.forgetEverything();
            onDone();
          }}
        >
          {t("vault.wipe.link")}
        </button>
      </form>
    </Shell>
  );
}
