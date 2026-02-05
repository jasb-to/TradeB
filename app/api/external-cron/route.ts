import { type NextRequest, NextResponse } from "next/server"
import { DataFetcher } from "@/lib/data-fetcher"
import { TradingStrategies } from "@/lib/strategies"
import { DEFAULT_TRADING_CONFIG } from "@/lib/default-config"
import { MarketHours } from "@/lib/market-hours"
import { SignalCache } from "@/lib/signal-cache"
import { NearMissTracker } from "@/lib/near-miss-tracker"
import { BTradeEvaluator } from "@/lib/b-trade-evaluator"
import { BTradeTracker } from "@/lib/b-trade-tracker"
import { CronHeartbeat } from "@/lib/cron-heartbeat"

// Dynamically import TelegramNotifier to handle potential import failures
let TelegramNotifier: any = null
try {
  const telegram = require("@/lib/telegram")
  TelegramNotifier = telegram.TelegramNotifier
} catch (err) {
  console.warn("[v0] EXTERNAL-CRON: Failed to import TelegramNotifier, alerts will be disabled:", err)
}

export const maxDuration = 60
export const dynamic = "force-dynamic"

const TRADING_SYMBOLS = ["XAU_USD", "XAG_USD"]

export async function GET(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7)
  const startTime = Date.now()
  
  console.log(`[v0] EXTERNAL-CRON STARTED: requestId=${requestId}`)

  try {
    const { searchParams } = new URL(request.url)
    const secret = searchParams.get("secret")
    const cronSecret = process.env.CRON_SECRET

    // Verify secret with detailed logging
    if (!cronSecret) {
      console.error(`[v0] CRON-JOB AUTH FAILED: CRON_SECRET env var not set`)
      return NextResponse.json({ error: "CRON_SECRET not configured", requestId }, { status: 500 })
    }

    if (secret !== cronSecret) {
      console.error(`[v0] CRON-JOB AUTH FAILED: Secret mismatch. Provided=${secret ? "yes" : "no"}, Expected=set`)
      return NextResponse.json({ error: "Unauthorized", requestId }, { status: 401 })
    }

    console.log(`[v0] CRON-JOB AUTH SUCCESS: requestId=${requestId}`)

    // Check market hours with logging
    const marketStatus = MarketHours.getMarketStatus()
    if (!marketStatus.isOpen) {
      console.log(`[v0] CRON-JOB MARKET CLOSED: ${marketStatus.message}`)
      // Record that we checked even though market was closed
      for (const symbol of TRADING_SYMBOLS) {
        CronHeartbeat.recordExecution(symbol)
      }
      return NextResponse.json({
        success: true,
        marketClosed: true,
        message: marketStatus.message,
        timestamp: new Date().toISOString(),
        requestId,
      })
    }

    console.log(`[v0] CRON-JOB PROCESSING 2 symbols`)

    const results: Record<string, any> = {}

    for (const symbol of TRADING_SYMBOLS) {
      try {
        console.log(`[v0] CRON-JOB START SYMBOL: ${symbol}`)
        
        const dataFetcher = new DataFetcher(symbol)
        const [dataDaily, data8h, data4h, data1h, data15m, data5m] = await Promise.all([
          dataFetcher.fetchCandles("1d", 200),
          dataFetcher.fetchCandles("8h", 200),
          dataFetcher.fetchCandles("4h", 200),
          dataFetcher.fetchCandles("1h", 200),
          dataFetcher.fetchCandles("15m", 200).catch(() => ({ candles: [] })),
          dataFetcher.fetchCandles("5m", 200).catch(() => ({ candles: [] })),
        ])

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

        // NEAR-MISS TRACKING (Diagnostic Only)
        if (signal.type === "ENTRY") {
          const entryDecision = TradingStrategies.prototype.buildEntryDecision(signal)
          if (!entryDecision.allowed) {
            const indicatorsSnapshot = {
              adx: signal.adx,
              atr: signal.atr,
              rsi: signal.rsi,
              vwap: signal.vwap,
            }
            NearMissTracker.recordNearMiss(signal, entryDecision, 6.0, indicatorsSnapshot)
            console.log(`[v0] CRON-JOB: Near-miss recorded for ${symbol}`)
          }

          // B-TRADE EVALUATION (Diagnostic Only)
          if (!entryDecision.allowed) {
            const bEvaluation = BTradeEvaluator.evaluateBSetup(signal, entryDecision)
            if (bEvaluation.isValid) {
              BTradeTracker.recordBSetup(signal, bEvaluation, symbol)
              console.log(`[v0] CRON-JOB: B_SETUP recorded for ${symbol} - ${bEvaluation.classification}`)
            }
          }
        }

        const shouldAlert = SignalCache.shouldSendAlert(signalWithSymbol, symbol)
        console.log(`[v0] CRON-JOB ${symbol} signal generated: type=${signal.type} dir=${signal.direction} level=${signal.alertLevel} shouldAlert=${shouldAlert}`)

        if (shouldAlert && process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
          console.log(`[v0] CRON-JOB Sending Telegram for ${symbol}`)
          
          if (!TelegramNotifier) {
            console.warn(`[v0] CRON-JOB Alert skipped for ${symbol}: TelegramNotifier not available`)
          } else {
            try {
              const notifier = new TelegramNotifier(
                process.env.TELEGRAM_BOT_TOKEN,
                process.env.TELEGRAM_CHAT_ID,
                "https://xptswitch.vercel.app",
              )
              await notifier.sendSignalAlert(signalWithSymbol)
              SignalCache.recordAlert(signalWithSymbol, symbol)
              console.log(`[v0] CRON-JOB Telegram SENT for ${symbol}: ${signalWithSymbol.type} ${signalWithSymbol.direction}`)
            } catch (telegramError) {
              console.error(`[v0] CRON-JOB Telegram error for ${symbol}:`, telegramError)
            }
          }
        } else {
          const reason = !shouldAlert ? "cooldown/duplicate" : !process.env.TELEGRAM_BOT_TOKEN ? "no token" : "no chat ID"
          console.log(`[v0] CRON-JOB Alert skipped for ${symbol}: ${reason}`)
        }

        results[symbol] = signalWithSymbol
      } catch (error) {
        console.error(`[v0] CRON-JOB ERROR processing ${symbol}:`, error)
        CronHeartbeat.recordFailure(symbol, error as Error)
        results[symbol] = { error: String(error), symbol }
      }
      
      // Record successful execution heartbeat
      if (!results[symbol]?.error) {
        CronHeartbeat.recordExecution(symbol)
      }
      
      console.log(`[v0] CRON-JOB END SYMBOL: ${symbol}`)
    }

    const duration = Date.now() - startTime
    console.log(`[v0] EXTERNAL-CRON COMPLETED: requestId=${requestId} duration=${duration}ms XAU=${results["XAU_USD"] ? "✓" : "✗"} XAG=${results["XAG_USD"] ? "✓" : "✗"}`)

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      results,
      requestId,
      duration,
    })
  } catch (error) {
    console.error(`[v0] EXTERNAL-CRON ERROR:`, error)
    return NextResponse.json({ error: String(error), requestId }, { status: 500 })
  }
}
