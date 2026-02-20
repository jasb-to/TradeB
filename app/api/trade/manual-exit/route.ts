import { NextResponse } from "next/server"
import { RedisTrades, TradeStatus } from "@/lib/redis-trades"
import { SignalCache } from "@/lib/signal-cache"

export async function POST(request: Request) {
  try {
    const { symbol } = await request.json()

    if (!symbol) {
      return NextResponse.json({ error: "Symbol required" }, { status: 400 })
    }

    // Get the active trade for this symbol
    const activeTrade = await RedisTrades.getActiveTrade(symbol)
    
    if (!activeTrade) {
      return NextResponse.json({ error: "No active trade found", success: false }, { status: 404 })
    }

    // Mark trade as manually closed and remove from active set
    activeTrade.status = TradeStatus.MANUALLY_CLOSED
    activeTrade.closedAt = new Date().toISOString()
    
    // Close via RedisTrades which handles removal from active_trade:${symbol} key
    await RedisTrades.closeTrade(activeTrade.id, TradeStatus.MANUALLY_CLOSED, 0)

    // Clear the active trade from signal cache so a new trade can form
    SignalCache.clearActiveTrade(symbol)
    console.log(`[v0] Manual exit: Closed trade ${activeTrade.id} for ${symbol}`)

    return NextResponse.json({
      success: true,
      message: `Trade manually closed for ${symbol}`,
      trade: activeTrade,
      exitTime: new Date().toISOString(),
    })
  } catch (error) {
    console.error("[v0] Manual exit error:", error)
    return NextResponse.json({ error: "Failed to exit trade", success: false }, { status: 500 })
  }
}
