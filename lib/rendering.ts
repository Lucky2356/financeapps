import { unstable_noStore as noStore } from "next/cache";

export async function ensureFreshServerData() {
  if (process.env.NEXT_OUTPUT !== "export") {
    // Mark web pages as dynamic without stalling production builds on a
    // request-only `connection()` promise. Static desktop export keeps the
    // prerendered shell and hydrates real data through LocalApiClient.
    noStore();
  }
}
