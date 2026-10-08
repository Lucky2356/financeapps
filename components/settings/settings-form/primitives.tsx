"use client";

import { Check, Loader2 } from "lucide-react";
import { useId } from "react";

import { InfoHint } from "@/components/info-hint";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

import type { Section } from "@/components/settings/settings-form/model";

/**
 * Один раздел: заголовок, строка «о чём он», и его группы.
 *
 * Появляется мягко — коротким проявлением со сдвигом на пару пикселей, чтобы
 * смена раздела читалась как смена, а не как мигание. Кто просил систему не
 * двигать ничего, получает раздел сразу.
 */
export function SectionView({ section, status }: { section: Section; status: React.ReactNode }) {
  return (
    <section
      id={`set-${section.id}`}
      aria-labelledby={`set-${section.id}-title`}
      className="space-y-5 duration-200 animate-in fade-in-0 slide-in-from-bottom-1 motion-reduce:animate-none"
    >
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
        <div className="min-w-0 space-y-1">
          <h2 id={`set-${section.id}-title`} className="text-xl font-semibold tracking-tight">
            {section.label}
          </h2>
          <p className="text-sm text-muted-foreground">{section.lead}</p>
        </div>
        {status}
      </header>
      <div className="space-y-5">{section.node}</div>
    </section>
  );
}

/** «Сохраняю…» / «Сохранено» — справа от заголовка открытого раздела. */
export function SaveStatus({ status }: { status: "idle" | "saving" | "saved" }) {
  const { t } = useI18n();
  return (
    <div className="flex h-5 items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
      {status === "saving" ? (
        <>
          <Loader2 className="size-3.5 animate-spin" />
          {t("set.saving")}
        </>
      ) : status === "saved" ? (
        <>
          <Check className="size-3.5 text-success" />
          <span className="text-success">{t("set.saved")}</span>
        </>
      ) : null}
    </div>
  );
}

/**
 * Группа строк под маленьким заголовком — как в настройках телефона.
 *
 * Одна рамка на группу, строки внутри разделены волоском. Рамка означает
 * «отдельный предмет», и когда ею обведено всё подряд — карточка раздела,
 * коробка поля, сам список, — она не означает уже ничего.
 */
export function Group({
  title,
  danger,
  children
}: {
  title?: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      {title ? (
        <h3
          className={cn(
            "px-1 text-xs font-medium uppercase tracking-wider",
            danger ? "text-destructive" : "text-muted-foreground"
          )}
        >
          {title}
        </h3>
      ) : null}
      <div
        className={cn(
          "divide-y divide-border/60 overflow-hidden rounded-xl border bg-card",
          danger && "border-destructive/40"
        )}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Одна настройка: слева — как она называется, «?» с объяснением простыми
 * словами и короткая строка под названием; справа — чем её меняют.
 *
 * «?» — не повтор строки под названием. Строка говорит, ЧТО делает настройка;
 * вопросик — ЗАЧЕМ она и что будет, если её тронуть. Первое нужно каждому,
 * второе — тому, кто сомневается, и незачем показывать его всем.
 *
 * `block` — для широкого управления (поле ключа): под подписью оно читается
 * лучше, чем ужатое в правую колонку.
 */
export function SettingRow({
  label,
  hint,
  help,
  htmlFor,
  block,
  children
}: {
  label: React.ReactNode;
  hint?: string;
  help?: string;
  htmlFor?: string;
  block?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "gap-x-8 gap-y-3 px-4 py-4 sm:px-5",
        block ? "space-y-3" : "sm:flex sm:items-center sm:justify-between"
      )}
    >
      <div className={cn("min-w-0 space-y-1", block ? undefined : "sm:max-w-md")}>
        <div className="flex items-center gap-1.5">
          <Label htmlFor={htmlFor} className="text-sm font-medium">
            {label}
          </Label>
          {help ? <InfoHint text={help} /> : null}
        </div>
        {hint ? <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p> : null}
      </div>
      <div className={cn("min-w-0", block ? "space-y-2" : "mt-3 sm:mt-0 sm:w-[22rem] sm:shrink-0")}>
        {children}
      </div>
    </div>
  );
}

// A setting that is chosen from a list: a label, a select, the options, and a
// line of explanation. One component, so the call sites carry only what
// actually differs.
export function SelectField({
  id,
  label,
  value,
  onValueChange,
  hint,
  help,
  children
}: {
  id?: string;
  label: React.ReactNode;
  value: string;
  onValueChange: (value: string) => void;
  hint?: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <SettingRow label={label} hint={hint} help={help} htmlFor={id}>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>{children}</SelectContent>
      </Select>
    </SettingRow>
  );
}

/**
 * Строка-переключатель.
 *
 * Нажимаются и название, и строка под ним, а не только квадратик в дальнем
 * углу: на телефоне до квадратика ещё надо дотянуться. Вопросик стоит вне
 * подписей — нажатие на него открывает объяснение и не щёлкает переключателем.
 */
export function ToggleRow({
  title,
  description,
  help,
  checked,
  onChange,
  disabled
}: {
  title: string;
  description: string;
  help?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-6 px-4 py-4 transition-colors hover:bg-muted/30 sm:px-5">
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-1.5">
          <label htmlFor={id} className="cursor-pointer text-sm font-medium">
            {title}
          </label>
          {help ? <InfoHint text={help} /> : null}
        </div>
        <label
          htmlFor={id}
          className="block cursor-pointer text-xs leading-relaxed text-muted-foreground"
        >
          {description}
        </label>
      </div>
      <Switch
        id={id}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        aria-label={title}
      />
    </div>
  );
}
