import { type NextRequest, NextResponse } from "next/server"
import { DataFetcher } from "@/lib/data-fetcher"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const symbol = (searchParams.get("symbol") as "XAU_USD" | "XAG_USD") || "XAU_USD" // add symbol parameter
    const timeframe = (searchParams.get("timeframe") as "5m" | "15m" | "1h" | "4h") || "1h"
    const limit = Number.parseInt(searchParams.get("limit") || "100")

    const dataFetcher = new DataFetcher(symbol) // pass symbol to DataFetcher

    const { candles, source } = await dataFetcher.fetchCandles(timeframe, limit)

    return NextResponse.json({
      success: true,
      candles,
      source,
      timeframe,
      count: candles.length,
    })
  } catch (error) {
    console.error("Error fetching candles:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
