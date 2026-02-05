import { NextResponse } from "next/server"
import { DataFetcher } from "@/lib/data-fetcher"
import { TradingStrategies } from "@/lib/strategies"
import { DEFAULT_TRADING_CONFIG } from "@/lib/default-config"
import type { ActiveTrade, Signal } from "@/types/trading"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(request: Request) {
  try {
    const { activeTrades } = await request.json()

    if (!activeTrades || activeTrades.length === 0) {
      return NextResponse.json({
        success: true,
        exitSignals: [],
        message: "No active trades to monitor",
      })
    }

    const dataFetcher = new DataFetcher()

    const strategies = new TradingStrategies(DEFAULT_TRADING_CONFIG)

    const [data1h, data15m, data5m] = await Promise.all([
      dataFetcher.fetchCandles("1h", 200),
      dataFetcher.fetchCandles("15m", 200),
      dataFetcher.fetchCandles("5m", 200),
    ])

    const exitSignals: Array<{ trade: ActiveTrade; signal: Signal }> = []

    for (const trade of activeTrades) {
      if (trade.status !== "ACTIVE") continue

      const exitSignal = await strategies.evaluateExitForTrade(trade, data1h.candles, data15m.candles, data5m.candles)

      if (exitSignal && exitSignal.type === "EXIT") {
        exitSignals.push({ trade, signal: exitSignal })
      }
    }

    return NextResponse.json({
      success: true,
      exitSignals,
      message: exitSignals.length > 0 ? `Found ${exitSignals.length} exit signal(s)` : "All trades looking good",
    })
  } catch (error) {
    console.error("Error monitoring trades:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to monitor trades",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
