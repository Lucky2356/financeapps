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
// ЧЕТЫРЕ ПУТИ, И НАЗВАНЫ ОНИ ТЕМ, ЧТО ЧЕЛОВЕК ДЕЛАЕТ, А НЕ ТЕМ, КУДА.
//
// Прежде здесь было «У меня есть код связки / Служба приложения / Своя
// служба» — и прогон «как новичок» показал две беды. На первом устройстве
// заранее был выбран код, которого у человека нет и взяться неоткуда. А
// «Служба приложения» на открытой службе всегда ЗАВОДИЛА запись: человек, у
// которого она уже есть, получал «имя занято» и войти по имени не мог вовсе.
//
// 1. СОЗДАТЬ УЧЁТНУЮ ЗАПИСЬ — первое устройство. Выбран по умолчанию: сюда, в
//    настройки, приходят с устройства, где данные уже ведутся.
// 2. КОД СВЯЗКИ — ещё одно устройство, код показывает первое.
// 3. ПО ИМЕНИ И ПАРОЛЮ — запись есть, кода под рукой нет.
// 4. СВОЯ СЛУЖБА — для того, кто поднял её сам.
//
// ПАРОЛЬ — ДО ОТПРАВКИ. Шкатулку заворачивает пароль, и второе устройство
// откроет её только им. У того, кто начинал «без пароля», шкатулка завёрнута
// случайным паролем, которого не знает никто: отправь мы её так, вход по
// введённому паролю прошёл бы, а данные на втором устройстве не открылись бы
// никогда. Поэтому такому человеку пароль задаётся здесь же, до отправки, — с
// показом кода восстановления. А у кого пароль есть, введённый сначала
// сверяется с данными на устройстве: неверный на службу не уезжает.
//
// ПРИГЛАШЕНИЕ СПРАШИВАЕТСЯ, ТОЛЬКО ЕСЛИ ОНО НУЖНО. Открыта ли запись, служба
// говорит сама (`GET /health`), и спросить это можно до всякого входа. Не
// ответила — считаем закрытой и поле показываем: лишнее поле, которое человек
// оставит пустым, стоит ему одной попытки; спрятанное поле, без которого не
// пускают, стоит ему всего подключения.

import { Camera, Cloud, CloudOff } from "lucide-react";

import { RecoveryWords } from "@/components/vault/recovery-words";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n/context";
import { DEFAULT_SERVER, hasDefaultServer } from "@/lib/sync/default-server";
import { readPairing } from "@/lib/sync/pairing-link";
import { cameraPossible, scanQr } from "@/lib/sync/scan-qr";
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
import { unlockWithPassword } from "@/lib/sync/vault-crypto";
import { probeServer, redeemPairing, type ServerLink } from "@/lib/vault/server-account";

/** Связь этого устройства со службой сменилась — для «Моих устройств». */
export const SERVER_LINK_CHANGED = "server-link-changed";

/** Каким путём человек подключается. */
type Way = "create" | "code" | "login" | "own";

const MIN_PASSWORD = 8;

