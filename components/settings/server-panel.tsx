"use client";

// Свой сервер: привязать это устройство к службе или отвязать.
//
// Что здесь важно сказать человеку вслух, а не спрятать:
//
//   * данные уезжают на сервер ЗАШИФРОВАННЫМИ, и открыть их сервер не может —
//     ключа у него нет и взяться ему неоткуда;
//   * пароль на сервер не уходит: уходит выведенный из него секрет входа, из
//     которого обратно к ключу данных хода нет;
//   * «отвязать» — это про связь, а не про данные: они остаются на устройстве
//     целиком, и человек должен видеть это прежде, чем нажмёт.
//
// ТРИ ПУТИ ВМЕСТО ОДНОГО, и порядок между ними не случаен.
//
// 1. КОД СВЯЗКИ — первый и главный. Он для того, у кого данные уже есть на
//    другом устройстве, а это и есть самый частый случай: человек ставит
//    приложение на телефон, имея его на компьютере. Раньше ему приходилось
//    переносить руками адрес службы и имя входа, и ошибался он ровно там, где
//    ошибиться проще всего, — в адресе.
// 2. СЛУЖБА ПРИЛОЖЕНИЯ — для того, у кого ещё ничего нет. Адрес зашит в
//    сборку, вводить нечего. Цена названа на самом экране, а не в памятке: тот,
//    кто держит службу, видит, что у вас есть запись, как она называется и
//    когда вы вносили правки. Содержимого он не видит, и это не обещание, а
//    свойство шифрования.
// 3. СВОЯ СЛУЖБА — для того, кто поднял её сам. Была единственным путём,
//    осталась полноценным — просто перестала быть первым вопросом человеку,
//    который слова «служба» не знает.
//
// ПРИГЛАШЕНИЕ СПРАШИВАЕТСЯ, ТОЛЬКО ЕСЛИ ОНО НУЖНО. Открыта ли запись, служба
// говорит сама (`GET /health`), и спросить это можно до всякого входа. Не
// ответила — считаем закрытой и поле показываем: лишнее поле, которое человек
// оставит пустым, стоит ему одной попытки; спрятанное поле, без которого не
// пускают, стоит ему всего подключения.

import { Cloud, CloudOff } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n/context";
import { DEFAULT_SERVER, hasDefaultServer } from "@/lib/sync/default-server";
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
import { probeServer, redeemPairing, type ServerLink } from "@/lib/vault/server-account";

/** Каким путём человек подключается. */
type Way = "code" | "app" | "own";

