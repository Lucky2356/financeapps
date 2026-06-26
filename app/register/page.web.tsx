"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useState, type FormEvent } from "react";

import { AuthScreen } from "@/components/auth/auth-screen";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n/context";

export default function RegisterPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    const name = String(form.get("name") ?? "");

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name: name || undefined })
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? t("auth.registerFailed"));
        setLoading(false);
        return;
      }
      // Auto sign-in after successful registration.
      const result = await signIn("credentials", { redirect: false, email, password });
      setLoading(false);
      if (result?.error) {
        router.push("/login");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError(t("auth.networkError"));
      setLoading(false);
    }
  }

  return (
    <AuthScreen>
      <Card className="w-full">
        <CardHeader>
          <CardTitle>{t("auth.register.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t("auth.field.name")}</Label>
              <Input id="name" name="name" autoComplete="name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{t("auth.field.email")}</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t("auth.field.passwordMin")}</Label>
              <Input
                id="password"
                name="password"
                type="password"
                minLength={8}
                autoComplete="new-password"
                required
              />
            </div>
            <label className="flex items-start gap-2 text-xs text-muted-foreground">
              <input type="checkbox" name="consent" required className="mt-0.5 size-4 shrink-0" />
              <span>
                {t("auth.consent.pre")}{" "}
                <Link href="/legal/terms" className="hover:underline">
                  {t("legal.terms")}
                </Link>{" "}
                {t("auth.consent.mid")}{" "}
                <Link href="/legal/privacy" className="hover:underline">
                  {t("legal.privacyPolicy")}
                </Link>
                .
              </span>
            </label>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t("auth.submit.registerLoading") : t("auth.submit.register")}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            {t("auth.haveAccount")}{" "}
            <Link href="/login" className="text-primary hover:underline">
              {t("auth.toLogin")}
            </Link>
          </p>
        </CardContent>
      </Card>
    </AuthScreen>
  );
}
