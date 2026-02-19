import { NextResponse } from "next/server"
import { RedisTrades } from "@/lib/redis-trades"
import { DataFetcher } from "@/lib/data-fetcher"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Observability endpoint for UI and monitoring
 * Returns complete trade state with progress calculations
 * Prevents duplicate alerts by tracking state on UI side
 */
export async function GET() {
  try {
    const allActiveTrades = await RedisTrades.getAllActiveTrades()
    
    // Calculate progress for each trade
    const symbols: Record<string, any> = {}
    let totalProgressToTP = 0
    let totalProgressToSL = 0

    for (const trade of allActiveTrades) {
      try {
        // Fetch current price
        const priceData = await DataFetcher.getLatestPrice(trade.symbol)
        const currentPrice = priceData.closePrice

        let progressToTP1 = 0
        let progressToSL = 0

        if (trade.direction === "LONG") {
          // For LONG: entry -> TP1 is positive progress, entry -> SL is negative risk
          const tpRange = trade.takeProfit1 - trade.entry
          const slRange = trade.entry - trade.stopLoss
          
          if (tpRange > 0) {
            progressToTP1 = Math.min(100, Math.max(0, ((currentPrice - trade.entry) / tpRange) * 100))
          }
          if (slRange > 0) {
            progressToSL = Math.min(100, Math.max(0, ((trade.entry - currentPrice) / slRange) * 100))
          }
        } else {
          // For SHORT: entry -> TP1 means price going down
          const tpRange = trade.entry - trade.takeProfit1
          const slRange = trade.stopLoss - trade.entry
          
          if (tpRange > 0) {
            progressToTP1 = Math.min(100, Math.max(0, ((trade.entry - currentPrice) / tpRange) * 100))
          }
          if (slRange > 0) {
            progressToSL = Math.min(100, Math.max(0, ((currentPrice - trade.entry) / slRange) * 100))
          }
        }

        symbols[trade.symbol] = {
          tradeId: trade.id,
          status: trade.status,
          direction: trade.direction,
          tier: trade.tier,
          entry: trade.entry,
          currentPrice: currentPrice,
          tp1: trade.takeProfit1,
          tp2: trade.takeProfit2,
          sl: trade.stopLoss,
          progressToTP1: Math.round(progressToTP1),
          progressToSL: Math.round(progressToSL),
          createdAt: trade.createdAt,
          lastCheckedAt: trade.lastCheckedAt,
          lastCheckedPrice: trade.lastCheckedPrice,
          tp1Hit: trade.tp1AlertSent,
          tp2Hit: trade.tp2AlertSent,
          slHit: trade.slAlertSent,
        }

        totalProgressToTP += progressToTP1
        totalProgressToSL += progressToSL
      } catch (error) {
        console.error(`[TRADES_STATUS] Error processing ${trade.symbol}:`, error)
      }
    }

    const avgProgressToTP = allActiveTrades.length > 0 ? Math.round(totalProgressToTP / allActiveTrades.length) : 0
    const avgProgressToSL = allActiveTrades.length > 0 ? Math.round(totalProgressToSL / allActiveTrades.length) : 0

    return NextResponse.json({
        systemVersion: "10.2.0-ATOMIC-LOCKS",
      activeTradeCount: allActiveTrades.length,
      averageProgressToTP1: avgProgressToTP,
      averageProgressToSL: avgProgressToSL,
      symbols: symbols,
      lastMonitorRun: new Date().toISOString(),
      redisConnected: allActiveTrades !== null,
    })
  } catch (error) {
    console.error("[TRADES_STATUS] Error:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      systemVersion: "10.2.0-ATOMIC-LOCKS",
        redisConnected: false,
      },
      { status: 500 }
    )
  }
}
