import { type NextRequest, NextResponse } from "next/server"
import { DataFetcher } from "@/lib/data-fetcher"
import { TradingStrategies } from "@/lib/strategies"
import { DEFAULT_TRADING_CONFIG } from "@/lib/default-config"
import { MarketHours } from "@/lib/market-hours"
import { SignalCache } from "@/lib/signal-cache"
import { CronHeartbeat } from "@/lib/cron-heartbeat"
import { TRADING_SYMBOLS } from "@/lib/trading-symbols"

export const maxDuration = 60
export const dynamic = "force-dynamic"

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

    console.log(`[v0] CRON AUTH SUCCESS`)

    // Check market hours
    const marketStatus = MarketHours.getMarketStatus()
    if (!marketStatus.isOpen) {
      console.log(`[v0] CRON MARKET CLOSED`)
      return NextResponse.json({
        success: true,
        marketClosed: true,
        message: marketStatus.message,
        timestamp: new Date().toISOString(),
        requestId,
      })
    }

    console.log(`[v0] CRON PROCESSING: ${TRADING_SYMBOLS.join(", ")}`)

    const results: Record<string, any> = {}

    for (const symbol of TRADING_SYMBOLS) {
      try {
        console.log(`[v0] CRON: Processing ${symbol}`)
        
        const dataFetcher = new DataFetcher(symbol)

        // Fetch candles for all timeframes
        const dataDaily = await dataFetcher.fetchCandles("1d", 200)
        const data8h = await dataFetcher.fetchCandles("8h", 200)
        const data4h = await dataFetcher.fetchCandles("4h", 200)
        const data1h = await dataFetcher.fetchCandles("1h", 200)
        
        let data15m = { candles: [], source: "oanda" }
        let data5m = { candles: [], source: "oanda" }
        
        try {
          data15m = await dataFetcher.fetchCandles("15m", 200)
        } catch (e) {
          console.warn(`[v0] CRON: 15m fetch failed for ${symbol}`)
        }
        
        try {
          data5m = await dataFetcher.fetchCandles("5m", 200)
        } catch (e) {
          console.warn(`[v0] CRON: 5m fetch failed for ${symbol}`)
        }

        // Check for synthetic data
        const sources = [dataDaily.source, data8h.source, data4h.source, data1h.source]
        if (sources.some(s => s === "synthetic")) {
          console.error(`[v0] CRON: Synthetic data detected for ${symbol}`)
          results[symbol] = { error: "Synthetic data", symbol }
          continue
        }

        // Evaluate signal
        const strategies = new TradingStrategies(DEFAULT_TRADING_CONFIG)
        const signal = await strategies.evaluateSignals(
          dataDaily.candles,
          data8h.candles,
          data4h.candles,
          data1h.candles,
          data15m.candles,
          data5m.candles,
        )

        const signalWithSymbol = { ...signal, symbol }
        SignalCache.set(signalWithSymbol, symbol)

        // Check if we should send alert
        const shouldAlert = SignalCache.shouldSendAlert(signalWithSymbol, symbol)
        const isAlert = shouldAlert && signal.type === "ENTRY" && signal.alertLevel >= 1

        if (isAlert && process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
          try {
            const { TelegramNotifier } = await import("@/lib/telegram")
            const notifier = new TelegramNotifier(
              process.env.TELEGRAM_BOT_TOKEN,
              process.env.TELEGRAM_CHAT_ID,
              "https://traderb.vercel.app",
            )
            await notifier.sendSignalAlert(signalWithSymbol)
            SignalCache.recordAlert(signalWithSymbol, symbol)
            console.log(`[v0] CRON: Alert sent for ${symbol}`)
          } catch (err) {
            console.error(`[v0] CRON: Alert failed for ${symbol}:`, err)
          }
        }

        results[symbol] = signalWithSymbol
        await CronHeartbeat.recordExecution(symbol)
        console.log(`[v0] CRON: ${symbol} complete`)
      } catch (error) {
        console.error(`[v0] CRON: Error processing ${symbol}:`, error)
        results[symbol] = { error: String(error), symbol }
        await CronHeartbeat.recordFailure(symbol, error as Error)
      }
    }

    const duration = Date.now() - startTime
    console.log(`[v0] EXTERNAL-CRON COMPLETED: ${duration}ms`)

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      results,
      requestId,
      duration,
    })
  } catch (error) {
    console.error(`[v0] CRON ERROR:`, error)
    return NextResponse.json({ error: String(error), requestId: "unknown" }, { status: 500 })
  }
}
