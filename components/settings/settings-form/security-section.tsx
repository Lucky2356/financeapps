"use client";

import { ShieldCheck } from "lucide-react";

import { PeoplePanel } from "@/components/settings/people-panel";
import type { Section, Translate } from "@/components/settings/settings-form/model";
import { VaultPanel } from "@/components/settings/vault-panel";

export function securitySection(t: Translate): Section {
  return {
    id: "security",
    label: t("set.nav.security"),
    summary: t("set.nav.security.summary"),
    lead: t("set.nav.security.lead"),
    icon: ShieldCheck,
    keywords:
      "пароль password доступ access замок lock код восстановления recovery люди people человек person безопасность security",
    node: (
      <>
        <VaultPanel />
        <PeoplePanel />
      </>
    )
  };
}
