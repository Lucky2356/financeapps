import { PrismaClient, SecurityRisk } from "@prisma/client";
import { addDays, addMonths, startOfDay, startOfMonth, subDays } from "date-fns";

const prisma = new PrismaClient();

const demoEmail = "demo@finance.local";

type DemoSecurity = {
  ticker: string;
  name: string;
  sector: string;
  risk: SecurityRisk;
  basePrice: number;
  comment: string;
  volatility: number;
  drift: number;
};

const securities: DemoSecurity[] = [
  {
    ticker: "SBER",
    name: "Сбербанк",
    sector: "Финансы",
    risk: "MEDIUM",
    basePrice: 315,
    volatility: 2.2,
    drift: 0.08,
    comment: "Крупная ликвидная бумага, чувствительна к ставкам и качеству кредитного портфеля."
  },
  {
    ticker: "GAZP",
    name: "Газпром",
    sector: "Энергетика",
    risk: "HIGH",
    basePrice: 138,
    volatility: 3.6,
    drift: -0.03,
    comment: "Высокая зависимость от экспортной конъюнктуры, налоговой нагрузки и капитальных затрат."
  },
  {
    ticker: "LKOH",
    name: "Лукойл",
    sector: "Энергетика",
    risk: "MEDIUM",
    basePrice: 7420,
    volatility: 2.4,
    drift: 0.06,
    comment: "Нефтегазовый сектор, чувствителен к ценам на сырье и валютному курсу."
  },
  {
    ticker: "YNDX",
    name: "Яндекс",
    sector: "Технологии",
    risk: "HIGH",
    basePrice: 4060,
    volatility: 4.2,
    drift: 0.1,
    comment: "Технологическая компания с повышенной волатильностью и регуляторными факторами."
  },
  {
    ticker: "T",
    name: "Т-Технологии",
    sector: "Финтех",
    risk: "HIGH",
    basePrice: 3160,
    volatility: 4.6,
    drift: 0.12,
    comment: "Финтех-эмитент с быстрым ростом и заметной чувствительностью к ожиданиям рынка."
  },
  {
    ticker: "VTBR",
    name: "ВТБ",
    sector: "Финансы",
    risk: "HIGH",
    basePrice: 0.021,
    volatility: 5.4,
    drift: -0.02,
    comment: "Банковская бумага с высокой волатильностью и зависимостью от макрофакторов."
  },
  {
    ticker: "MGNT",
    name: "Магнит",
    sector: "Ритейл",
    risk: "MEDIUM",
    basePrice: 5980,
    volatility: 2.5,
    drift: 0.02,
    comment: "Защитный сектор, но маржинальность зависит от потребительского спроса и логистики."
  },
  {
    ticker: "NVTK",
    name: "Новатэк",
    sector: "Энергетика",
    risk: "MEDIUM",
    basePrice: 1125,
    volatility: 2.9,
    drift: 0.01,
    comment: "Газовый сектор, важны санкционные ограничения и инвестиционные проекты."
  },
  {
    ticker: "ROSN",
    name: "Роснефть",
    sector: "Энергетика",
    risk: "MEDIUM",
    basePrice: 575,
    volatility: 2.8,
    drift: 0.03,
    comment: "Зависимость от нефтяных цен, налоговой политики и курса рубля."
  },
  {
    ticker: "MOEX",
    name: "Московская биржа",
    sector: "Финансовая инфраструктура",
    risk: "LOW",
    basePrice: 228,
    volatility: 1.8,
    drift: 0.04,
    comment: "Инфраструктурная компания, динамика зависит от оборотов торгов и ставок."
  }
];

function price(value: number) {
  return Number(value.toFixed(4));
}

function monthDate(monthOffset: number, day: number) {
  const base = addMonths(startOfMonth(new Date()), monthOffset);
  return startOfDay(addDays(base, day - 1));
}

