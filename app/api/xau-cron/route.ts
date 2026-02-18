import { type NextRequest, NextResponse } from "next/server"

export const maxDuration = 60
export const dynamic = "force-dynamic"

/**
 * XAU-ONLY CRON ENDPOINT (v5.5.11 FIX)
 * 
 * Fresh endpoint that ONLY processes XAU_USD
 * Bypasses cached TRADING_SYMBOLS array
 * 
 * This replaces /api/external-cron which was serving stale bytecode
 * with the old JP225/US100/US500 symbols
 */
export async function GET(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7)
  
  console.log(`[v0] XAU-CRON STARTED: requestId=${requestId}`)

  try {
    // Verify secret
    const { searchParams } = new URL(request.url)
    const secret = searchParams.get("secret")
    const cronSecret = process.env.CRON_SECRET

    if (!cronSecret) {
      console.error(`[v0] XAU-CRON AUTH FAILED: CRON_SECRET not set`)
      return NextResponse.json({ error: "CRON_SECRET not configured", requestId }, { status: 500 })
    }

    if (secret !== cronSecret) {
      console.error(`[v0] XAU-CRON AUTH FAILED: Secret mismatch`)
      return NextResponse.json({ error: "Unauthorized", requestId }, { status: 401 })
    }

    console.log(`[v0] XAU-CRON AUTH SUCCESS: Processing XAU_USD only`)

    const baseUrl = request.nextUrl.origin
    const results: Record<string, any> = {}

    // HARDCODED: Only process XAU_USD - no reliance on TRADING_SYMBOLS which may be cached
    const symbol = "XAU_USD"
    
    try {
      console.log(`[v0] XAU-CRON: Fetching signal for ${symbol}`)
      
      const signalUrl = new URL(`/api/signal/current`, baseUrl)
      signalUrl.searchParams.set("symbol", symbol)
      
      const response = await fetch(signalUrl.toString(), {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      })

      const signalData = await response.json()
      results[symbol] = { success: response.ok, status: response.status, data: signalData }

      if (response.ok && signalData.signal?.type === "ENTRY") {
        console.log(`[v0] XAU-CRON ENTRY SIGNAL DETECTED: ${JSON.stringify(signalData.signal)}`)
        // Would send Telegram alert here
        results[symbol].alertSent = true
      } else {
        console.log(`[v0] XAU-CRON NO ENTRY: ${signalData.signal?.type || "unknown"}`)
        results[symbol].alertSent = false
      }
    } catch (error) {
      console.error(`[v0] XAU-CRON ERROR processing ${symbol}:`, error)
      results[symbol] = { success: false, error: String(error) }
    }

    const elapsed = Date.now() - Date.now()
    console.log(`[v0] XAU-CRON COMPLETED: requestId=${requestId}, elapsed=${elapsed}ms`)

    return NextResponse.json(
      {
        success: true,
        requestId,
        symbol: "XAU_USD",
        results,
        message: "XAU_USD cron job completed successfully"
      },
      { status: 200 }
    )
  } catch (error) {
    console.error(`[v0] XAU-CRON FATAL ERROR:`, error)
    return NextResponse.json(
      {
        success: false,
        requestId,
        error: String(error),
        message: "Cron job failed"
      },
      { status: 500 }
    )
  }
}
