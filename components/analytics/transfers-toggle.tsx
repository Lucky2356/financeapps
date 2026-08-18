"use client";

import { useI18n } from "@/lib/i18n/context";

// One checkbox, the same wording everywhere it appears. A transfer moves money
// between your own accounts: nothing is earned and nothing is spent, so it is
// left out of the totals unless you ask for it.
export function TransfersToggle({
  checked,
  onChange
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  const { t } = useI18n();
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
      <input
        type="checkbox"
        className="size-4 rounded border accent-primary"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        data-testid="transfers-toggle"
      />
      <span>{t("an.includeTransfers")}</span>
    </label>
  );
}
