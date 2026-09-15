"use client";

// Первый запуск: задать пароль, увидеть код восстановления и доказать, что его
// записали.
//
// Проверка в конце — не формальность и не придирка. Код восстановления
// показывают ровно один раз, и человек, нажавший «я записал» не записав, узнает
// об этом в тот день, когда забудет пароль, — то есть когда возвращать будет
// уже нечего. Два слова обратно стоят десяти секунд сейчас и всей книги потом.

import { KeyRound, Lock, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n/context";
import { pickTwo } from "@/lib/vault/pick-two";
import { accountService } from "@/lib/vault/runtime";
import { cn } from "@/lib/utils";

const MIN_PASSWORD = 8;

export function FirstRun({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const [step, setStep] = useState<"password" | "code" | "verify">("password");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [code, setCode] = useState("");
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

  function answer(slot: number, value: string) {
    setAnswers((prev) => prev.map((old, index) => (index === slot ? value : old)));
  }

  function verify(event: React.FormEvent) {
    event.preventDefault();
    const ok = ask.every((index, slot) => answers[slot].trim().toLowerCase() === words[index]);
    if (!ok) return setError(t("vault.verify.wrong"));
    onDone();
  }

  return (
    <Shell>
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

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-sm">{children}</div>
    </div>
  );
}

export function Head({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <h1 className="flex items-center gap-2 text-lg font-semibold">
      <span className="text-muted-foreground">{icon}</span>
      {title}
    </h1>
  );
}

export function Problem({ text, className }: { text: string | null; className?: string }) {
  if (!text) return null;
  return (
    <p role="alert" className={cn("text-sm font-medium text-destructive", className)}>
      {text}
    </p>
  );
}
