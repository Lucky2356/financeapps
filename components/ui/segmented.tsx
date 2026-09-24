"use client";

// Выбор одного из нескольких — одной строкой.
//
// Заменил в настройках плитки высотой в палец: три плитки темы занимали
// полэкрана телефона ради выбора из трёх слов. Здесь те же три слова в одной
// строке, а выбранное отмечено подложкой, которая переезжает к нему, — глазу
// видно, ЧТО поменялось, а не только что поменялось.
//
// Внутри — настоящие радиокнопки: стрелки с клавиатуры, объявление состояния
// программой чтения с экрана и участие в форме достаются даром.

import { useId, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
  icon?: ReactNode;
};

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className
}: {
  value: T;
  options: ReadonlyArray<SegmentedOption<T>>;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  const name = useId();
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value)
  );

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn("relative grid rounded-lg bg-muted p-1", className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {/* Подложка выбранного. Ездит сдвигом на свою же ширину: сколько бы ни
          было вариантов, шаг всегда равен одному. */}
      <span
        aria-hidden
        className="absolute inset-y-1 left-1 rounded-md bg-card shadow-sm ring-1 ring-border/60 transition-transform duration-200 ease-out motion-reduce:transition-none"
        style={{
          width: `calc((100% - 0.5rem) / ${options.length})`,
          transform: `translateX(${index * 100}%)`
        }}
      />
      {options.map((option) => {
        const checked = option.value === value;
        return (
          <label
            key={option.value}
            className={cn(
              "relative z-10 flex min-h-9 cursor-pointer items-center justify-center gap-1.5 rounded-md px-2 text-sm transition-colors",
              "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
              checked
                ? "font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={checked}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {/* Значок — только там, где ему есть место: на телефоне три
                значка съедали ширину, и слова обрезались до «Систе…». */}
            {option.icon ? (
              <span className="hidden shrink-0 sm:inline-flex">{option.icon}</span>
            ) : null}
            <span className="truncate">{option.label}</span>
          </label>
        );
      })}
    </div>
  );
}
