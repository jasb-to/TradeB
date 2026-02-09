import { type NextRequest, NextResponse } from "next/server"
import { DataFetcher } from "@/lib/data-fetcher"
import { TradingStrategies } from "@/lib/strategies"
import { DEFAULT_TRADING_CONFIG } from "@/lib/default-config"
import { MarketHours } from "@/lib/market-hours"
import { SignalCache } from "@/lib/signal-cache"
import { NearMissTracker } from "@/lib/near-miss-tracker"
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
  
  // CRITICAL FIX #4: Cooldown persistence warning
  // Current implementation: In-memory cooldown WILL reset on cold start/redeploy
  // This creates risk of duplicate alerts. For production, implement:
  // - Vercel KV Store for persistent cooldown tracking
  // - Database-backed cooldown with 1-hour TTL per symbol
  // - Idempotency keys with signal hash + timestamp
  console.log(`[v0] PRODUCTION WARNING: Cooldown tracking is in-memory. Coldstart or redeploy will reset it.`)

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
        
        // ── CRITICAL FIX #3 (TDZ): Declare alertState BEFORE it's used ──
        const alertState = SignalCache.getAlertState(symbol)

        const dataFetcher = new DataFetcher(symbol)

        // ── Fetch each timeframe independently — no Promise.all poisoning ──
        // Critical timeframes throw on failure; non-critical (15m, 5m) gracefully degrade
        let dataDaily, data8h, data4h, data1h
        let data15m: { candles: any[]; source: string } = { candles: [], source: "oanda" }
        let data5m: { candles: any[]; source: string } = { candles: [], source: "oanda" }

        try {
          dataDaily = await dataFetcher.fetchCandles("1d", 200)
        } catch (err) {
          console.error(`[v0] CRON ${symbol} CRITICAL: Daily fetch failed - ${err}`)
          throw err
        }
        try {
          data8h = await dataFetcher.fetchCandles("8h", 200)
        } catch (err) {
          console.error(`[v0] CRON ${symbol} CRITICAL: 8H fetch failed - ${err}`)
          throw err
        }
        try {
          data4h = await dataFetcher.fetchCandles("4h", 200)
        } catch (err) {
          console.error(`[v0] CRON ${symbol} CRITICAL: 4H fetch failed - ${err}`)
          throw err
        }
        try {
          data1h = await dataFetcher.fetchCandles("1h", 200)
        } catch (err) {
          console.error(`[v0] CRON ${symbol} CRITICAL: 1H fetch failed - ${err}`)
          throw err
        }
        try {
          data15m = await dataFetcher.fetchCandles("15m", 200)
        } catch (err) {
          console.warn(`[v0] CRON ${symbol} 15m fetch failed (non-critical): ${err}`)
          data15m = { candles: [], source: "oanda" }
        }
        try {
          data5m = await dataFetcher.fetchCandles("5m", 200)
        } catch (err) {
          console.warn(`[v0] CRON ${symbol} 5m fetch failed (non-critical): ${err}`)
          data5m = { candles: [], source: "oanda" }
        }

        // ── CRITICAL FIX #2: Block synthetic data from entering live trading logic ──
        const sources = [dataDaily.source, data8h.source, data4h.source, data1h.source]
        const hasSyntheticData = sources.some(s => s === "synthetic")
        if (hasSyntheticData) {
          console.error(`[v0] CRON ${symbol} BLOCKED: Synthetic data detected in critical timeframes. Sources: Daily=${dataDaily.source}, 8H=${data8h.source}, 4H=${data4h.source}, 1H=${data1h.source}`)
          results[symbol] = {
            symbol,
            blocked: true,
            reason: "DATA_INVALID",
            message: "Synthetic data detected — no signals, alerts, or cache updates produced",
          }
          await CronHeartbeat.recordFailure(symbol, "Synthetic data detected — fetch failed for critical timeframes")
          console.log(`[v0] CRON-JOB END SYMBOL: ${symbol} (BLOCKED)`)
          continue
        }

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
          const entryDecision = strategies.buildEntryDecision(signal)
          if (!entryDecision.allowed) {
            const indicatorsSnapshot = {
              adx: signal.indicators?.adx || 0,
              atr: signal.indicators?.atr || 0,
              rsi: signal.indicators?.rsi || 0,
              vwap: signal.indicators?.vwap || 0,
            }
            NearMissTracker.recordNearMiss(signal, entryDecision, 6.0, indicatorsSnapshot)
            console.log(`[v0] CRON-JOB: Near-miss recorded for ${symbol}`)
          }
        }

        // Monitor TP1/TP2 levels if active trade exists (ALL tiers: A+, A, B)
        const tpLevels = SignalCache.getTPLevels(symbol)
        if (alertState.activeTrade && tpLevels.tp1) {
          const currentPrice = signal.entryPrice || 0
          const entryPrice = alertState.activeTrade.entryPrice || 0
          const direction = alertState.activeTrade.direction

          // Check if TP1 has been reached
          if (SignalCache.checkTP1Reached(symbol, currentPrice)) {
            if (!alertState.tp1AlertSent && process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID && TelegramNotifier) {
              try {
                const notifier = new TelegramNotifier(
                  process.env.TELEGRAM_BOT_TOKEN,
                  process.env.TELEGRAM_CHAT_ID,
                  "https://tradeb.vercel.app",
                )

                const momentumStatus = (signal.indicators?.stochRSI as any)?.state || "NEUTRAL"
                const adx = signal.indicators?.adx || 0
                const rsi = signal.indicators?.rsi || 50

                const isStrongMomentum = (momentumStatus !== "COMPRESSION" && adx > 20)
                const isFadingMomentum = (momentumStatus === "COMPRESSION" || rsi > 70 || rsi < 30)

                if (isStrongMomentum) {
                  const tp2Message = `TP1 REACHED - HOLD FOR TP2\nSymbol: ${symbol}\nEntry: $${entryPrice.toFixed(2)} | TP1: $${tpLevels.tp1.toFixed(2)} | TP2: $${tpLevels.tp2?.toFixed(2) || "N/A"}\nCurrent: $${currentPrice.toFixed(2)}\nMomentum: STRONG (${momentumStatus}) ADX:${adx.toFixed(1)} RSI:${rsi.toFixed(1)}\nAction: HOLD for TP2\nTime: ${new Date().toISOString()}`
                  await notifier.sendMessage(tp2Message, false)
                  console.log(`[v0] TP1 reached - HOLDING for TP2 for ${symbol}`)
                } else if (isFadingMomentum) {
                  const tp1ExitMessage = `TP1 REACHED - EXIT NOW\nSymbol: ${symbol}\nEntry: $${entryPrice.toFixed(2)} | TP1: $${tpLevels.tp1.toFixed(2)}\nCurrent: $${currentPrice.toFixed(2)}\nMomentum: WEAK (${momentumStatus})\nAction: EXIT at TP1\nTime: ${new Date().toISOString()}`
                  await notifier.sendMessage(tp1ExitMessage, false)
                  console.log(`[v0] TP1 reached - EXITING for ${symbol}`)
                  SignalCache.clearActiveTrade(symbol)
                  SignalCache.clearTPLevels(symbol)
                } else {
                  const tp1ExitMessage = `TP1 REACHED - TAKE PROFIT\nSymbol: ${symbol}\nEntry: $${entryPrice.toFixed(2)} | TP1: $${tpLevels.tp1.toFixed(2)}\nCurrent: $${currentPrice.toFixed(2)}\nMomentum: NEUTRAL\nAction: TAKE PROFIT at TP1\nTime: ${new Date().toISOString()}`
                  await notifier.sendMessage(tp1ExitMessage, false)
                  console.log(`[v0] TP1 reached - EXITING for ${symbol} (neutral)`)
                  SignalCache.clearActiveTrade(symbol)
                  SignalCache.clearTPLevels(symbol)
                }

                SignalCache.recordTP1Alert(symbol)
              } catch (error) {
                console.error(`[v0] TP1 alert failed for ${symbol}:`, error)
              }
            }
          }

          // Check if TP2 has been reached
          if (tpLevels.tp2 && SignalCache.checkTP2Reached(symbol, currentPrice) && tpLevels.tp1Reached) {
            console.log(`[v0] TP2 REACHED for ${symbol} at $${currentPrice.toFixed(2)}`)
            if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID && TelegramNotifier) {
              try {
                const notifier = new TelegramNotifier(
                  process.env.TELEGRAM_BOT_TOKEN,
                  process.env.TELEGRAM_CHAT_ID,
                  "https://tradeb.vercel.app",
                )
                const tp2ExitMessage = `TP2 REACHED - FULL SCALE OUT\nSymbol: ${symbol}\nEntry: $${entryPrice.toFixed(2)} | TP2: $${tpLevels.tp2.toFixed(2)}\nCurrent: $${currentPrice.toFixed(2)}\nTrade Complete\nTime: ${new Date().toISOString()}`
                await notifier.sendMessage(tp2ExitMessage, false)
                console.log(`[v0] TP2 alert sent for ${symbol}`)
              } catch (error) {
                console.error(`[v0] TP2 alert failed for ${symbol}:`, error)
              }
            }
            SignalCache.clearActiveTrade(symbol)
            SignalCache.clearTPLevels(symbol)
          }
        }

        const shouldAlert = SignalCache.shouldSendAlert(signalWithSymbol, symbol)
        console.log(`[v0] CRON-JOB ${symbol} signal generated: type=${signal.type} dir=${signal.direction} level=${signal.alertLevel} shouldAlert=${shouldAlert}`)

        // Direction-change detection for active trades
        if (alertState.activeTrade && alertState.activeTrade.direction && signal.direction !== alertState.activeTrade.direction) {
          console.log(`[v0] DIRECTION CHANGE DETECTED for ${symbol}: ${alertState.activeTrade.direction} -> ${signal.direction}`)
          
          if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID && TelegramNotifier) {
            try {
              const notifier = new TelegramNotifier(
                process.env.TELEGRAM_BOT_TOKEN,
                process.env.TELEGRAM_CHAT_ID,
                "https://tradeb.vercel.app",
              )
              const exitMessage = `DIRECTION CHANGE ALERT for ${symbol}\n\n` +
                `Previous: ${alertState.activeTrade.direction} @ ${alertState.activeTrade.entryPrice?.toFixed(2)}\n` +
                `Current: ${signal.direction} @ ${signal.entryPrice?.toFixed(2)}\n\n` +
                `Action: Close ${alertState.activeTrade.direction === "LONG" ? "SELL" : "BUY"} trade immediately\n` +
                `Time: ${new Date().toLocaleTimeString()}`
              
              await notifier.sendDirectionChangeAlert(symbol, exitMessage)
              SignalCache.clearActiveTrade(symbol)
              console.log(`[v0] Direction-change alert sent for ${symbol}`)
            } catch (error) {
              console.error(`[v0] Direction-change alert failed for ${symbol}:`, error)
            }
          }
        }

        // Never alert on cached signals when market is closed
        const currentMarketStatus = MarketHours.getMarketStatus()
        const isMarketClosed = !currentMarketStatus.isOpen
        const isAlert = shouldAlert && signal.type === "ENTRY" && signal.alertLevel >= 1 && !isMarketClosed

        // Store TP levels for ALL tiers (A+, A, B) for automatic monitoring
        if (signal.type === "ENTRY" && signal.alertLevel >= 1 && !isMarketClosed) {
          const state = SignalCache.getAlertState(symbol)
          if (!state.activeTrade) {
            state.activeTrade = signalWithSymbol
            state.activeTradeTime = Date.now()
            
            if (signalWithSymbol.takeProfit1 && signalWithSymbol.takeProfit2) {
              SignalCache.storeTakeProfitLevels(symbol, signalWithSymbol.takeProfit1, signalWithSymbol.takeProfit2)
              console.log(`[v0] TP levels stored for ${symbol}: TP1=$${signalWithSymbol.takeProfit1.toFixed(2)}, TP2=$${signalWithSymbol.takeProfit2.toFixed(2)}`)
            }
          }
        }

        if (isAlert && process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
          console.log(`[v0] CRON-JOB Sending Telegram for ${symbol}`)
          
          if (!TelegramNotifier) {
            console.warn(`[v0] CRON-JOB Alert skipped for ${symbol}: TelegramNotifier not available`)
          } else {
            try {
              const notifier = new TelegramNotifier(
                process.env.TELEGRAM_BOT_TOKEN,
                process.env.TELEGRAM_CHAT_ID,
                "https://tradeb.vercel.app",
              )
              await notifier.sendSignalAlert(signalWithSymbol)
              SignalCache.recordAlert(signalWithSymbol, symbol)
              console.log(`[v0] CRON-JOB Telegram SENT for ${symbol}: ${signalWithSymbol.type} ${signalWithSymbol.direction}`)
            } catch (telegramError) {
              console.error(`[v0] CRON-JOB Telegram error for ${symbol}:`, telegramError)
            }
          }
        } else {
          const reason = !shouldAlert ? "cooldown/duplicate" : isMarketClosed ? "market closed (cached signal blocked)" : !process.env.TELEGRAM_BOT_TOKEN ? "no token" : "no chat ID"
          console.log(`[v0] CRON-JOB Alert skipped for ${symbol}: ${reason}`)
        }

        results[symbol] = signalWithSymbol
      } catch (error) {
        console.error(`[v0] CRON-JOB ERROR processing ${symbol}:`, error)
        await CronHeartbeat.recordFailure(symbol, error as Error)
        results[symbol] = { error: String(error), symbol }
      }
      
      // Record successful execution heartbeat
      if (!results[symbol]?.error) {
        await CronHeartbeat.recordExecution(symbol)
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
