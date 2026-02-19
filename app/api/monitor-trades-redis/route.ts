import { NextResponse } from "next/server"
import { RedisTrades, TradeStatus } from "@/lib/redis-trades"
import { DataFetcher } from "@/lib/data-fetcher"

export const SYSTEM_VERSION = "10.1.0-PRODUCTION-READY"
export const dynamic = "force-dynamic"

// Global monitor state to prevent duplicate alerts within same execution
const monitorState = {
  lastRunAt: new Date().toISOString(),
  tradesChecked: 0,
  alertsSent: 0,
}

/**
 * Monitor active trades and check TP/SL conditions
 * Called every 10 minutes by external cron (cron-job.org)
 * ONLY sends Telegram alerts on state transitions (not on every check)
 */
export async function GET(request: Request) {
  try {
    const startTime = Date.now()
    monitorState.lastRunAt = new Date().toISOString()
    
    const allActiveTrades = await RedisTrades.getAllActiveTrades()
    console.log(`[MONITOR_REDIS] Starting - ${allActiveTrades.length} active trades at ${monitorState.lastRunAt}`)

    monitorState.tradesChecked = 0
    monitorState.alertsSent = 0
    const updates: any[] = []

    for (const trade of allActiveTrades) {
      try {
        // Fetch current price for the symbol
        const priceData = await DataFetcher.getLatestPrice(trade.symbol)
        const currentPrice = priceData.closePrice

        // Atomically check exit and get alert state
        const exitResult = await RedisTrades.checkTradeExit(trade.id, currentPrice)
        monitorState.tradesChecked++

        // ONLY send alert if state transition occurred
        if (exitResult.alertShouldSend) {
          console.log(`[MONITOR_REDIS] TP/SL ALERT: ${trade.id} transitioned to ${exitResult.status}`)
          monitorState.alertsSent++
          
          // Send Telegram alert for state change
          try {
            await fetch("https://api.telegram.org/bot" + process.env.TELEGRAM_BOT_TOKEN + "/sendMessage", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: process.env.TELEGRAM_CHAT_ID,
                text: `⚠️ Trade Alert: ${trade.symbol}\n${exitResult.status}\nPrice: ${currentPrice.toFixed(2)}\nTrade: ${trade.id}`,
              }),
            })
            console.log(`[MONITOR_REDIS] Telegram sent for ${trade.id}: ${exitResult.status}`)
          } catch (telegramError) {
            console.error(`[MONITOR_REDIS] Telegram error for ${trade.id}:`, telegramError)
          }
          
          updates.push({
            tradeId: trade.id,
            symbol: trade.symbol,
            status: exitResult.status,
            currentPrice,
            closed: exitResult.closed,
            alertSent: true,
          })
        } else if (exitResult.status) {
          // Status change without alert (internal tracking)
          console.log(`[MONITOR_REDIS] State update: ${trade.id} now ${exitResult.status}`)
          updates.push({
            tradeId: trade.id,
            symbol: trade.symbol,
            status: exitResult.status,
            currentPrice,
            closed: exitResult.closed,
            alertSent: false,
          })
        }
      } catch (error) {
        console.error(`[MONITOR_REDIS] Error checking trade ${trade.id}:`, error)
      }
    }

    const duration = Date.now() - startTime
    console.log(`[MONITOR_REDIS] Complete: ${monitorState.tradesChecked} checked, ${monitorState.alertsSent} alerts in ${duration}ms`)

    return NextResponse.json({
      success: true,
      monitoredAt: monitorState.lastRunAt,
      tradesChecked: monitorState.tradesChecked,
      alertsSent: monitorState.alertsSent,
      updates: updates.slice(0, 10), // Return last 10 updates
      durationMs: duration,
    })
  } catch (error) {
    console.error("[MONITOR_REDIS] Critical error:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
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
