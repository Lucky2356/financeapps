// Семейный бюджет: кто сколько потратил и кто кому должен.
//
// Одна книга на семью — у каждого свои устройства, и каждое помнит, чьё оно
// (components/family). Операция несёт участника — кто платил — и пометку
// «общая»: общая трата делится поровну на всех участников, личная никого,
// кроме самого участника, не касается.
//
// Долги считаются по ОБЩИМ тратам за всё время, а не за месяц: «Саша оплатил
// продукты в сентябре» не забывается первого октября. Отметка «Рассчитались»
// (familySettlements) гасит долг деньгами из рук в руки.
//
// Чистые функции: экран «Семья» и проверки зовут одно и то же.

export type Member = { id: string; name: string; color: string };

export type FamilyTransaction = {
  amount: number;
  type: string;
  date: string;
  memberId?: string;
  shared?: boolean;
  transferId?: string;
};

export type Settlement = { id: string; from: string; to: string; amount: number; date: string };

export type FamilyPicture = {
  month: string;
  /** Траты за месяц по участникам — личные и их доля общих. */
  perMember: Array<{
    id: string;
    name: string;
    color: string;
    personal: number;
    sharedPaid: number;
    sharedShare: number;
    total: number;
  }>;
  /** Траты за месяц без участника — записанные до того, как завели семью. */
  unassigned: number;
  sharedTotal: number;
  /** Баланс по общим тратам за всё время: плюс — ему должны, минус — он должен. */
  balances: Array<{ id: string; balance: number }>;
  /** Кто кому сколько отдать, чтобы сойтись. Переводов — как можно меньше. */
  debts: Array<{ from: string; to: string; amount: number }>;
};

const round = (value: number) => Math.round(value * 100) / 100;

const isSpending = (row: FamilyTransaction) => row.type === "EXPENSE" && !row.transferId;

export function familyPicture(
  members: Member[],
  transactions: FamilyTransaction[],
  settlements: Settlement[],
  month: string
): FamilyPicture {
  const ids = new Set(members.map((member) => member.id));
  const count = members.length;
  const inMonth = transactions.filter((row) => isSpending(row) && row.date.startsWith(month));

  const perMember = members.map((member) => {
    const personal = inMonth
      .filter((row) => row.memberId === member.id && !row.shared)
      .reduce((sum, row) => sum + row.amount, 0);
    const sharedPaid = inMonth
      .filter((row) => row.memberId === member.id && row.shared)
      .reduce((sum, row) => sum + row.amount, 0);
    const sharedShare =
      count > 0
        ? inMonth
            .filter((row) => row.shared && row.memberId && ids.has(row.memberId))
            .reduce((sum, row) => sum + row.amount / count, 0)
        : 0;
    return {
      id: member.id,
      name: member.name,
      color: member.color,
      personal: round(personal),
      sharedPaid: round(sharedPaid),
      sharedShare: round(sharedShare),
      total: round(personal + sharedShare)
    };
  });

  const unassigned = round(
    inMonth
      .filter((row) => !row.memberId || !ids.has(row.memberId))
      .reduce((sum, row) => sum + row.amount, 0)
  );
  const sharedTotal = round(
    inMonth
      .filter((row) => row.shared && row.memberId && ids.has(row.memberId))
      .reduce((sum, row) => sum + row.amount, 0)
  );

  // Балансы за всё время: заплатил общее — тебе должны все остальные их долю.
  const balance = new Map(members.map((member) => [member.id, 0]));
  if (count > 1) {
    for (const row of transactions) {
      if (!isSpending(row) || !row.shared || !row.memberId || !ids.has(row.memberId)) continue;
      const share = row.amount / count;
      for (const member of members) {
        const delta = member.id === row.memberId ? row.amount - share : -share;
        balance.set(member.id, (balance.get(member.id) ?? 0) + delta);
      }
    }
    for (const settlement of settlements) {
      if (!ids.has(settlement.from) || !ids.has(settlement.to)) continue;
      // Отдал деньги — его долг меньше (баланс растёт), получил — наоборот.
      balance.set(settlement.from, (balance.get(settlement.from) ?? 0) + settlement.amount);
      balance.set(settlement.to, (balance.get(settlement.to) ?? 0) - settlement.amount);
    }
  }
  const balances = members.map((member) => ({
    id: member.id,
    balance: round(balance.get(member.id) ?? 0)
  }));

  return { month, perMember, unassigned, sharedTotal, balances, debts: settleUp(balances) };
}

/**
 * Кто кому сколько: должники по очереди закрывают тех, кому должны, — от
 * самых крупных. Для семьи из двух-четырёх человек это и есть наименьшее
 * число переводов.
 */
export function settleUp(balances: Array<{ id: string; balance: number }>): FamilyPicture["debts"] {
  const owe = balances
    .filter((item) => item.balance < -0.004)
    .map((item) => ({ id: item.id, left: -item.balance }))
    .sort((a, b) => b.left - a.left);
  const get = balances
    .filter((item) => item.balance > 0.004)
    .map((item) => ({ id: item.id, left: item.balance }))
    .sort((a, b) => b.left - a.left);
  const debts: FamilyPicture["debts"] = [];
  let i = 0;
  let j = 0;
  while (i < owe.length && j < get.length) {
    const amount = Math.min(owe[i].left, get[j].left);
    if (amount > 0.004) debts.push({ from: owe[i].id, to: get[j].id, amount: round(amount) });
    owe[i].left -= amount;
    get[j].left -= amount;
    if (owe[i].left <= 0.004) i += 1;
    if (get[j].left <= 0.004) j += 1;
  }
  return debts;
}
