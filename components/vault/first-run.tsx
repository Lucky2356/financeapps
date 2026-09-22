"use client";

// Первый запуск: откуда взять данные, нужен ли пароль, и если нужен — задать
// его, увидеть код восстановления и доказать, что его записали.
//
// ПОЧЕМУ ПЕРВЫЙ ВОПРОС — ПРО ДАННЫЕ. Человек ставит приложение в трёх разных
// положениях, и они требуют разного. Один начинает вести расходы впервые.
// Второй переезжает и держит в руках файл копии. Третий уже ведёт их на
// компьютере и ставит приложение на телефон. До сих пор все трое получали
// первый экран второго и узнавали о двух других способах случайно — а третий,
// самый нетерпеливый, успевал завести пустые данные, которые потом мешали
// подключению.
//
// ПОЧЕМУ ВЫБОР ИДЁТ ПЕРВЫМ. Три обязательных экрана до первой операции — самое
// частое место, где люди бросают. Человек скачал приложение записать вчерашний
// поход в магазин, а его просят придумать пароль и переписать на бумагу
// двенадцать слов. Теперь пароль предлагается, но не требуется, и пропустить
// его можно одной кнопкой — с честным объяснением, что это значит, а не с
// бодрым «потом настроите».
//
// Проверка слов в конце — не формальность и не придирка. Код восстановления
// показывают ровно один раз, и человек, нажавший «я записал» не записав, узнает
// об этом в тот день, когда забудет пароль, — то есть когда возвращать будет
// уже нечего. Два слова обратно стоят десяти секунд сейчас и всех данных потом.

