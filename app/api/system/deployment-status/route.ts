import { NextResponse } from "next/server"
import { TRADING_SYMBOLS } from "@/lib/trading-symbols"

export const dynamic = "force-dynamic"

export async function GET() {
  return NextResponse.json({
    systemVersion: "11.6.0-MULTI-SYMBOL-FIXED",
    buildMarker: "20260220-SYMBOL_GUARD_REMOVED",
    deploymentStatus: "LIVE",
    timestamp: new Date().toISOString(),
    supportedSymbols: TRADING_SYMBOLS,
    multiSymbolEnabled: true,
    description: "This endpoint confirms the production deployment has multi-symbol support enabled. If you see all 4 symbols below, the latest build is deployed.",
  })
}
