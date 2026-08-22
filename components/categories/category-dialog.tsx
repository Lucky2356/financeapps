"use client";

import type { FormEvent } from "react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { CategoryIcon } from "@/components/category-icon";
import { DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CATEGORY_COLOR_GROUPS, DEFAULT_CATEGORY_COLOR } from "@/lib/categories/palette";
import { DEFAULT_CATEGORY_ICON, ICON_GROUPS } from "@/lib/categories/icons";
import { suggestIconForName } from "@/lib/categories/suggest-icon";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import type { CategoryRow } from "@/types/finance";

// Shared create/edit form for a category. Lives in its own file so both the
// Categories page and the Limits page (where limits are set per category) can
// offer the same dialog.
export function CategoryDialog({
  title,
  category,
  defaultKind,
  onSubmit
}: {
  title: string;
  category?: CategoryRow;
  defaultKind: "INCOME" | "EXPENSE";
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(category?.name ?? "");
  const [selectedColor, setSelectedColor] = useState(category?.color ?? DEFAULT_CATEGORY_COLOR);
  const [selectedIcon, setSelectedIcon] = useState(category?.icon ?? DEFAULT_CATEGORY_ICON);
  // Until the owner picks a picture themselves, the name chooses it: typing
  // "Продукты" puts the trolley there without a trip through fourteen groups.
  // One tap on any icon ends that for good — a deliberate choice is never
  // overwritten by the next keystroke.
  const [pickedByHand, setPickedByHand] = useState(
    Boolean(category?.icon) && category?.icon !== DEFAULT_CATEGORY_ICON
  );

  function rename(next: string) {
    setName(next);
    if (pickedByHand) return;
    const suggestion = suggestIconForName(next);
    setSelectedIcon(suggestion ?? DEFAULT_CATEGORY_ICON);
  }

  function pickIcon(icon: string) {
    setPickedByHand(true);
    setSelectedIcon(icon);
  }
  const [isEssential, setIsEssential] = useState(category?.isEssential ?? false);
  const [isSubscription, setIsSubscription] = useState(category?.isSubscription ?? false);

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      <form onSubmit={onSubmit} className="grid gap-4">
        {category ? <input type="hidden" name="id" value={category.id} /> : null}
        <input type="hidden" name="kind" value={defaultKind} />
        <input type="hidden" name="color" value={selectedColor} />
        <input type="hidden" name="icon" value={selectedIcon} />
        <input type="hidden" name="isEssential" value={String(isEssential)} />
        <input type="hidden" name="isSubscription" value={String(isSubscription)} />

        <div className="space-y-2">
          <Label>{t("common.name")}</Label>
          <Input
            name="name"
            value={name}
            onChange={(event) => rename(event.target.value)}
            minLength={2}
            maxLength={80}
            required
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label>{t("cat.icon")}</Label>
            <span
              className="flex size-6 items-center justify-center rounded-full text-white"
              style={{ backgroundColor: selectedColor }}
            >
              <CategoryIcon name={selectedIcon} className="size-3.5" />
            </span>
          </div>
          {/* Grouped the way the owner would look for one — "the present box"
              under gifts, not under geometry. The box scrolls so the rest of
              the form stays reachable. */}
          <div className="max-h-52 space-y-3 overflow-y-auto rounded-md border p-3">
            {ICON_GROUPS.map((group) => (
              <div key={group.id} className="space-y-1.5">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t(group.labelKey)}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {group.icons.map((icon) => (
                    <button
                      key={`${group.id}-${icon}`}
                      type="button"
                      aria-label={icon}
                      aria-pressed={selectedIcon === icon}
                      onClick={() => pickIcon(icon)}
                      className={cn(
                        "flex size-8 items-center justify-center rounded-md border transition-colors",
                        selectedIcon === icon
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-transparent bg-muted/40 text-muted-foreground hover:bg-muted"
                      )}
                    >
                      <CategoryIcon name={icon} className="size-4" />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>{t("cat.color")}</Label>
          {/* Three blocks instead of one long wrap: the app's own colours, then
              the wheel a row per hue, then the greys. The wheel starts at red
              and walks round, so a colour is found by aiming rather than by
              scrolling past a hundred swatches. */}
          <div className="max-h-52 space-y-3 overflow-y-auto rounded-md border p-3">
            {CATEGORY_COLOR_GROUPS.map((group) => (
              <div key={group.id} className="space-y-1.5">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t(group.labelKey)}
                </p>
                <div
                  className={
                    group.columns ? "grid justify-items-center gap-1" : "flex flex-wrap gap-1.5"
                  }
                  style={
                    group.columns
                      ? { gridTemplateColumns: `repeat(${group.columns}, minmax(0, 1fr))` }
                      : undefined
                  }
                >
                  {group.colors.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className="size-6 rounded-full border-2 transition-transform hover:scale-110"
                      style={{
                        backgroundColor: color,
                        borderColor:
                          selectedColor === color ? "hsl(var(--foreground))" : "transparent"
                      }}
                      onClick={() => setSelectedColor(color)}
                      aria-label={t("cat.colorAria", { color })}
                      aria-pressed={selectedColor === color}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span
              className="inline-block size-4 rounded-full border"
              style={{ backgroundColor: selectedColor }}
            />
            <span>{selectedColor}</span>
          </div>
        </div>

        {defaultKind === "EXPENSE" && (
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 rounded border accent-primary"
              checked={isEssential}
              onChange={(e) => setIsEssential(e.target.checked)}
            />
            <span>{t("cat.essentialFull")}</span>
          </label>
        )}

        {defaultKind === "EXPENSE" && (
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 rounded border accent-primary"
              checked={isSubscription}
              onChange={(e) => setIsSubscription(e.target.checked)}
            />
            <span>{t("cat.subscriptionFull")}</span>
          </label>
        )}

        <DialogFooter>
          <Button type="submit">{t("common.save")}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
