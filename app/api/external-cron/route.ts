import { type NextRequest, NextResponse } from "next/server"
import { TRADING_SYMBOLS } from "@/lib/trading-symbols"

export const maxDuration = 60
export const dynamic = "force-dynamic"

/**
 * EXTERNAL CRON ENDPOINT
 * Called by cron-job.org every 5 minutes
 * 
 * Simply proxies to /api/signal/current for each symbol
 * and handles Telegram alerts if needed
 */
export async function GET(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7)
  const startTime = Date.now()
  
  console.log(`[v0] EXTERNAL-CRON STARTED: requestId=${requestId}`)

  try {
    // Verify secret
    const { searchParams } = new URL(request.url)
    const secret = searchParams.get("secret")
    const cronSecret = process.env.CRON_SECRET

    if (!cronSecret) {
      console.error(`[v0] CRON AUTH FAILED: CRON_SECRET not set`)
      return NextResponse.json({ error: "CRON_SECRET not configured", requestId }, { status: 500 })
    }

    if (secret !== cronSecret) {
      console.error(`[v0] CRON AUTH FAILED: Secret mismatch`)
      return NextResponse.json({ error: "Unauthorized", requestId }, { status: 401 })
    }

    console.log(`[v0] CRON AUTH SUCCESS: Processing ${TRADING_SYMBOLS.length} symbol(s)`)

    const baseUrl = request.nextUrl.origin
    const results: Record<string, any> = {}

    // Process each symbol by calling the signal API
    for (const symbol of TRADING_SYMBOLS) {
      try {
        console.log(`[v0] CRON: Fetching signal for ${symbol}`)
        
        const signalUrl = new URL(`/api/signal/current`, baseUrl)
        signalUrl.searchParams.set("symbol", symbol)
        
        const response = await fetch(signalUrl.toString(), {
          method: "GET",
          headers: { "User-Agent": "external-cron" },
        })

        if (!response.ok) {
          console.error(`[v0] CRON: Signal API returned ${response.status} for ${symbol}`)
          results[symbol] = { error: `API returned ${response.status}`, symbol }
          continue
        }

        const signal = await response.json()
        results[symbol] = signal
        
        console.log(`[v0] CRON: ${symbol} signal received - type=${signal.type}`)

        // Check if we should send alert
        if (signal.type === "ENTRY" && signal.alertLevel >= 1 && process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
          try {
            console.log(`[v0] CRON: Sending Telegram alert for ${symbol}`)
            const { TelegramNotifier } = await import("@/lib/telegram")
            const notifier = new TelegramNotifier(
              process.env.TELEGRAM_BOT_TOKEN,
              process.env.TELEGRAM_CHAT_ID,
              "https://traderb.vercel.app",
            )
            await notifier.sendSignalAlert(signal)
            console.log(`[v0] CRON: Alert sent for ${symbol}`)
          } catch (err) {
            console.error(`[v0] CRON: Alert send failed for ${symbol}:`, err)
          }
        }

      } catch (error) {
        console.error(`[v0] CRON: Error processing ${symbol}:`, error)
        results[symbol] = { error: String(error), symbol }
      }
    }

    const duration = Date.now() - startTime
    console.log(`[v0] EXTERNAL-CRON COMPLETED: ${duration}ms, requestId=${requestId}`)

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      results,
      requestId,
      duration,
      symbolsProcessed: TRADING_SYMBOLS.length,
    }, { status: 200 })
  } catch (error) {
    console.error(`[v0] CRON ERROR:`, error)
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
