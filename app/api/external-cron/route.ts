import { type NextRequest, NextResponse } from "next/server"

export const maxDuration = 60
export const dynamic = "force-dynamic"

/**
 * EXTERNAL CRON ENDPOINT - v5.5.12
 * 
 * HARDCODED to only process XAU_USD
 * Does NOT import TRADING_SYMBOLS to avoid cached bytecode issues
 */
export async function GET(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7)
  const startTime = Date.now()
  
  console.log(`[v0-CRON] STARTED: requestId=${requestId}`)

  try {
    // Verify secret
    const { searchParams } = new URL(request.url)
    const secret = searchParams.get("secret")
    const cronSecret = process.env.CRON_SECRET

    if (!cronSecret) {
      console.error(`[v0-CRON] AUTH FAILED: CRON_SECRET not set`)
      return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 })
    }

    if (secret !== cronSecret) {
      console.error(`[v0-CRON] AUTH FAILED: Secret mismatch`)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    console.log(`[v0-CRON] AUTH SUCCESS: Processing XAU_USD (hardcoded)`)

    const baseUrl = request.nextUrl.origin
    const results: Record<string, any> = {}
    
    // HARDCODED: Only XAU_USD - never import TRADING_SYMBOLS which gets cached
    const symbol = "XAU_USD"

    try {
      console.log(`[v0-CRON] Fetching signal for ${symbol}`)
      
      const signalUrl = new URL(`/api/signal/current`, baseUrl)
      signalUrl.searchParams.set("symbol", symbol)
      
      const response = await fetch(signalUrl.toString(), {
        method: "GET",
        headers: { "User-Agent": "external-cron" },
      })

      if (!response.ok) {
        console.error(`[v0-CRON] Signal API returned ${response.status}`)
        results[symbol] = { error: `API returned ${response.status}` }
        return NextResponse.json(results, { status: response.status })
      }

      const signal = await response.json()
      results[symbol] = signal
      
      console.log(`[v0-CRON] Signal received - type=${signal.signal?.type}`)

      // Check if we should send alert
      if (signal.signal?.type === "ENTRY" && signal.signal?.alertLevel >= 1 && process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
        try {
          console.log(`[v0-CRON] Sending Telegram alert`)
          const { TelegramNotifier } = await import("@/lib/telegram")
          const notifier = new TelegramNotifier(
            process.env.TELEGRAM_BOT_TOKEN,
            process.env.TELEGRAM_CHAT_ID,
            "https://traderb.vercel.app",
          )
          await notifier.sendSignalAlert(signal.signal)
          console.log(`[v0-CRON] Alert sent`)
        } catch (err) {
          console.warn(`[v0-CRON] Alert send failed:`, err)
        }
      }

    } catch (error) {
      console.error(`[v0-CRON] Error fetching signal:`, error)
      results[symbol] = { error: String(error) }
      return NextResponse.json(results, { status: 500 })
    }

    const duration = Date.now() - startTime
    console.log(`[v0-CRON] SUCCESS: ${duration}ms, signal=${results[symbol].signal?.type}`)

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      results,
      requestId,
      duration,
    }, { status: 200 })
  } catch (error) {
    console.error(`[v0-CRON] FATAL ERROR:`, error)
    return NextResponse.json(
      { 
        error: String(error), 
        requestId,
        timestamp: new Date().toISOString()
      }, 
      { status: 500 }
    )
  }
}
