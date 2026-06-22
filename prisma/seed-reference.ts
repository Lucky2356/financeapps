import { PrismaClient } from "@prisma/client";

// Seeds reference data that every deployment needs (NOT demo/user data).
// Idempotent — safe to run on every deploy after `prisma migrate deploy`.
const prisma = new PrismaClient();

const RISK_PROFILES = [
  {
    code: "CONSERVATIVE" as const,
    title: "Консервативный",
    description:
      "Фокус на стабильности, контроле просадки и небольшой доле высокорисковых активов.",
    maxHighRiskShare: 15,
    maxSinglePositionShare: 25
  },
  {
    code: "MODERATE" as const,
    title: "Умеренный",
    description: "Баланс роста и контроля риска, без чрезмерной концентрации в одной бумаге.",
    maxHighRiskShare: 30,
    maxSinglePositionShare: 35
  },
  {
    code: "AGGRESSIVE" as const,
    title: "Агрессивный",
    description: "Готовность к заметной волатильности ради потенциально более высокой доходности.",
    maxHighRiskShare: 45,
    maxSinglePositionShare: 45
  }
];

async function main() {
  for (const p of RISK_PROFILES) {
    await prisma.riskProfile.upsert({
      where: { code: p.code },
      update: {
        title: p.title,
        description: p.description,
        maxHighRiskShare: p.maxHighRiskShare,
        maxSinglePositionShare: p.maxSinglePositionShare
      },
      create: p
    });
  }
  console.log(`Reference data seeded: ${RISK_PROFILES.length} risk profiles`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
