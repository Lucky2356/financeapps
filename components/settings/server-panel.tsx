"use client";

// Свой сервер: привязать это устройство к службе или отвязать.
//
// Что здесь важно сказать человеку вслух, а не спрятать:
//
//   * книга уезжает на сервер ЗАШИФРОВАННОЙ, и открыть её сервер не может —
//     ключа у него нет и взяться ему неоткуда;
//   * пароль на сервер не уходит: уходит выведенный из него секрет входа, из
//     которого обратно к ключу книги хода нет;
//   * «отвязать» — это про связь, а не про данные: книга остаётся на устройстве
//     целиком, и человек должен видеть это прежде, чем нажмёт.
//
// Регистрация — по приглашению, и другого пути нет. Почты у службы тоже нет:
// при сквозном шифровании письма для сброса пароля бесполезны (сбрасывает код
// восстановления), а приглашение на десять человек раздаётся лично.

import { Cloud, CloudOff } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n/context";
import {
  accountService,
  flushSync,
  forgetMyServer,
  refuseSharedServerAccount,
  rememberMyServer,
  resumeSync,
  serverAccount,
  stopSync
} from "@/lib/vault/runtime";
import { deviceName } from "@/lib/vault/device-name";
import type { ServerLink } from "@/lib/vault/server-account";

export function ServerPanel() {
  const { t } = useI18n();
  const [link, setLink] = useState<ServerLink | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  const [base, setBase] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");

  useEffect(() => {
    let alive = true;
    void (async () => {
      const stored = await serverAccount.link();
      if (!alive) return;
      setLink(stored);
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function connect(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const vault = await accountService.vault();
      if (!vault) throw new Error(t("server.noVault"));

      // Сначала — не занята ли эта запись службы соседом по компьютеру.
      // Спрашивается ДО подключения: после него данные уже перемешаны.
      await refuseSharedServerAccount(base, login);

      const device = deviceName();
      if (code.trim()) {
        await serverAccount.register({ base, code, login, password, vault, device });
      } else {
        // Вход БЕЗ приглашения — это второе устройство, и шкатулку, которую
        // отдаёт служба, надо принять как свою. Ключ книги придумывался на
        // первом устройстве; здесь первый запуск завёл свой, и книгой с сервера
        // он не открывается. Выбрось мы её здесь — устройство подключилось бы,
        // показало «Всё на сервере» и не смогло бы прочитать ни одной записи.
        const joined = await serverAccount.signIn({ base, login, password, device });
        await accountService.adopt(joined.vault, password);
      }

      await rememberMyServer(base, login);
      await resumeSync();
      setLink(await serverAccount.link());
      setPassword("");
      setCode("");
      toast.success(t("server.connected"));

      // Дождаться первого обмена и перечитать приложение целиком.
      //
      // Книга приезжает в хранилище, а не на экран: слой синхронизации пишет её
      // под всеми открытыми экранами, и сказать им об этом некому — на onApplied
      // никто не подписан. Без перечитывания человек, подключивший второе
      // устройство, видит ровно то же, что при неудаче: «подключено» и пустоту.
      // Разбираться, что книга уже на диске и надо всего лишь перезапустить
      // приложение, он не должен.
      //
      // Тем же способом сделаны «Очистить все данные» и «Загрузить пример»:
      // книга под приложением сменилась целиком, и перечитать её проще и
      // надёжнее, чем обновлять полторы сотни экранов по одному.
      await flushSync();
      await new Promise((resolve) => setTimeout(resolve, 600));
      window.location.reload();
    } catch (cause) {
      toast.error((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      stopSync();
      await serverAccount.signOut();
      await forgetMyServer();
      setLink(null);
      toast.success(t("server.disconnected"));
    } catch (cause) {
      toast.error((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card id="set-server" className="scroll-mt-24">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {link ? <Cloud className="size-4" /> : <CloudOff className="size-4" />}
          {t("server.title")}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{t("server.lead")}</p>

        {!ready ? null : link ? (
          <div className="space-y-3">
            <dl className="grid gap-1 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{t("server.address")}</dt>
                <dd className="truncate font-medium">{link.base}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{t("server.login")}</dt>
                <dd className="truncate font-medium">{link.login}</dd>
              </div>
            </dl>

            <p className="rounded-lg border bg-muted/40 p-3 text-sm">
              {t("server.disconnectNote")}
            </p>

            <Button
              type="button"
              variant="secondary"
              onClick={() => void disconnect()}
              disabled={busy}
              className="h-auto w-full whitespace-normal py-2 sm:w-auto"
            >
              {t("server.disconnect")}
            </Button>
          </div>
        ) : (
          <form onSubmit={connect} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="server-base">{t("server.address")}</Label>
              <Input
                id="server-base"
                inputMode="url"
                autoCapitalize="none"
                placeholder="https://finance.example.org"
                value={base}
                onChange={(event) => setBase(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="server-login">{t("server.login")}</Label>
              <Input
                id="server-login"
                autoCapitalize="none"
                value={login}
                onChange={(event) => setLogin(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="server-password">{t("server.password")}</Label>
              <Input
                id="server-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">{t("server.passwordHint")}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="server-code">{t("server.code")}</Label>
              <Input
                id="server-code"
                autoCapitalize="none"
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t("server.codeHint")}</p>
            </div>

            <Button
              type="submit"
              disabled={busy}
              className="h-auto w-full whitespace-normal py-2 sm:w-auto"
            >
              {busy ? t("server.connecting") : t("server.connect")}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
