import { NextResponse } from "next/server"
import { SYSTEM_VERSION } from "../../signal/current/route"

// SYSTEM STATUS ENDPOINT - Returns diagnostic information
// Required by full system correction to verify state consistency
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const symbol = searchParams.get("symbol") || "XAU_USD"
    
    // TODO: Import active trade state when implemented
    // const activeTrade = await getActiveTrade(symbol)
    
    return NextResponse.json({
      version: SYSTEM_VERSION,
      timestamp: new Date().toISOString(),
      symbol,
      // These will be populated once trade persistence is implemented
      activeTrade: null,
      lastSignalType: "NO_TRADE",
      entryDecisionAllowed: false,
      hardGate1: null,
      hardGate2: null,
      status: "operational"
    })
  } catch (error) {
    console.error("[SYSTEM/STATUS] Error:", error)
    return NextResponse.json(
      { error: "System status unavailable", details: String(error) },
      { status: 500 }
    )
  }
}
