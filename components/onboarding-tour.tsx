"use client";

import {
  BarChart3,
  CalendarClock,
  CircleDollarSign,
  Command,
  Download,
  PiggyBank,
  Sparkles,
  Wallet
} from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { apiClient } from "@/lib/api/client";
import { isLocalDesktopMode } from "@/lib/platform/env";
import { isPublicPath } from "@/lib/public-paths";
import { useI18n } from "@/lib/i18n/context";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { ONBOARDING_REPLAY_EVENT, ONBOARDING_STORAGE_KEY } from "@/lib/onboarding";

const STEPS = [
  { icon: CircleDollarSign, titleKey: "ob.step0.title", descKey: "ob.step0.descWeb" },
  { icon: Wallet, titleKey: "ob.step1.title", descKey: "ob.step1.desc" },
  { icon: CircleDollarSign, titleKey: "ob.step2.title", descKey: "ob.step2.desc" },
  { icon: BarChart3, titleKey: "ob.step3.title", descKey: "ob.step3.desc" },
  { icon: PiggyBank, titleKey: "ob.step4.title", descKey: "ob.step4.desc" },
  { icon: Download, titleKey: "ob.step5.title", descKey: "ob.step5.desc" },
  { icon: CalendarClock, titleKey: "ob.forecast.title", descKey: "ob.forecast.desc" },
  { icon: Command, titleKey: "ob.step6.title", descKey: "ob.step6.desc" }
];

export function OnboardingTour() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [loadingSample, setLoadingSample] = useState(false);
  const pathname = usePathname();

  async function loadSample() {
    setLoadingSample(true);
    try {
      await apiClient.post("/sample", {});
      markDone();
      window.location.reload();
    } catch (error) {
      setLoadingSample(false);
      toast.error(error instanceof Error ? error.message : t("ob.sampleError"));
    }
  }

  useEffect(() => {
    // Never auto-open on public auth pages (login / register / legal) — onboarding
    // belongs inside the app, after sign-in.
    if (isPublicPath(pathname)) return;
    // localStorage is only available on the client, so this first-run check must
    // run in an effect rather than during render.
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (!localStorage.getItem(ONBOARDING_STORAGE_KEY)) setOpen(true);
    } catch {
      /* localStorage unavailable — skip onboarding */
    }
  }, [pathname]);

  useEffect(() => {
    function replayOnboarding() {
      setStep(0);
      setOpen(true);
    }

    window.addEventListener(ONBOARDING_REPLAY_EVENT, replayOnboarding);
    return () => window.removeEventListener(ONBOARDING_REPLAY_EVENT, replayOnboarding);
  }, []);

  function markDone() {
    try {
      localStorage.setItem(ONBOARDING_STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  function finish() {
    markDone();
    setOpen(false);
  }

  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;
  // Step 0 has device-specific copy (local-only vs account-backed).
  const description =
    step === 0
      ? t(isLocalDesktopMode ? "ob.step0.descDesktop" : "ob.step0.descWeb")
      : t(current.descKey);

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) finish();
      }}
    >
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary/12 text-primary">
            <Icon className="size-6" />
          </span>
          <DialogTitle className="mt-3">{t(current.titleKey)}</DialogTitle>
          <DialogDescription className="leading-relaxed">{description}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-center gap-1.5 py-2">
          {STEPS.map((_, index) => (
            <span
              key={index}
              className={
                index === step
                  ? "h-1.5 w-5 rounded-full bg-primary"
                  : "h-1.5 w-1.5 rounded-full bg-muted-foreground/30"
              }
            />
          ))}
        </div>

        <DialogFooter className="items-stretch gap-3 sm:items-center sm:justify-between">
          <Button
            className="h-auto min-h-10 w-full whitespace-normal px-3 text-center sm:w-auto"
            variant="ghost"
            onClick={finish}
          >
            {t("ob.skip")}
          </Button>
          <div className="grid w-full grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:flex sm:w-auto">
            {step === 0 ? (
              <>
                <Button
                  className="h-auto min-h-10 w-full whitespace-normal px-3 text-center sm:w-auto"
                  variant="outline"
                  onClick={() => setStep(1)}
                  disabled={loadingSample}
                >
                  {t("ob.fromScratch")}
                </Button>
                <Button
                  className="h-auto min-h-10 w-full whitespace-normal px-3 text-center sm:w-auto"
                  onClick={() => void loadSample()}
                  disabled={loadingSample}
                >
                  <Sparkles className="size-4" />
                  {loadingSample ? t("set.data.loading") : t("ob.loadSample")}
                </Button>
              </>
            ) : (
              <>
                <Button
                  className="h-auto min-h-10 w-full whitespace-normal px-3 text-center sm:w-auto"
                  variant="outline"
                  onClick={() => setStep((s) => s - 1)}
                >
                  {t("ob.back")}
                </Button>
                {isLast ? (
                  <Button
                    className="h-auto min-h-10 w-full whitespace-normal px-3 text-center sm:w-auto"
                    onClick={finish}
                  >
                    {t("ob.start")}
                  </Button>
                ) : (
                  <Button
                    className="h-auto min-h-10 w-full whitespace-normal px-3 text-center sm:w-auto"
                    onClick={() => setStep((s) => s + 1)}
                  >
                    {t("ob.next")}
                  </Button>
                )}
              </>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
