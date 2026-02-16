import { type NextRequest, NextResponse } from "next/server"
import { DataFetcher } from "@/lib/data-fetcher"
import { TRADING_SYMBOLS } from "@/lib/trading-symbols"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const symbolParam = searchParams.get("symbol")
    const symbol = (symbolParam && TRADING_SYMBOLS.includes(symbolParam as any) 
      ? symbolParam 
      : "XAU_USD") as typeof TRADING_SYMBOLS[number]
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
