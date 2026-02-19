import { NextResponse } from "next/server"
import { RedisTrades } from "@/lib/redis-trades"
import { DataFetcher } from "@/lib/data-fetcher"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Monitor active trades and check TP/SL conditions
 * Called every minute by Vercel Crons
 */
export async function GET(request: Request) {
  try {
    const allActiveTrades = await RedisTrades.getAllActiveTrades()
    console.log(`[MONITOR_TRADES] Checking ${allActiveTrades.length} active trades`)

    const updates: any[] = []

    for (const trade of allActiveTrades) {
      try {
        // Fetch current price for the symbol
        const priceData = await DataFetcher.getLatestPrice(trade.symbol)
        const currentPrice = priceData.closePrice

        // Check exit conditions
        const exitResult = await RedisTrades.checkTradeExit(trade.id, currentPrice)

        if (exitResult.closed) {
          console.log(`[MONITOR_TRADES] ${trade.id} closed with status: ${exitResult.status}`)
          updates.push({
            tradeId: trade.id,
            symbol: trade.symbol,
            status: exitResult.status,
            currentPrice,
            closed: true,
          })
        } else if (exitResult.status) {
          // Status changed but not fully closed (e.g., TP1 hit)
          console.log(`[MONITOR_TRADES] ${trade.id} status updated to: ${exitResult.status}`)
          updates.push({
            tradeId: trade.id,
            symbol: trade.symbol,
            status: exitResult.status,
            currentPrice,
            closed: false,
          })
        }
      } catch (error) {
        console.error(`[MONITOR_TRADES] Error checking trade ${trade.id}:`, error)
      }
    }

    const stats = await RedisTrades.getStats()

    return NextResponse.json({
      success: true,
      tradesChecked: allActiveTrades.length,
      updates,
      stats,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("[v0] Trade monitor error:", error)
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    )
  }
}
