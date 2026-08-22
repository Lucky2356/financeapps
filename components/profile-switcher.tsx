"use client";

import { Check, CircleDollarSign, Edit2, Plus, Trash2, User } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { apiClient } from "@/lib/api/client";
import type { ProfileList, UserProfile } from "@/types/profiles";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { APP_NAME } from "@/lib/constants";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

const PROFILE_COLORS = [
  "#0d9488",
  "#2563eb",
  "#7c3aed",
  "#db2777",
  "#ea580c",
  "#16a34a",
  "#0891b2",
  "#ca8a04"
];

/**
 * The app's mark in the corner of the sidebar, which is also the way profiles
 * are switched.
 *
 * There used to be a row of its own under the logo carrying a coloured circle
 * and the profile name — two badges stacked on top of each other, one of them
 * a control and one of them decoration. The mark is the control now; whose
 * data is open is written under the app's name, where the subtitle was.
 *
 * `compact` is the collapsed sidebar: the tile alone, no words.
 */
export function ProfileSwitcher({ compact = false }: { compact?: boolean }) {
  return <ProfileSwitcherInner compact={compact} />;
}

/** The tile itself — the same one whether profiles loaded or not. */
function Logo({ color }: { color?: string }) {
  return (
    <span className="relative flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-sidebar-accent text-white shadow-sm">
      <CircleDollarSign className="size-[18px]" />
      {/* Whose data is open, as a dot on the mark — visible even when the
          sidebar is collapsed to icons. */}
      {color ? (
        <span
          className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-card"
          style={{ backgroundColor: color }}
        />
      ) : null}
    </span>
  );
}

function ProfileSwitcherInner({ compact }: { compact: boolean }) {
  const [list, setList] = useState<ProfileList | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState<UserProfile | null>(null);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PROFILE_COLORS[0]);
  const confirm = useConfirm();
  const { t } = useI18n();

  async function loadProfiles() {
    try {
      const data = await apiClient.get<ProfileList>("/profiles");
      setList(data);
    } catch {
      // web mode — profiles endpoint not available, silently ignore
    }
  }

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<ProfileList>("/profiles")
      .then((data) => {
        if (!cancelled) setList(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const active = list?.profiles.find((p) => p.id === list.activeProfileId) ?? list?.profiles[0];
  // Profiles come from the local API; in a build without it the sidebar still
  // needs its head, so the mark is drawn plain and does nothing.
  if (!list || !active) {
    return (
      <div className={compact ? "flex justify-center" : "flex min-w-0 flex-1 items-center gap-3"}>
        <Logo />
        {compact ? null : <AppTitle />}
      </div>
    );
  }

  async function switchTo(profileId: string) {
    try {
      await apiClient.post("/profiles/switch", { profileId });
      window.location.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("prof.switchFail"));
    }
  }

  async function createProfile() {
    if (!newName.trim()) return;
    try {
      await apiClient.post("/profiles/create", { name: newName, color: newColor });
      toast.success(t("prof.created", { name: newName }));
      setCreateOpen(false);
      setNewName("");
      await loadProfiles();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("prof.createFail"));
    }
  }

  async function renameProfile() {
    if (!renameOpen || !newName.trim()) return;
    try {
      await apiClient.post("/profiles/rename", { profileId: renameOpen.id, name: newName });
      toast.success(t("prof.renamed"));
      setRenameOpen(null);
      setNewName("");
      await loadProfiles();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("prof.renameFail"));
    }
  }

  async function deleteProfile(profileId: string) {
    const confirmed = await confirm({
      title: t("prof.deleteConfirmTitle"),
      description: t("prof.deleteConfirmDesc"),
      confirmLabel: t("common.delete"),
      destructive: true
    });
    if (!confirmed) return;
    try {
      await apiClient.delete(`/profiles?id=${encodeURIComponent(profileId)}`);
      toast.success(t("prof.deleted"));
      if (profileId === list?.activeProfileId) {
        window.location.reload();
      } else {
        await loadProfiles();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("prof.deleteFail"));
    }
  }

  return (
    <div className={compact ? "flex justify-center" : "flex min-w-0 flex-1"}>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger asChild>
          <button
            type="button"
            title={`${t("prof.title")}: ${active.name}`}
            className={cn(
              "flex items-center rounded-lg text-left transition-colors hover:bg-muted/50",
              compact ? "justify-center p-1" : "min-w-0 flex-1 gap-2.5 p-1"
            )}
          >
            <Logo color={active.color} />
            {compact ? (
              <span className="sr-only">{active.name}</span>
            ) : (
              <AppTitle profile={active.name} />
            )}
          </button>
        </DialogTrigger>

        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("prof.title")}</DialogTitle>
          </DialogHeader>

          <div className="space-y-1">
            {list.profiles.map((profile) => (
              <div key={profile.id} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    void switchTo(profile.id);
                  }}
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-muted/50",
                    profile.id === list.activeProfileId && "bg-primary/10 font-semibold"
                  )}
                >
                  <span
                    className="flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                    style={{ backgroundColor: profile.color }}
                  >
                    {profile.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{profile.name}</span>
                  {profile.id === list.activeProfileId && (
                    <Check className="size-4 shrink-0 text-primary" />
                  )}
                </button>
                <button
                  type="button"
                  aria-label={t("prof.rename")}
                  onClick={() => {
                    setRenameOpen(profile);
                    setNewName(profile.name);
                  }}
                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Edit2 className="size-3.5" />
                </button>
                {list.profiles.length > 1 && (
                  <button
                    type="button"
                    aria-label={t("prof.delete")}
                    onClick={() => {
                      void deleteProfile(profile.id);
                    }}
                    className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="border-t pt-3">
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                >
                  <Plus className="size-4" />
                  {t("prof.add")}
                </button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("prof.new")}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4">
                  <div className="space-y-2">
                    <Label>{t("prof.name")}</Label>
                    <Input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder={t("prof.namePlaceholder")}
                      maxLength={40}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("prof.color")}</Label>
                    <div className="flex flex-wrap gap-2">
                      {PROFILE_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setNewColor(c)}
                          className={cn(
                            "size-8 rounded-full transition-all hover:scale-110",
                            newColor === c && "ring-2 ring-offset-2 ring-foreground"
                          )}
                          style={{ backgroundColor: c }}
                          aria-label={t("prof.colorAria", { color: c })}
                        />
                      ))}
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={createProfile} disabled={!newName.trim()}>
                    <User className="size-4" />
                    {t("prof.create")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </DialogContent>
      </Dialog>

      {/* Rename dialog */}
      <Dialog
        open={Boolean(renameOpen)}
        onOpenChange={(v) => {
          if (!v) setRenameOpen(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("prof.rename")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>{t("prof.newName")}</Label>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={40} />
          </div>
          <DialogFooter>
            <Button onClick={renameProfile} disabled={!newName.trim()}>
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * The app's name and, under it, whose data is open. The name is allowed two
 * lines: at the sidebar's width "Финансовый помощник" was cut to "Финансовый
 * пом…" on a single one.
 */
function AppTitle({ profile }: { profile?: string }) {
  const { t } = useI18n();
  return (
    <span className="min-w-0">
      <span className="block text-[13px] font-semibold leading-tight text-foreground">
        {APP_NAME}
      </span>
      <span className="block truncate text-[11px] text-muted-foreground">
        {profile ?? t("shell.subtitle")}
      </span>
    </span>
  );
}
