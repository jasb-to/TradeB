import { NextRequest, NextResponse } from "next/server"
import { InMemoryTrades } from "@/lib/in-memory-trades"
import { DataFetcher } from "@/lib/data-fetcher"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Monitor active trades and close them when TP/SL is hit
 * Called by cron job every minute
 */
export async function GET(request: NextRequest) {
  console.log("[TRADE_MONITOR] Starting trade monitoring cycle")

  try {
    const activeTrades = await InMemoryTrades.getAllActiveTrades()
    console.log(`[TRADE_MONITOR] Found ${activeTrades.length} active trades`)

    if (activeTrades.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No active trades to monitor",
        trades: [],
      })
    }

    const results = []

    for (const trade of activeTrades) {
      try {
        // Fetch current price
        const fetcher = new DataFetcher(trade.symbol)
        const pricing = await fetcher.fetchLatestPricing([trade.symbol])

        if (!pricing || !pricing.prices || pricing.prices.length === 0) {
          console.log(`[TRADE_MONITOR] No pricing data for ${trade.symbol}, skipping`)
          continue
        }

        const currentPrice = parseFloat(pricing.prices[0].mid)
        console.log(
          `[TRADE_MONITOR] ${trade.symbol}: current=${currentPrice.toFixed(2)} entry=${trade.entry.toFixed(2)} sl=${trade.stopLoss.toFixed(2)} tp1=${trade.takeProfit1.toFixed(2)} tp2=${trade.takeProfit2.toFixed(2)}`
        )

        // Check if trade should be closed
        const wasClosed = await InMemoryTrades.checkTradeExit(trade.symbol, currentPrice)

        results.push({
          symbol: trade.symbol,
          currentPrice,
          status: wasClosed ? "CLOSED" : trade.status,
          reason: wasClosed ? "TP/SL Hit" : "Still Active",
        })
      } catch (tradeError) {
        console.error(`[TRADE_MONITOR] Error monitoring ${trade.symbol}:`, tradeError)
        results.push({
          symbol: trade.symbol,
          status: "ERROR",
          reason: String(tradeError),
        })
      }
    }

    return NextResponse.json({
      success: true,
      monitored: activeTrades.length,
      results,
    })
  } catch (error) {
    console.error("[TRADE_MONITOR] Error in monitoring cycle:", error)
    return NextResponse.json(
      {
        success: false,
        error: String(error),
      },
      { status: 500 }
    )
  }
}