async function main() {
  const existingUser = await prisma.user.findUnique({ where: { email: demoEmail } });
  if (existingUser) {
    await prisma.user.delete({ where: { id: existingUser.id } });
  }

  await prisma.security.deleteMany();

  const conservative = await prisma.riskProfile.upsert({
    where: { code: "CONSERVATIVE" },
    update: {},
    create: {
      code: "CONSERVATIVE",
      title: "Консервативный",
      description: "Фокус на стабильности, контроле просадки и небольшой доле высокорисковых активов.",
      maxHighRiskShare: 15,
      maxSinglePositionShare: 25
    }
  });

  await prisma.riskProfile.upsert({
    where: { code: "AGGRESSIVE" },
    update: {},
    create: {
      code: "AGGRESSIVE",
      title: "Агрессивный",
      description: "Готовность к заметной волатильности ради потенциально более высокой доходности.",
      maxHighRiskShare: 45,
      maxSinglePositionShare: 45
    }
  });

  const moderate = await prisma.riskProfile.upsert({
    where: { code: "MODERATE" },
    update: {},
    create: {
      code: "MODERATE",
      title: "Умеренный",
      description: "Баланс роста и контроля риска, без чрезмерной концентрации в одной бумаге.",
      maxHighRiskShare: 30,
      maxSinglePositionShare: 35
    }
  });

  const user = await prisma.user.create({
    data: {
      email: demoEmail,
      name: "Демо-пользователь",
      currency: "RUB",
      demoMode: true,
      emergencyFundMonthsTarget: 6,
      riskProfileId: moderate.id
    }
  });

  const accounts = await Promise.all([
    prisma.account.create({
      data: { userId: user.id, name: "Наличные", type: "CASH", balance: 32000 }
    }),
    prisma.account.create({
      data: { userId: user.id, name: "Дебетовая карта", type: "DEBIT_CARD", balance: 184500 }
    }),
    prisma.account.create({
      data: { userId: user.id, name: "Накопительный счет", type: "SAVINGS", balance: 280000 }
    }),
    prisma.account.create({
      data: { userId: user.id, name: "Брокерский счет", type: "BROKERAGE", balance: 420000 }
    })
  ]);

  const [, debit, savings, brokerage] = accounts;

  const categoryRows = [
    { name: "Зарплата", kind: "INCOME" as const, color: "#16a34a", icon: "Briefcase" },
    { name: "Фриланс", kind: "INCOME" as const, color: "#0d9488", icon: "Laptop" },
    { name: "Продукты", kind: "EXPENSE" as const, color: "#f97316", icon: "ShoppingCart", isEssential: true },
    { name: "Транспорт", kind: "EXPENSE" as const, color: "#2563eb", icon: "Car", isEssential: true },
    { name: "ЖКХ", kind: "EXPENSE" as const, color: "#7c3aed", icon: "Home", isEssential: true },
    { name: "Подписки", kind: "EXPENSE" as const, color: "#db2777", icon: "Repeat", isSubscription: true },
    { name: "Развлечения", kind: "EXPENSE" as const, color: "#eab308", icon: "Music" },
    { name: "Здоровье", kind: "EXPENSE" as const, color: "#dc2626", icon: "HeartPulse", isEssential: true },
    { name: "Образование", kind: "EXPENSE" as const, color: "#0891b2", icon: "GraduationCap" },
    { name: "Рестораны", kind: "EXPENSE" as const, color: "#ea580c", icon: "Utensils" },
    { name: "Путешествия", kind: "EXPENSE" as const, color: "#0284c7", icon: "Plane" }
  ];

  const categories = new Map<string, string>();
  for (const category of categoryRows) {
    const created = await prisma.category.create({
      data: {
        userId: user.id,
        name: category.name,
        kind: category.kind,
        color: category.color,
        icon: category.icon,
        isEssential: category.isEssential ?? false,
        isSubscription: category.isSubscription ?? false
      }
    });
    categories.set(`${created.kind}:${created.name}`, created.id);
  }

  const categoryId = (kind: "INCOME" | "EXPENSE", name: string) => {
    const id = categories.get(`${kind}:${name}`);
    if (!id) throw new Error(`Category not found: ${kind}:${name}`);
    return id;
  };

  const txRows = [
    [-2, 5, 210000, "INCOME", "Зарплата", debit.id, "Зарплата за месяц"],
    [-2, 14, 22000, "INCOME", "Фриланс", debit.id, "Проектная оплата"],
    [-2, 3, 38200, "EXPENSE", "Продукты", debit.id, "Супермаркеты"],
    [-2, 6, 9800, "EXPENSE", "Транспорт", debit.id, "Такси и проезд"],
    [-2, 8, 18500, "EXPENSE", "ЖКХ", debit.id, "Коммунальные платежи"],
    [-2, 10, 6900, "EXPENSE", "Подписки", debit.id, "Сервисы и приложения"],
    [-2, 19, 16400, "EXPENSE", "Развлечения", debit.id, "Кино и мероприятия"],
    [-2, 22, 8400, "EXPENSE", "Рестораны", debit.id, "Кафе"],
    [-1, 5, 210000, "INCOME", "Зарплата", debit.id, "Зарплата за месяц"],
    [-1, 12, 27000, "INCOME", "Фриланс", debit.id, "Консультации"],
    [-1, 2, 42600, "EXPENSE", "Продукты", debit.id, "Супермаркеты"],
    [-1, 7, 11800, "EXPENSE", "Транспорт", debit.id, "Такси и проезд"],
    [-1, 9, 19000, "EXPENSE", "ЖКХ", debit.id, "Коммунальные платежи"],
    [-1, 13, 7600, "EXPENSE", "Подписки", debit.id, "Сервисы и приложения"],
    [-1, 20, 21400, "EXPENSE", "Развлечения", debit.id, "Концерты"],
    [-1, 24, 13300, "EXPENSE", "Рестораны", debit.id, "Кафе"],
    [-1, 28, 18000, "EXPENSE", "Образование", debit.id, "Курс"],
    [0, 5, 210000, "INCOME", "Зарплата", debit.id, "Зарплата за месяц"],
    [0, 11, 18500, "INCOME", "Фриланс", debit.id, "Разовая задача"],
    [0, 2, 48700, "EXPENSE", "Продукты", debit.id, "Супермаркеты"],
    [0, 6, 13200, "EXPENSE", "Транспорт", debit.id, "Такси и проезд"],
    [0, 8, 19700, "EXPENSE", "ЖКХ", debit.id, "Коммунальные платежи"],
    [0, 10, 8800, "EXPENSE", "Подписки", debit.id, "Сервисы и приложения"],
    [0, 15, 24800, "EXPENSE", "Развлечения", debit.id, "Выходные"],
    [0, 19, 16200, "EXPENSE", "Рестораны", debit.id, "Кафе"],
    [0, 22, 12600, "EXPENSE", "Здоровье", debit.id, "Врач"],
    [0, 25, 30000, "EXPENSE", "Путешествия", savings.id, "Билеты"]
  ] as const;

  for (const [monthOffset, day, amount, type, categoryName, accountId, description] of txRows) {
    await prisma.transaction.create({
      data: {
        userId: user.id,
        accountId,
        categoryId: categoryId(type, categoryName),
        amount,
        type,
        date: monthDate(monthOffset, day),
        description
      }
    });
  }

  const budgetMonth = startOfMonth(new Date());
  const budgetRows = [
    ["Продукты", 43000],
    ["Транспорт", 12000],
    ["ЖКХ", 21000],
    ["Подписки", 7000],
    ["Развлечения", 18000],
    ["Рестораны", 12000],
    ["Здоровье", 14000],
    ["Образование", 16000],
    ["Путешествия", 25000]
  ] as const;

  for (const [name, limitAmount] of budgetRows) {
    await prisma.budget.create({
      data: {
        userId: user.id,
        categoryId: categoryId("EXPENSE", name),
        month: budgetMonth,
        limitAmount
      }
    });
  }

  await prisma.savingGoal.createMany({
    data: [
      {
        userId: user.id,
        title: "Финансовая подушка",
        targetAmount: 900000,
        currentAmount: 280000,
        deadline: monthDate(9, 28)
      },
      {
        userId: user.id,
        title: "Отпуск",
        targetAmount: 260000,
        currentAmount: 85000,
        deadline: monthDate(5, 15)
      },
      {
        userId: user.id,
        title: "Обновление ноутбука",
        targetAmount: 220000,
        currentAmount: 70000,
        deadline: monthDate(7, 1)
      }
    ]
  });

  await prisma.externalConnection.create({
    data: {
      userId: user.id,
      provider: "FutureBankApi",
      status: "DISCONNECTED"
    }
  });

  const securityIdByTicker = new Map<string, string>();
  const today = startOfDay(new Date());
  for (const [securityIndex, security] of securities.entries()) {
    const created = await prisma.security.create({
      data: {
        ticker: security.ticker,
        name: security.name,
        sector: security.sector,
        risk: security.risk,
        comment: security.comment
      }
    });
    securityIdByTicker.set(security.ticker, created.id);

    const generatedPrices: number[] = [];
    for (let dayIndex = 44; dayIndex >= 0; dayIndex -= 1) {
      const sequence = 44 - dayIndex;
      const wave =
        Math.sin((sequence + securityIndex) * 0.42) * security.volatility +
        Math.cos(sequence * 0.19 + securityIndex) * (security.volatility / 2);
      const trend = security.drift * sequence;
      const value = security.basePrice * (1 + (trend + wave) / 100);
      generatedPrices.push(price(value));
    }

    const latest = generatedPrices[generatedPrices.length - 1];
    const previous = generatedPrices[generatedPrices.length - 2] ?? latest;
    const thirtyAgo = generatedPrices[generatedPrices.length - 31] ?? generatedPrices[0];
    const changeDay = ((latest - previous) / previous) * 100;
    const change30d = ((latest - thirtyAgo) / thirtyAgo) * 100;

    await prisma.marketPrice.createMany({
      data: generatedPrices.map((value, index) => ({
        securityId: created.id,
        date: subDays(today, generatedPrices.length - 1 - index),
        price: value,
        changeDay: index === generatedPrices.length - 1 ? price(changeDay) : 0,
        change30d: index === generatedPrices.length - 1 ? price(change30d) : 0,
        source: "MOCK"
      }))
    });
  }

  const portfolio = await prisma.portfolio.create({
    data: {
      userId: user.id,
      accountId: brokerage.id,
      name: "Демо-портфель"
    }
  });

  const positionRows = [
    ["SBER", 350, 287],
    ["LKOH", 18, 6950],
    ["YNDX", 22, 3780],
    ["MOEX", 520, 214],
    ["T", 28, 2860],
    ["GAZP", 480, 154]
  ] as const;

  for (const [ticker, quantity, averageBuyPrice] of positionRows) {
    await prisma.portfolioPosition.create({
      data: {
        portfolioId: portfolio.id,
        securityId: securityIdByTicker.get(ticker)!,
        quantity,
        averageBuyPrice
      }
    });
  }

  await prisma.watchlistItem.createMany({
    data: securities.map((security) => ({
      userId: user.id,
      securityId: securityIdByTicker.get(security.ticker)!,
      notes: `${security.sector}: ${security.risk.toLowerCase()} risk`
    }))
  });

  await prisma.recommendation.createMany({
    data: [
      {
        userId: user.id,
        title: "Подушка ниже целевого уровня",
        description: "Текущий резерв покрывает меньше выбранного целевого периода. Часть свободного остатка можно направлять в резерв.",
        severity: "WARNING"
      },
      {
        userId: user.id,
        title: "Расходы на досуг растут",
        description: "За последние месяцы траты на развлечения и рестораны увеличились. Проверьте регулярные необязательные платежи.",
        severity: "INFO"
      }
    ]
  });

  console.info(`Seed complete. Demo user: ${user.email}. Risk profile fallback: ${conservative.title}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
