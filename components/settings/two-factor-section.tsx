"use client";

import { ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n/context";
import { isLocalDesktopMode } from "@/lib/platform/env";

type SetupData = { qr: string; secret: string };

// Two-factor (TOTP) management for web accounts. Web-only — the desktop app is a
// single local profile with no login.
export function TwoFactorSection() {
  if (isLocalDesktopMode) return null;
  return <TwoFactorSectionInner />;
}

function TwoFactorSectionInner() {
  const { t } = useI18n();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [setup, setSetup] = useState<SetupData | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/account/2fa")
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((d) => {
        if (!cancelled) setEnabled(Boolean(d.enabled));
      })
      .catch(() => {
        if (!cancelled) setEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function post(body: Record<string, unknown>) {
    const res = await fetch("/api/account/2fa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) throw new Error(data?.error ?? t("set.2fa.error"));
    return data;
  }

  async function startSetup() {
    setBusy(true);
    try {
      const d = (await post({ action: "setup" })) as unknown as SetupData;
      setSetup({ qr: d.qr, secret: d.secret });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("set.2fa.error"));
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnable() {
    setBusy(true);
    try {
      await post({ action: "enable", code: code.trim() });
      setEnabled(true);
      setSetup(null);
      setCode("");
      toast.success(t("set.2fa.toast.enabled"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("set.2fa.error"));
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      await post({ action: "disable", password });
      setEnabled(false);
      setPassword("");
      toast.success(t("set.2fa.toast.disabled"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("set.2fa.error"));
    } finally {
      setBusy(false);
    }
  }

  if (enabled === null) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-4" />
          {t("set.2fa.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{t("set.2fa.desc")}</p>

        {enabled ? (
          <div className="space-y-3">
            <p className="text-sm font-medium text-success-foreground">{t("set.2fa.on")}</p>
            <div className="space-y-2">
              <Label htmlFor="twofa-password">{t("set.2fa.disablePassword")}</Label>
              <Input
                id="twofa-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button
              variant="destructive"
              disabled={busy || !password}
              onClick={() => void disable()}
            >
              {t("set.2fa.disable")}
            </Button>
          </div>
        ) : setup ? (
          <div className="space-y-3">
            <p className="text-sm">{t("set.2fa.scan")}</p>
            {/* eslint-disable-next-line @next/next/no-img-element -- data: URL QR, no remote image */}
            <img src={setup.qr} alt="" className="size-44 rounded-lg border bg-white p-2" />
            <p className="text-xs text-muted-foreground">
              {t("set.2fa.manualKey")}:{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono">{setup.secret}</code>
            </p>
            <div className="space-y-2">
              <Label htmlFor="twofa-code">{t("set.2fa.code")}</Label>
              <Input
                id="twofa-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button
                disabled={busy || code.trim().length < 6}
                onClick={() => void confirmEnable()}
              >
                {t("set.2fa.confirm")}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setSetup(null);
                  setCode("");
                }}
              >
                {t("common.cancel")}
              </Button>
            </div>
          </div>
        ) : (
          <Button disabled={busy} onClick={() => void startSetup()}>
            {t("set.2fa.enable")}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
