import { NextResponse } from "next/server"
import { ActiveTradeTracker } from "@/lib/active-trade-tracker"
import { SignalCache } from "@/lib/signal-cache"

export async function POST(request: Request) {
  try {
    const { symbol } = await request.json()

    if (!symbol) {
      return NextResponse.json({ error: "Symbol required" }, { status: 400 })
    }

    const result = ActiveTradeTracker.manualExitTrade(symbol)

    if (!result.success) {
      return NextResponse.json({ error: "No active trade found", success: false }, { status: 404 })
    }

    // Clear the active trade from signal cache so a new trade can form
    SignalCache.clearActiveTrade(symbol)
    console.log(`[v0] Manual exit: Cleared active trade for ${symbol}`)

    return NextResponse.json({
      success: true,
      message: `Trade manually closed for ${symbol}`,
      trade: result.trade,
      exitPrice: result.exitPrice,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("[v0] Manual exit error:", error)
    return NextResponse.json({ error: "Failed to exit trade", success: false }, { status: 500 })
  }
}
