// Семья: участники и отметки «Рассчитались».

import { id } from "@/lib/api/local/helpers";
import { roundMoney } from "@/lib/utils";
import { isoDay } from "@/lib/net-worth-snapshots";
import { type LocalState, FAMILY_COLORS } from "@/lib/api/local/state";

/** Участники семьи и отметки «Рассчитались». */
export function writeFamily(state: LocalState, body: unknown) {
  const input = (body ?? {}) as Record<string, unknown>;
  const members = state.members ?? [];
  const name = () => {
    const text = String(input.name ?? "")
      .trim()
      .slice(0, 40);
    if (!text) throw new Error("Как зовут участника?");
    return text;
  };
  const color = () => {
    const text = String(input.color ?? "").trim();
    return /^#[0-9a-fA-F]{3,8}$/.test(text)
      ? text
      : FAMILY_COLORS[members.length % FAMILY_COLORS.length];
  };
  switch (String(input.action ?? "")) {
    case "addMember": {
      // Семья уже делит траты — новый участник в ней с сегодняшнего дня, и
      // прежние общие траты его не касаются. Семью только заводят — все
      // «были всегда»: старые траты, отмеченные общими задним числом,
      // делятся на всех.
      const inUse = state.transactions.some((row) => row.shared && row.memberId);
      const member = {
        id: id("mem"),
        name: name(),
        color: color(),
        ...(inUse ? { since: isoDay(new Date()) } : {})
      };
      if (members.some((item) => item.name.toLowerCase() === member.name.toLowerCase()))
        throw new Error("Участник с таким именем уже есть.");
      state.members = [...members, member];
      return member;
    }
    case "renameMember": {
      const memberId = String(input.id ?? "");
      if (!members.some((item) => item.id === memberId)) throw new Error("Такого участника нет.");
      const next = name();
      // «В семье с»: пусто — был всегда; дата — с этого дня.
      const since =
        input.since === undefined
          ? undefined
          : String(input.since).trim() === ""
            ? null
            : String(input.since).trim();
      if (since && !/^\d{4}-\d{2}-\d{2}$/.test(since)) throw new Error("Дата — ГГГГ-ММ-ДД.");
      state.members = members.map((item) => {
        if (item.id !== memberId) return item;
        const renamed = { ...item, name: next };
        if (since === null) delete renamed.since;
        else if (since) renamed.since = since;
        return renamed;
      });
      return { saved: true };
    }
    case "removeMember": {
      const memberId = String(input.id ?? "");
      state.members = members.filter((item) => item.id !== memberId);
      return { removed: true };
    }
    case "settle": {
      const from = String(input.from ?? "");
      const to = String(input.to ?? "");
      const amount = Number(
        String(input.amount ?? "")
          .replace(/[\s\u00a0]/g, "")
          .replace(",", ".")
      );
      if (
        !members.some((item) => item.id === from) ||
        !members.some((item) => item.id === to) ||
        from === to
      )
        throw new Error("Выберите, кто кому отдал.");
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("Сумма — больше нуля.");
      const settlement = {
        id: id("settle"),
        from,
        to,
        amount: roundMoney(amount),
        date: typeof input.date === "string" && input.date ? input.date : isoDay(new Date())
      };
      state.familySettlements = [...(state.familySettlements ?? []), settlement];
      return settlement;
    }
    default:
      throw new Error("Неизвестное действие с семьёй.");
  }
}
