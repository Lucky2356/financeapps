"use client";

import { HelpCircle } from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { clamp, cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/context";

// Plain-language explanations for finance terms used across the app. Keys are the
// Russian metric titles (also used to look up by `metric.title`); values are
// catalog keys so the hint text follows the user's locale.
export const FINANCE_TERM_HINTS: Record<string, string> = {
  "Чистый капитал": "hint.netWorth",
  "Общий баланс": "hint.totalBalance",
  "Свободный остаток": "hint.freeCash",
  "Норма накоплений": "hint.savingsRate",
  "Финансовая подушка": "hint.cushion",
  "Риск-профиль": "hint.riskProfile"
};

// Locale-independent lookup by a metric's stable `key` (see MetricCard.key) →
// catalog key. Used by the metric cards so hints also appear in English, where
// the display title no longer matches the Russian keys above.
export const METRIC_HINT_KEY: Record<string, string> = {
  netWorth: "hint.netWorth",
  totalBalance: "hint.totalBalance",
  freeCash: "hint.freeCash",
  savingsRate: "hint.savingsRate",
  emergencyFund: "hint.cushion"
};

// Lightweight "?" hint with a click-to-open popover. No external popover/tooltip
// dependency — closes on outside click or Escape. Used to explain finance terms.
export function InfoHint({ text, className }: { text: string; className?: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({
    left: 0,
    placement: "bottom" as "bottom" | "top",
    ready: false,
    top: 0,
    width: 280
  });
  const tooltipId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);

  const updatePosition = useCallback(() => {
    const button = buttonRef.current;
    const tooltip = tooltipRef.current;
    if (!button || !tooltip) return;

    const edgePadding = 12;
    const gap = 8;
    const preferredWidth = 280;
    const rect = button.getBoundingClientRect();
    const width = Math.min(preferredWidth, Math.max(180, window.innerWidth - edgePadding * 2));
    const tooltipHeight = tooltip.offsetHeight || 96;
    const belowTop = rect.bottom + gap;
    const aboveTop = rect.top - tooltipHeight - gap;
    const canFitBelow = belowTop + tooltipHeight + edgePadding <= window.innerHeight;
    const placement = canFitBelow || aboveTop < edgePadding ? "bottom" : "top";
    const top =
      placement === "bottom"
        ? clamp(
            belowTop,
            edgePadding,
            Math.max(edgePadding, window.innerHeight - tooltipHeight - edgePadding)
          )
        : Math.max(edgePadding, aboveTop);
    const left = clamp(
      rect.left + rect.width / 2 - width / 2,
      edgePadding,
      Math.max(edgePadding, window.innerWidth - width - edgePadding)
    );

    setPosition({ left, placement, ready: true, top, width });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;

    updatePosition();
    const frame = window.requestAnimationFrame(updatePosition);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || tooltipRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggleHint() {
    if (!open) setPosition((current) => ({ ...current, ready: false }));
    setOpen((value) => !value);
  }

  return (
    <span className={cn("inline-flex align-middle", className)}>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleHint}
        className="text-muted-foreground transition-colors hover:text-foreground"
        aria-label={t("hint.aria")}
        aria-describedby={open ? tooltipId : undefined}
        aria-expanded={open}
      >
        <HelpCircle className="size-3.5" />
      </button>
      {open
        ? createPortal(
            <span
              ref={tooltipRef}
              id={tooltipId}
              role="tooltip"
              className="fixed z-[100] rounded-md border bg-popover p-3 text-left text-xs font-normal leading-relaxed text-popover-foreground shadow-lg"
              data-placement={position.placement}
              style={{
                left: position.left,
                top: position.top,
                visibility: position.ready ? "visible" : "hidden",
                width: position.width
              }}
            >
              {t(text)}
            </span>,
            document.body
          )
        : null}
    </span>
  );
}
