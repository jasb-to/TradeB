import { NextResponse } from "next/server"
import { RedisTrades } from "@/lib/redis-trades"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get("limit") || "100")

    const history = await RedisTrades.getTradeHistory(limit)
    const stats = await RedisTrades.getStats()

    return NextResponse.json({
      success: true,
      history,
      stats,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("[v0] Trade history error:", error)
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    )
  }
}