export function ServerPanel() {
  const { t } = useI18n();
  const [link, setLink] = useState<ServerLink | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  const [way, setWay] = useState<Way>(hasDefaultServer() ? "create" : "own");
  /** Есть ли у данных пароль. null — ещё не спрашивали. */
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [repeat, setRepeat] = useState("");
  /** Код восстановления, если пароль задан только что. Показать до перезагрузки. */
  const [recovery, setRecovery] = useState<string | null>(null);
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
      const protectedByPassword = await accountService.hasPassword();
      if (!alive) return;
      setLink(stored);
      setHasPassword(protectedByPassword);
      setReady(true);
      // Первое устройство заводит запись на службе приложения — и сразу надо
      // знать, нужно ли ей приглашение.
      if (hasDefaultServer()) void askOpenness(DEFAULT_SERVER);
    })();
    return () => {
      alive = false;
    };
  }, []);

  /** Адрес, по которому пойдём: от кода связки, из сборки или от человека. */
  function address(): string {
    if (way === "code") return found?.base ?? DEFAULT_SERVER;
    if (way === "own") return base;
    return DEFAULT_SERVER;
  }

  /** Заводим ли запись (а не входим в существующую). */
  function registering(): boolean {
    if (way === "create") return true;
    if (way === "own") return code.trim() !== "" || open === true;
    return false;
  }

  /** Спросить службу, нужно ли ей приглашение. Молча: это не действие человека. */
  async function askOpenness(at: string): Promise<void> {
    if (!at.trim()) return;
    const answer = await probeServer(at);
    setOpen(answer.reachable ? answer.open : false);
  }

  /**
   * Предъявить то, что принесли, — из камеры или с клавиатуры.
   *
   * Разборщик ОДИН на оба пути нарочно. Заведи мы два, они однажды разойдутся
   * молча: набранное руками работает, снятое камерой нет, а выглядит это как
   * «камера не читает».
   */
  async function redeem(raw: string) {
    const parsed = readPairing(raw);
    if (!parsed) {
      toast.error(t("server.pairCodeBad"));
      return;
    }

    setBusy(true);
    try {
      // Адрес из картинки, а если его там не было — служба приложения: код
      // выдан ею в подавляющем большинстве случаев.
      const at = parsed.base ?? DEFAULT_SERVER;
      const answer = await redeemPairing(at, parsed.code);
      setFound(answer);
      setLogin(answer.login);
    } catch (cause) {
      toast.error((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Имена нарочно не начинаются с «use»: линтер принимает такое за хук, и
  // вызов из обработчика роняет сборку правилом rules-of-hooks.
  async function submitCode(event: React.FormEvent) {
    event.preventDefault();
    await redeem(pairing);
  }

  /** Навести камеру. Отказы камеры — обычные исходы, и каждый назван словом. */
  async function openCamera() {
    setBusy(true);
    const shot = await scanQr();
    setBusy(false);

    if (shot.ok) {
      setPairing(shot.text);
      await redeem(shot.text);
      return;
    }
    if (shot.why === "cancelled") return;
    toast.error(
      shot.why === "denied"
        ? t("server.cameraDenied")
        : shot.why === "absent"
          ? t("server.cameraAbsent")
          : t("server.cameraBroken")
    );
  }

  async function connect(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (!(await accountService.vault())) throw new Error(t("server.noVault"));

      const at = address();
      // Сначала — не занята ли эта запись службы соседом по компьютеру.
      // Спрашивается ДО подключения: после него данные уже перемешаны.
      await refuseSharedServerAccount(at, login);

      const device = deviceName();
      let fresh: string | null = null;
      if (registering()) {
        if (hasPassword === false) {
          // Пароля у данных нет — задаём его сейчас, до отправки шкатулки.
          if (password.length < MIN_PASSWORD) throw new Error(t("vault.setup.tooShort"));
          if (password !== repeat) throw new Error(t("vault.setup.mismatch"));
          fresh = (await accountService.setPassword(password)).recoveryCode;
          setHasPassword(true);
        } else {
          // Пароль есть — введённый обязан быть им. Иначе вход по нему пройдёт,
          // а данные на втором устройстве не откроются.
          const current = await accountService.vault();
          try {
            await unlockWithPassword(current!, password);
          } catch {
            throw new Error(t("server.passwordWrong"));
          }
        }
        // Шкатулка перечитывается: после установки пароля она уже другая.
        const vault = (await accountService.vault())!;
        await serverAccount.register({
          base: at,
          code: code.trim(),
          login,
          password,
          vault,
          device
        });
      } else {
        // Вход в существующую запись — это ещё одно устройство, и шкатулку,
        // которую отдаёт служба, надо принять как свою. Ключ данных придумывался
        // на первом устройстве; здесь первый запуск завёл свой, и данными с
        // сервера он не открывается.
        const joined = await serverAccount.signIn({ base: at, login, password, device });
        await accountService.adopt(joined.vault, password);
      }

      await rememberMyServer(at, login);
      await resumeSync();
      setLink(await serverAccount.link());
      window.dispatchEvent(new Event(SERVER_LINK_CHANGED));
      setPassword("");
      setRepeat("");
      setCode("");
      setPairing("");
      toast.success(t("server.connected"));

      await flushSync();
      if (registering()) {
        // Запись заведена С ЭТОГО устройства: со службы ничего не приезжает, и
        // перечитывать приложение незачем. Больше того — вредно: перезагрузка
        // теряет ключ из памяти, и человек, только что задавший пароль, тут же
        // упирался бы в «введите пароль». Если пароль задан сейчас — показать
        // код восстановления: второй раз его не покажут.
        if (fresh) setRecovery(fresh);
        return;
      }
      // Вошли в существующую запись: данные приезжают в хранилище, а не на
      // экран, и сказать об этом полутора сотням экранов некому. Перечитать
      // приложение целиком проще и надёжнее.
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
      window.dispatchEvent(new Event(SERVER_LINK_CHANGED));
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
    if (next === "own") setOpen(null);
    else if (hasDefaultServer()) void askOpenness(DEFAULT_SERVER);
  }

  const ways: Array<{ id: Way; title: string; note: string }> = [
    ...(hasDefaultServer()
      ? [
          { id: "create" as Way, title: t("server.wayCreate"), note: t("server.wayCreateNote") },
          { id: "code" as Way, title: t("server.haveCode"), note: t("server.haveCodeNote") },
          { id: "login" as Way, title: t("server.wayLogin"), note: t("server.wayLoginNote") }
        ]
      : [{ id: "code" as Way, title: t("server.haveCode"), note: t("server.haveCodeNote") }]),
    { id: "own", title: t("server.whereOwn"), note: t("server.whereOwnNote") }
  ];
  /** Задаём пароль здесь же: заводим запись, а у данных его нет. */
  const settingPassword = hasPassword === false && registering();

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

        {recovery ? (
          <RecoveryWords code={recovery} onDone={() => setRecovery(null)} />
        ) : !ready ? null : link ? (
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
              <form onSubmit={submitCode} className="space-y-3">
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
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={busy} className="h-auto whitespace-normal py-2">
                    {busy ? t("server.pairCodeCheck") : t("server.pairCodeUse")}
                  </Button>
                  {/* Камера — только там, где она есть. На компьютере кнопки
                      нет вовсе: предлагать путь, которого нет, хуже, чем не
                      предлагать ничего. */}
                  {cameraPossible() ? (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy}
                      className="h-auto whitespace-normal py-2"
                      onClick={() => void openCamera()}
                    >
                      <Camera className="size-4" />
                      {t("server.cameraUse")}
                    </Button>
                  ) : null}
                </div>
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
                  <Label htmlFor="server-password">
                    {settingPassword ? t("server.newPassword") : t("server.password")}
                  </Label>
                  <Input
                    id="server-password"
                    type="password"
                    autoComplete={settingPassword ? "new-password" : "current-password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    {settingPassword ? t("server.newPasswordHint") : t("server.passwordHint")}
                  </p>
                </div>
                {settingPassword ? (
                  <div className="space-y-2">
                    <Label htmlFor="server-repeat">{t("vault.setup.repeat")}</Label>
                    <Input
                      id="server-repeat"
                      type="password"
                      autoComplete="new-password"
                      value={repeat}
                      onChange={(event) => setRepeat(event.target.value)}
                      required
                    />
                  </div>
                ) : null}

                {/* Приглашение — только там, где оно может понадобиться: своей
                    записи по коду связки не заводят, её там уже завели. */}
                {registering() && open !== true ? (
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
