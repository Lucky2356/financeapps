import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createPrismaClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"]
  });
}

export const prisma = process.env.DATABASE_URL
  ? globalForPrisma.prisma ?? createPrismaClient()
  : null;

if (process.env.NODE_ENV !== "production" && prisma) {
  globalForPrisma.prisma = prisma;
}

export function requirePrisma() {
  if (!prisma) {
    throw new Error("DATABASE_URL is not configured. Copy .env.example to .env and run Prisma migrations.");
  }

  return prisma;
}
