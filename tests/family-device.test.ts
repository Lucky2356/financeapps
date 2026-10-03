// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { deviceMember, FAMILY_ME_KEY } from "@/components/family/family-fields";
import { writeMine } from "@/lib/storage/mine";

// Трата, записанная с телефона одним нажатием, — того, чей это телефон.

describe("семья — трата с этого устройства без формы", () => {
  it("частые траты, ИИ и уведомление банка помечают расход участником устройства", () => {
    writeMine(FAMILY_ME_KEY, "mem-1");
    expect(deviceMember("EXPENSE")).toEqual({ memberId: "mem-1" });
    expect(deviceMember("INCOME")).toEqual({});
    writeMine(FAMILY_ME_KEY, "");
    expect(deviceMember("EXPENSE")).toEqual({});
  });
});
