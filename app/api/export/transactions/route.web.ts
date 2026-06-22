import { NextRequest, NextResponse } from "next/server";

import { getTransactionsPageData } from "@/lib/data";
import { ExportService } from "@/services/export/ExportService";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const format = request.nextUrl.searchParams.get("format") ?? "json";
  const data = await getTransactionsPageData({});
  const service = new ExportService();

  if (format === "csv") {
    return new NextResponse(service.transactionsToCsv(data.transactions), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": "attachment; filename=transactions-export.csv"
      }
    });
  }

  return new NextResponse(service.transactionsToJson(data.transactions), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": "attachment; filename=transactions-export.json"
    }
  });
}
