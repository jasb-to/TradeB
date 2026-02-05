import { NextResponse } from "next/server"
import { SignalCache } from "@/lib/signal-cache"

export async function POST(request: Request) {
  try {
    const { symbol, result } = await request.json()

    if (!symbol || !result) {
      return NextResponse.json({ error: "Symbol and result required" }, { status: 400 })
    }

    if (result === "LOSS") {
      SignalCache.recordLoss(symbol)
      SignalCache.setTradeState(symbol, "COOLDOWN", `Stop loss hit - ${symbol.includes("XAU") ? "90min" : "60min"} cooldown`)
      console.log(`[v0] Trade closed with LOSS for ${symbol} - activating cooldown`)
      return NextResponse.json({
        success: true,
        message: `Loss recorded for ${symbol} - cooldown activated`,
        state: SignalCache.getTradeState(symbol),
      })
    } else if (result === "WIN") {
      SignalCache.recordWin(symbol)
      SignalCache.setTradeState(symbol, "IDLE", `Trade won - returning to IDLE`)
      console.log(`[v0] Trade closed with WIN for ${symbol}`)
      return NextResponse.json({
        success: true,
        message: `Win recorded for ${symbol}`,
        state: SignalCache.getTradeState(symbol),
      })
    }

    return NextResponse.json({ error: "Invalid result type" }, { status: 400 })
  } catch (error) {
    console.error("[v0] Trade result error:", error)
    return NextResponse.json({ error: "Failed to record trade result" }, { status: 500 })
  }
}
