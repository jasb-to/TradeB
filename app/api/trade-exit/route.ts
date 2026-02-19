import { NextResponse } from "next/server"
import { RedisTrades } from "@/lib/redis-trades"
import { DataFetcher } from "@/lib/data-fetcher"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { tradeId, status, currentPrice, symbol } = body

    if (!tradeId || !status) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: tradeId, status" },
        { status: 400 }
      )
    }

    // Check exit conditions (TP/SL)
    const exitResult = await RedisTrades.checkTradeExit(tradeId, currentPrice)

    // Log exit event
    if (exitResult.closed) {
      console.log(`[TRADE_EXIT] Trade ${tradeId} closed with status: ${exitResult.status}`)
    }

    return NextResponse.json({
      success: true,
      tradeId,
      exitResult,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("[v0] Trade exit check error:", error)
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    )
  }
}