import { KeyRound, Lock, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { apiClient } from "@/lib/api/client";
import { unwrapBackup } from "@/lib/backup/unwrap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n/context";
import { pickTwo } from "@/lib/vault/pick-two";
import { deviceName } from "@/lib/vault/device-name";
import { accountService, flushSync, resumeSync, serverAccount } from "@/lib/vault/runtime";
import { Head, Problem, Shell } from "@/components/vault/shell";

const MIN_PASSWORD = 8;

type Step = "source" | "choose" | "password" | "code" | "verify" | "restore" | "join";
type Source = "fresh" | "file" | "device";

export function FirstRun({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const [step, setStep] = useState<Step>("source");
  /** Что человек выбрал на первом экране: решает, куда идти после защиты. */
  const [source, setSource] = useState<Source>("fresh");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [base, setBase] = useState("");
  const [login, setLogin] = useState("");
  const [joinPassword, setJoinPassword] = useState("");
  const [copied, setCopied] = useState(false);
  const [ask, setAsk] = useState<[number, number]>([0, 1]);
  const [answers, setAnswers] = useState(["", ""]);

  const words = code ? code.split(" ") : [];

  async function createAccount(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD) return setError(t("vault.setup.tooShort"));
    if (password !== repeat) return setError(t("vault.setup.mismatch"));

    setBusy(true);
    try {
      const { recoveryCode } = await accountService.create(password);
      setCode(recoveryCode);
      setAsk(pickTwo(recoveryCode.split(" ").length));
      setStep("code");
    } catch (cause) {
      setError(t("vault.error", { message: (cause as Error).message }));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Защита настроена — дальше зависит от того, с чего человек начал.
   *
   * «Из файла» ведёт к выбору файла, а не наружу: восстановление пишет в
   * хранилище, а писать в него можно только с ключом. Значит защита обязана
   * быть настроена ДО, и порядок экранов здесь — не вкусовщина.
   */
  function protectionDone() {
    if (source === "file") return setStep("restore");
    onDone();
  }

  async function startWithoutPassword() {
    setError(null);
    setBusy(true);
    try {
      await accountService.createWithoutPassword();
      protectionDone();
    } catch (cause) {
      setError(t("vault.error", { message: (cause as Error).message }));
    } finally {
      setBusy(false);
    }
  }

  /** Поднять данные из файла копии — тем же путём, что и «Импорт». */
  async function restoreFromFile(event: React.FormEvent) {
    event.preventDefault();
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const payload = unwrapBackup(JSON.parse(await file.text()));
      if (!payload || typeof payload !== "object") throw new Error(t("vault.restore.broken"));
      await apiClient.post("/backup", { backup: payload });
      onDone();
    } catch (cause) {
      // Непрочитанный JSON и отвергнутая копия — для человека одно и то же:
      // файл не тот. Разницу между ними ему разбирать незачем.
      const message =
        cause instanceof SyntaxError ? t("vault.restore.broken") : (cause as Error).message;
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  /**
   * Забрать данные с устройства, где они уже есть.
   *
   * Своей записи здесь не заводится вовсе, и это главное отличие от прежнего
   * порядка. Раньше человек проходил первый запуск, заводил ключ — и тут же
   * выбрасывал его, потому что данные с сервера открываются ЧУЖИМ ключом, из
   * чужой шкатулки. Хуже того: успей он записать хоть одну операцию, и
   * подключение отказывало, потому что терять было что.
   *
   * Теперь шкатулка приезжает со службы и принимается как своя сразу.
   */
  async function join(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const joined = await serverAccount.signIn({
        base,
        login,
        password: joinPassword,
        device: deviceName()
      });
      await accountService.adopt(joined.vault, joinPassword);
      await resumeSync();
      await flushSync();
      onDone();
    } catch (cause) {
      setError(t("vault.error", { message: (cause as Error).message }));
    } finally {
      setBusy(false);
    }
  }

  function answer(slot: number, value: string) {
    setAnswers((prev) => prev.map((old, index) => (index === slot ? value : old)));
  }

  function verify(event: React.FormEvent) {
    event.preventDefault();
    const ok = ask.every((index, slot) => answers[slot].trim().toLowerCase() === words[index]);
    if (!ok) return setError(t("vault.verify.wrong"));
    protectionDone();
  }

  return (
    <Shell>
      {step === "source" && (
        <div className="space-y-4">
          <Head icon={<Lock className="size-5" />} title={t("vault.source.title")} />
          <p className="text-sm text-muted-foreground">{t("vault.source.lead")}</p>

          <div className="space-y-3">
            <Choice
              label={t("vault.source.fresh")}
              hint={t("vault.source.freshHint")}
              onClick={() => {
                setSource("fresh");
                setStep("choose");
              }}
            />
            <Choice
              label={t("vault.source.file")}
              hint={t("vault.source.fileHint")}
              onClick={() => {
                setSource("file");
                setStep("choose");
              }}
            />
            <Choice
              label={t("vault.source.device")}
              hint={t("vault.source.deviceHint")}
              onClick={() => {
                setSource("device");
                setStep("join");
              }}
            />
          </div>
        </div>
      )}

      {step === "restore" && (
        <form onSubmit={restoreFromFile} className="space-y-4">
          <Head icon={<KeyRound className="size-5" />} title={t("vault.restore.title")} />
          <p className="text-sm text-muted-foreground">{t("vault.restore.lead")}</p>

          <div className="space-y-2">
            <Label htmlFor="vault-backup">{t("vault.restore.pick")}</Label>
            <Input
              id="vault-backup"
              type="file"
              accept="application/json,.json"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              required
            />
          </div>

          <Problem text={error} />
          <Button type="submit" className="w-full" disabled={busy || !file}>
            {busy ? t("vault.restore.working") : t("vault.restore.submit")}
          </Button>
          {/* Выход есть всегда: человек, не нашедший файл, не должен остаться
              запертым на экране, который без файла не проходится. */}
          <Button type="button" variant="ghost" className="w-full" onClick={onDone}>
            {t("vault.restore.skip")}
          </Button>
        </form>
      )}

      {step === "join" && (
        <form onSubmit={join} className="space-y-4">
          <Head icon={<ShieldCheck className="size-5" />} title={t("vault.join.title")} />
          <p className="text-sm text-muted-foreground">{t("vault.join.lead")}</p>

          <div className="space-y-2">
            <Label htmlFor="join-base">{t("server.address")}</Label>
            <Input
              id="join-base"
              inputMode="url"
              autoCapitalize="none"
              placeholder="https://finance.example.org"
              value={base}
              onChange={(event) => setBase(event.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="join-login">{t("server.login")}</Label>
            <Input
              id="join-login"
              autoCapitalize="none"
              value={login}
              onChange={(event) => setLogin(event.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="join-password">{t("server.password")}</Label>
            <Input
              id="join-password"
              type="password"
              autoComplete="current-password"
              value={joinPassword}
              onChange={(event) => setJoinPassword(event.target.value)}
              required
            />
          </div>

          <Problem text={error} />
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? t("vault.join.working") : t("vault.join.submit")}
          </Button>
        </form>
      )}

      {step === "choose" && (
        <div className="space-y-4">
          <Head icon={<Lock className="size-5" />} title={t("vault.choose.title")} />
          <p className="text-sm text-muted-foreground">{t("vault.choose.lead")}</p>

          <Problem text={error} />

          <Button type="button" className="w-full" onClick={() => setStep("password")}>
            {t("vault.choose.withPassword")}
          </Button>

          <div className="space-y-2">
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              disabled={busy}
              onClick={startWithoutPassword}
            >
              {busy ? t("vault.choose.working") : t("vault.choose.without")}
            </Button>
            {/* Оговорка стоит ПОД кнопкой, а не спрятана за вопросительным
                знаком: человек читает её в тот момент, когда решает, а не
                когда пойдёт искать, почему так вышло. */}
            <p className="text-xs text-muted-foreground">{t("vault.choose.withoutHint")}</p>
          </div>
        </div>
      )}

      {step === "password" && (
        <form onSubmit={createAccount} className="space-y-4">
          <Head icon={<Lock className="size-5" />} title={t("vault.setup.title")} />
          <p className="text-sm text-muted-foreground">{t("vault.setup.lead")}</p>

          <div className="space-y-2">
            <Label htmlFor="vault-password">{t("vault.setup.password")}</Label>
            <Input
              id="vault-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="vault-repeat">{t("vault.setup.repeat")}</Label>
            <Input
              id="vault-repeat"
              type="password"
              autoComplete="new-password"
              value={repeat}
              onChange={(event) => setRepeat(event.target.value)}
              required
            />
          </div>

          <Problem text={error} />
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? t("vault.setup.working") : t("vault.setup.submit")}
          </Button>
        </form>
      )}

      {step === "code" && (
        <div className="space-y-4">
          <Head icon={<KeyRound className="size-5" />} title={t("vault.code.title")} />
          <p className="text-sm text-muted-foreground">{t("vault.code.lead")}</p>

          <ol className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg border bg-muted/40 p-4 text-sm sm:grid-cols-3">
            {words.map((word, index) => (
              <li key={word} className="flex gap-2 tabular-nums">
                <span className="w-5 shrink-0 text-right text-muted-foreground">{index + 1}.</span>
                <span className="font-medium">{word}</span>
              </li>
            ))}
          </ol>

          {/* Слова бумажные, но копию в буфер тоже дадим: кто-то держит их в
              менеджере паролей, и заставлять его перепечатывать — вредничать. */}
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            onClick={async () => {
              await navigator.clipboard?.writeText(code);
              setCopied(true);
            }}
          >
            {copied ? t("vault.code.copied") : t("vault.code.copy")}
          </Button>

          <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
            {t("vault.code.warning")}
          </p>

          <Button
            type="button"
            className="w-full"
            onClick={() => {
              setError(null);
              setAnswers(["", ""]);
              setStep("verify");
            }}
          >
            {t("vault.code.next")}
          </Button>
        </div>
      )}

      {step === "verify" && (
        <form onSubmit={verify} className="space-y-4">
          <Head icon={<ShieldCheck className="size-5" />} title={t("vault.verify.title")} />
          <p className="text-sm text-muted-foreground">
            {t("vault.verify.lead", { a: ask[0] + 1, b: ask[1] + 1 })}
          </p>

          {ask.map((index, slot) => (
            <div key={index} className="space-y-2">
              <Label htmlFor={`vault-word-${slot}`}>
                {t("vault.verify.word", { n: index + 1 })}
              </Label>
              <Input
                id={`vault-word-${slot}`}
                autoComplete="off"
                autoCapitalize="none"
                value={answers[slot]}
                onChange={(event) => answer(slot, event.target.value)}
                required
              />
            </div>
          ))}

          <Problem text={error} />
          <Button type="submit" className="w-full">
            {t("vault.verify.submit")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={() => {
              setError(null);
              setStep("code");
            }}
          >
            {t("vault.verify.back")}
          </Button>
        </form>
      )}
    </Shell>
  );
}

/**
 * Один способ начать: крупная подпись и строка пояснения под ней.
 *
 * Пояснение обязательное, а не по желанию: «Начать с нуля» и «Восстановить из
 * файла» человек различит, а вот что именно значит «данные уже есть на другом
 * устройстве», из трёх слов не поймёт никто. Три кнопки без пояснений — это
 * три догадки.
 */
function Choice({ label, hint, onClick }: { label: string; hint: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-lg border bg-card p-4 text-left transition-colors hover:border-foreground/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="block text-sm font-medium">{label}</span>
      <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>
    </button>
  );
}
