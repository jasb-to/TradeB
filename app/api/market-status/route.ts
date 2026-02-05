import { NextResponse } from "next/server"
import { MarketHours } from "@/lib/market-hours"

export const dynamic = "force-dynamic"

export async function GET() {
  const status = MarketHours.getMarketStatus()

  return NextResponse.json(status)
}
