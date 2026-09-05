"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/45 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => {
  const { t } = useI18n();
  return (
    <DialogPortal>
      <DialogOverlay />
      {/* A layer that centres by flexbox rather than by `left-1/2` plus a
          translate. The translate trick only lands in the middle while the
          fixed containing block IS the viewport — any transformed, filtered or
          zoomed ancestor moves it, and one desktop window showed the dialog
          sitting off in a corner because of exactly that. The layer itself
          passes clicks through, so closing by clicking outside still works. */}
      <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
        <DialogPrimitive.Content
          ref={ref}
          className={cn(
            // A dialog taller than the screen used to overflow in BOTH
            // directions, putting its heading and its save button out of reach
            // on a phone. Cap the height and scroll inside instead.
            //
            // Слой выше не прокручивается, поэтому этот предел — единственное,
            // что держит диалог в экране, и переопределять его с места вызова
            // нельзя: cn() — это twMerge, и любой свой max-h-* или overflow-*
            // СТИРАЕТ написанное здесь. Так командная строка осталась без
            // прокрутки и обрезала 75 px наглухо. Стережёт tests/dialog-fits.test.ts.
            "pointer-events-auto relative grid max-h-[calc(100svh-2rem)] w-full max-w-lg gap-4 overflow-y-auto overscroll-contain rounded-lg bg-card p-6 shadow-soft-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            className
          )}
          {...props}
        >
          {children}
          {/* Крестик рисуется маленьким, а нажимается большим: отрицательный
              внешний отступ гасит собственные поля, так что иконка остаётся на
              прежнем месте, а площадь под палец растёт наружу. */}
          <DialogPrimitive.Close className="tap-target absolute right-4 top-4 -m-2 rounded-sm p-2 opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring">
            <X className="size-4" />
            <span className="sr-only">{t("common.close")}</span>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </div>
    </DialogPortal>
  );
});
DialogContent.displayName = DialogPrimitive.Content.displayName;

// Правое поле — под крестик: он лежит absolute поверх содержимого, и без
// зарезервированного места первая строка заголовка уходила под него. Заголовки
// здесь подставные («Пополнить: {цель}»), длину не угадать.
const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1.5 pr-8 text-left", className)} {...props} />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    // leading-tight, а не leading-none: на узком экране заголовок с подставленным
    // именем переносится на две строки, и при нулевом межстрочном они слипались.
    className={cn("text-lg font-semibold leading-tight", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription
};
