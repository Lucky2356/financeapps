import { connection } from "next/server";

export async function ensureFreshServerData() {
  if (process.env.NEXT_OUTPUT !== "export") {
    await connection();
  }
}
