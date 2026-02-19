import { NextResponse } from "next/server"
import { RedisTrades } from "@/lib/redis-trades"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const symbol = searchParams.get("symbol") || "XAU_USD"

    const activeTrade = await RedisTrades.getActiveTrade(symbol)
    const allActiveTrades = await RedisTrades.getAllActiveTrades()
    const stats = await RedisTrades.getStats()

    return NextResponse.json({
      success: true,
      symbol,
      activeTrade,
      allActiveTrades,
      stats,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("[v0] Active trades error:", error)
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    )
  }
}
