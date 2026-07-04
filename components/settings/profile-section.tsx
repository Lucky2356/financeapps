"use client";

import { Loader2, UserRound } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n/context";
import { isLocalDesktopMode } from "@/lib/platform/env";

type Profile = { name: string; email: string; createdAt: string };

// Account profile for web users: view email / join date and edit display name.
// Web-only (desktop has no auth / on-device data).
export function ProfileSection() {
  if (isLocalDesktopMode) return null;
  return <ProfileSectionInner />;
}

function ProfileSectionInner() {
  const { t, locale } = useI18n();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/account/profile")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: Profile) => {
        if (cancelled) return;
        setProfile(data);
        setName(data.name);
      })
      .catch(() => {
        /* not signed in / unavailable — section stays empty */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error(t("set.profile.nameRequired"));
      return;
    }
    if (trimmed === profile?.name) return;
    setSaving(true);
    try {
      const res = await fetch("/api/account/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed })
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? t("set.profile.saveFail"));
      }
      const updated = (await res.json()) as Profile;
      setProfile(updated);
      setName(updated.name);
      toast.success(t("set.profile.saved"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("set.profile.saveFail"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserRound className="size-4" />
            {t("set.profile.title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!profile) return null;

  const joined = new Date(profile.createdAt).toLocaleDateString(
    locale === "en" ? "en-US" : "ru-RU",
    {
      year: "numeric",
      month: "long",
      day: "numeric"
    }
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserRound className="size-4" />
          {t("set.profile.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <form onSubmit={save} className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="profile-name">{t("set.profile.name")}</Label>
            <Input
              id="profile-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
              autoComplete="name"
            />
            <p className="text-xs text-muted-foreground">{t("set.profile.name.hint")}</p>
          </div>
          <Button type="submit" disabled={saving || name.trim() === profile.name}>
            {saving ? t("set.saving") : t("set.profile.save")}
          </Button>
        </form>

        <div className="grid gap-3 rounded-lg border bg-muted/20 p-4 sm:grid-cols-2">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t("set.profile.email")}</p>
            <p className="text-sm font-medium">{profile.email}</p>
            <p className="text-xs text-muted-foreground">{t("set.profile.email.hint")}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t("set.profile.joined")}</p>
            <p className="text-sm font-medium">{joined}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