export function ServerPanel() {
  const { t } = useI18n();
  const [link, setLink] = useState<ServerLink | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  const [way, setWay] = useState<Way>(hasDefaultServer() ? "code" : "own");
  const [base, setBase] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");

  const [pairing, setPairing] = useState("");
  /** Что приехало по коду связки. Пока null — пароль спрашивать рано. */
  const [found, setFound] = useState<{ base: string; login: string } | null>(null);
  /** Открыта ли запись на выбранной службе. null — ещё не спрашивали. */
  const [open, setOpen] = useState<boolean | null>(null);

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

  /** Адрес, по которому пойдём: от кода связки, из сборки или от человека. */
  function address(): string {
    if (way === "code") return found?.base ?? DEFAULT_SERVER;
    if (way === "app") return DEFAULT_SERVER;
    return base;
  }

  /** Спросить службу, нужно ли ей приглашение. Молча: это не действие человека. */
  async function askOpenness(at: string): Promise<void> {
    if (!at.trim()) return;
    const answer = await probeServer(at);
    setOpen(answer.reachable ? answer.open : false);
  }

  async function useCode(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      // Спрашиваем сначала службу приложения: код выдан ею в подавляющем
      // большинстве случаев. Не нашла — значит служба своя, и человек назовёт
      // её сам; отправлять его за этим молча мы не можем, адреса у нас нет.
      const answer = await redeemPairing(DEFAULT_SERVER, pairing);
      setFound(answer);
      setLogin(answer.login);
    } catch (cause) {
      toast.error((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function connect(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const vault = await accountService.vault();
      if (!vault) throw new Error(t("server.noVault"));

      const at = address();
      // Сначала — не занята ли эта запись службы соседом по компьютеру.
      // Спрашивается ДО подключения: после него данные уже перемешаны.
      await refuseSharedServerAccount(at, login);

      const device = deviceName();
      if (way !== "code" && code.trim()) {
        await serverAccount.register({ base: at, code, login, password, vault, device });
      } else if (way !== "code" && open === true) {
        // Открытая запись: приглашения нет и не нужно. Заводим здесь же.
        await serverAccount.register({ base: at, code: "", login, password, vault, device });
      } else {
        // Вход БЕЗ приглашения — это второе устройство, и шкатулку, которую
        // отдаёт служба, надо принять как свою. Ключ данных придумывался на
        // первом устройстве; здесь первый запуск завёл свой, и данными с
        // сервера он не открывается. Выбрось мы её здесь — устройство
        // подключилось бы, показало «Всё на сервере» и не смогло бы прочитать
        // ни одной записи.
        const joined = await serverAccount.signIn({ base: at, login, password, device });
        await accountService.adopt(joined.vault, password);
      }

      await rememberMyServer(at, login);
      await resumeSync();
      setLink(await serverAccount.link());
      setPassword("");
      setCode("");
      setPairing("");
      toast.success(t("server.connected"));

      // Дождаться первого обмена и перечитать приложение целиком.
      //
      // Данные приезжают в хранилище, а не на экран: слой синхронизации пишет
      // их под всеми открытыми экранами, и сказать им об этом некому — на
      // onApplied никто не подписан. Без перечитывания человек, подключивший
      // второе устройство, видит ровно то же, что при неудаче: «подключено» и
      // пустоту. Разбираться, что данные уже на диске и надо всего лишь
      // перезапустить приложение, он не должен.
      //
      // Тем же способом сделаны «Очистить все данные» и «Загрузить пример»:
      // данные под приложением сменились целиком, и перечитать их проще и
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

  function pick(next: Way) {
    setWay(next);
    setFound(null);
    setOpen(null);
    if (next === "app") void askOpenness(DEFAULT_SERVER);
  }

  const ways: Array<{ id: Way; title: string; note: string }> = [
    ...(hasDefaultServer()
      ? [
          { id: "code" as Way, title: t("server.haveCode"), note: t("server.haveCodeNote") },
          { id: "app" as Way, title: t("server.whereApp"), note: t("server.whereAppNote") }
        ]
      : [{ id: "code" as Way, title: t("server.haveCode"), note: t("server.haveCodeNote") }]),
    { id: "own", title: t("server.whereOwn"), note: t("server.whereOwnNote") }
  ];

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
          <div className="space-y-4">
            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-medium">{t("server.where")}</legend>
              {ways.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => pick(option.id)}
                  aria-pressed={way === option.id}
                  className={`w-full rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    way === option.id ? "border-foreground/45 bg-muted/40" : "bg-card"
                  }`}
                >
                  <span className="block text-sm font-medium">{option.title}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{option.note}</span>
                </button>
              ))}
            </fieldset>

            {way === "code" && !found ? (
              <form onSubmit={useCode} className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="server-pairing">{t("server.pairCode")}</Label>
                  <Input
                    id="server-pairing"
                    autoCapitalize="characters"
                    autoComplete="off"
                    placeholder="ABCD-EFGH"
                    value={pairing}
                    onChange={(event) => setPairing(event.target.value)}
                    required
                  />
                </div>
                <Button
                  type="submit"
                  disabled={busy}
                  className="h-auto w-full whitespace-normal py-2 sm:w-auto"
                >
                  {busy ? t("server.pairCodeCheck") : t("server.pairCodeUse")}
                </Button>
              </form>
            ) : (
              <form onSubmit={connect} className="space-y-3">
                {found ? (
                  <p className="rounded-lg border bg-muted/40 p-3 text-sm">
                    {t("server.pairCodeFound", { login: found.login, base: found.base })}
                  </p>
                ) : null}

                {way === "own" ? (
                  <div className="space-y-2">
                    <Label htmlFor="server-base">{t("server.address")}</Label>
                    <Input
                      id="server-base"
                      inputMode="url"
                      autoCapitalize="none"
                      placeholder="https://finance.example.org"
                      value={base}
                      onChange={(event) => setBase(event.target.value)}
                      onBlur={(event) => void askOpenness(event.target.value)}
                      required
                    />
                  </div>
                ) : null}

                {found ? null : (
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
                )}

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

                {/* Приглашение — только там, где оно может понадобиться: своей
                    записи по коду связки не заводят, её там уже завели. */}
                {!found && open !== true ? (
                  <div className="space-y-2">
                    <Label htmlFor="server-code">{t("server.code")}</Label>
                    <Input
                      id="server-code"
                      autoCapitalize="none"
                      value={code}
                      onChange={(event) => setCode(event.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      {open === false ? t("server.closedHere") : t("server.codeHint")}
                    </p>
                  </div>
                ) : null}

                <Button
                  type="submit"
                  disabled={busy}
                  className="h-auto w-full whitespace-normal py-2 sm:w-auto"
                >
                  {busy ? t("server.connecting") : t("server.connect")}
                </Button>
              </form>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
