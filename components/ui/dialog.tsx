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

/**
 * Появлялась ли клавиатура, пока окно открыто.
 *
 * Считается по высоте видимой части: клавиатура телефона отнимает у неё
 * заметно больше пятой части. Раз появившись, ответ остаётся «да» до закрытия
 * окна — компонент живёт ровно столько, сколько окно открыто.
 */
function useKeyboardSeen(): boolean {
  const [seen, setSeen] = React.useState(false);
  React.useEffect(() => {
    const height = () => window.visualViewport?.height ?? window.innerHeight;
    const start = height();
    const check = () => {
      if (height() < start * 0.8) setSeen(true);
    };
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", check);
    window.addEventListener("resize", check);
    return () => {
      viewport?.removeEventListener("resize", check);
      window.removeEventListener("resize", check);
    };
  }, []);
  return seen;
}

/**
 * Слой, который ставит окно по центру.
 *
 * Flexbox, а не `left-1/2` с translate: translate попадает в середину только
 * пока containing block фиксированного — это вьюпорт; любой предок с
 * transform, filter или zoom его сдвигает, и одно окно на ПК из-за этого
 * стояло в углу. Сам слой пропускает касания насквозь — закрыть окно нажатием
 * мимо него можно по-прежнему.
 *
 * ПО ЦЕНТРУ — ПОКА НЕТ КЛАВИАТУРЫ. Середина окна зависит от его высоты, а
 * высоту меняет клавиатура. Человек вводил сумму, касался «Категории» — поле
 * теряло фокус, клавиатура уходила, окно вырастало, и диалог по центру
 * съезжал вниз на полклавиатуры: касание приходило уже мимо кнопки, и
 * нажимать приходилось дважды. Раньше поэтому окна на телефоне всегда стояли у
 * верха — владелец справедливо счёл это некрасивым. Теперь окно стоит по
 * центру, а как только появилась клавиатура — встаёт к верху и остаётся там,
 * пока открыто: когда клавиатура уходит, двигаться ему уже некуда.
 * Стерегут e2e/quick-add-touch.spec.ts и e2e/dialog-center.spec.ts.
 */
function CenteringLayer({ children }: { children: React.ReactNode }) {
  const keyboard = useKeyboardSeen();
  return (
    <div
      data-keyboard={keyboard ? "" : undefined}
      className={cn(
        "pointer-events-none fixed inset-0 z-50 flex justify-center p-4",
        keyboard
          ? "items-start pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]"
          : "items-center pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]"
      )}
    >
      {children}
    </div>
  );
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, onEscapeKeyDown, ...props }, ref) => {
  const { t } = useI18n();
  const node = React.useRef<HTMLDivElement | null>(null);
  const setNode = React.useCallback(
    (element: HTMLDivElement | null) => {
      node.current = element;
      if (typeof ref === "function") ref(element);
      else if (ref) ref.current = element;
    },
    [ref]
  );
  return (
    <DialogPortal>
      <DialogOverlay />
      <CenteringLayer>
        <DialogPrimitive.Content
          ref={setNode}
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
            //
            // Сам предел — `dialog-max-h` (app/globals.css): экран минус поля
            // слоя, а поля не меньше системных панелей телефона. С пределом
            // «экран минус 2rem» окно у верха уходило низом под кнопки
            // навигации Android, и «Отмену» было не нажать.
            "dialog-max-h pointer-events-auto relative grid w-full max-w-lg gap-4 overflow-y-auto overscroll-contain rounded-lg bg-card p-6 shadow-soft-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            className
          )}
          {...props}
          // Escape закрывает только тот диалог, в котором его нажали.
          //
          // Калькулятор открывается диалогом ПОВЕРХ формы операции. Radix
          // решает, кому закрываться, по тому, какой слой верхний, — а слои
          // регистрируются и снимаются в эффектах. На медленной машине Escape
          // успевал проскочить между ними: закрывался калькулятор, а следом —
          // и форма под ним, с уже набранной суммой. Элемент, на котором нажали
          // клавишу, от этих эффектов не зависит: он внутри одного диалога, и
          // остальные клавишу пропускают. Стережёт e2e/calculator.spec.ts.
          onEscapeKeyDown={(event) => {
            onEscapeKeyDown?.(event);
            if (event.defaultPrevented) return;
            const target = event.target;
            const owner = target instanceof Element ? target.closest('[role="dialog"]') : null;
            if (owner && owner !== node.current) event.preventDefault();
          }}
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
      </CenteringLayer>
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
