"use client";

import { Check, ChevronDown, Edit2, Plus, Trash2, User } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { apiClient } from "@/lib/api/client";
import { isLocalDesktopMode } from "@/lib/platform/env";
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

export function ProfileSwitcher() {
  // Only show in desktop-local mode
  if (!isLocalDesktopMode) {
    return null;
  }

  return <ProfileSwitcherInner />;
}

function ProfileSwitcherInner() {
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

  if (!list) return null;

  const active = list.profiles.find((p) => p.id === list.activeProfileId) ?? list.profiles[0];
  if (!active) return null;

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
    <div className="mx-3 mb-2 mt-3">
      {/* Trigger — compact button, no overflow issues */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-2.5 rounded-lg border bg-muted/30 px-3 py-2 text-sm transition-colors hover:bg-muted/50"
          >
            <span
              className="flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
              style={{ backgroundColor: active.color }}
            >
              {active.name.charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1 truncate text-left font-medium">{active.name}</span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
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
