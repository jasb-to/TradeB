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
              adx: signal.indicators?.adx || 0,
              atr: signal.indicators?.atr || 0,
              rsi: signal.indicators?.rsi || 0,
              vwap: signal.indicators?.vwap || 0,
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

        // NEW: Monitor TP1/TP2 levels if active trade exists
        const tpLevels = SignalCache.getTPLevels(symbol)
        if (alertState.activeTrade && tpLevels.tp1) {
          const currentPrice = signal.entryPrice || 0
          const entryPrice = alertState.activeTrade.entryPrice || 0
          const direction = alertState.activeTrade.direction

          // Check if TP1 has been reached
          if (SignalCache.checkTP1Reached(symbol, currentPrice)) {
            // TP1 reached - now decide: exit at TP1 or hold for TP2
            if (!alertState.tp1AlertSent && process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID && TelegramNotifier) {
              try {
                const notifier = new TelegramNotifier(
                  process.env.TELEGRAM_BOT_TOKEN,
                  process.env.TELEGRAM_CHAT_ID,
                  "https://tradeb.vercel.app",
                )

                // Analyze momentum to decide exit or hold for TP2
                const momentumStatus = signal.indicators?.stochRSI?.state || "NEUTRAL"
                const adx = signal.indicators?.adx || 0
                const rsi = signal.indicators?.rsi || 50

                // Logic: If momentum is strong (MOMENTUM_UP/DOWN and high ADX), hold for TP2
                // If momentum is weak (COMPRESSION) or fading, exit at TP1
                const isStrongMomentum = (momentumStatus !== "COMPRESSION" && adx > 20)
                const isFadingMomentum = (momentumStatus === "COMPRESSION" || rsi > 70 || rsi < 30)

                if (isStrongMomentum) {
                  // Market looks strong - hold for TP2
                  const tp2Message = `📈 TP1 REACHED - HOLD FOR TP2
═══════════════════════════
Symbol: ${symbol}
Entry Price: $${entryPrice.toFixed(2)}
TP1 Level: $${tpLevels.tp1.toFixed(2)}
TP2 Level: $${tpLevels.tp2?.toFixed(2) || "N/A"}
Current Price: $${currentPrice.toFixed(2)}
Profit at TP1: +${((currentPrice - entryPrice) / entryPrice * 100).toFixed(2)}%

📊 Market Momentum: STRONG (${momentumStatus})
ADX: ${adx.toFixed(2)} | RSI: ${rsi.toFixed(2)}

💪 Action: HOLD position for TP2
🎯 Target: $${tpLevels.tp2?.toFixed(2) || "N/A"}
🔒 SL: $${entryPrice.toFixed(2)} (Entry)

⏰ Time: ${new Date().toISOString()}
═══════════════════════════`

                  await notifier.sendMessage(tp2Message, false)
                  console.log(`[v0] TP1 reached - HOLDING for TP2 for ${symbol} (momentum: ${momentumStatus})`)
                } else if (isFadingMomentum) {
                  // Momentum fading - exit at TP1
                  const tp1ExitMessage = `🛑 TP1 REACHED - EXIT NOW
═══════════════════════════
Symbol: ${symbol}
Entry Price: $${entryPrice.toFixed(2)}
TP1 Level: $${tpLevels.tp1.toFixed(2)}
Current Price: $${currentPrice.toFixed(2)}
Profit at TP1: +${((currentPrice - entryPrice) / entryPrice * 100).toFixed(2)}%

📊 Market Momentum: WEAK (${momentumStatus})
ADX: ${adx.toFixed(2)} | RSI: ${rsi.toFixed(2)}

⚠️ Action: EXIT at TP1 - Momentum fading
Take your profit and close this position.

⏰ Time: ${new Date().toISOString()}
═══════════════════════════`

                  await notifier.sendMessage(tp1ExitMessage, false)
                  console.log(`[v0] TP1 reached - EXITING for ${symbol} (momentum fading: ${momentumStatus})`)
                  SignalCache.clearActiveTrade(symbol)
                  SignalCache.clearTPLevels(symbol)
                } else {
                  // Neutral - default to exiting at TP1
                  const tp1ExitMessage = `✅ TP1 REACHED - TAKE PROFIT
═══════════════════════════
Symbol: ${symbol}
Entry Price: $${entryPrice.toFixed(2)}
TP1 Level: $${tpLevels.tp1.toFixed(2)}
Current Price: $${currentPrice.toFixed(2)}
Profit at TP1: +${((currentPrice - entryPrice) / entryPrice * 100).toFixed(2)}%

📊 Market Momentum: NEUTRAL

💰 Action: TAKE PROFIT at TP1

⏰ Time: ${new Date().toISOString()}
═══════════════════════════`

                  await notifier.sendMessage(tp1ExitMessage, false)
                  console.log(`[v0] TP1 reached - EXITING for ${symbol} (neutral momentum)`)
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
                const tp2ExitMessage = `🎉 TP2 REACHED - FULL SCALE OUT
═══════════════════════════
Symbol: ${symbol}
Entry Price: $${entryPrice.toFixed(2)}
TP2 Level: $${tpLevels.tp2.toFixed(2)}
Current Price: $${currentPrice.toFixed(2)}
Total Profit: +${((currentPrice - entryPrice) / entryPrice * 100).toFixed(2)}%

✅ Trade Complete - Full position closed
Great trade execution!

⏰ Time: ${new Date().toISOString()}
═══════════════════════════`

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

        // NEW FEATURE: Direction-change detection for active trades
        const alertState = SignalCache.getAlertState(symbol)
        if (alertState.activeTrade && alertState.activeTrade.direction && signal.direction !== alertState.activeTrade.direction) {
          console.log(`[v0] DIRECTION CHANGE DETECTED for ${symbol}: ${alertState.activeTrade.direction} -> ${signal.direction}`)
          
          if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID && TelegramNotifier) {
            try {
              const notifier = new TelegramNotifier(
                process.env.TELEGRAM_BOT_TOKEN,
                process.env.TELEGRAM_CHAT_ID,
                "https://tradeb.vercel.app",
              )
              const exitMessage = `📊 DIRECTION CHANGE ALERT for ${symbol}\n\n` +
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

        // CRITICAL FIX #7: Never alert on cached signals when market is closed
        const marketStatus = MarketHours.getMarketStatus()
        const isMarketClosed = !marketStatus.isOpen
        const isAlert = shouldAlert && signal.type === "ENTRY" && signal.alertLevel >= 2 && !isMarketClosed

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
              // Store as active trade for direction-change monitoring
              const state = SignalCache.getAlertState(symbol)
              state.activeTrade = signalWithSymbol
              state.activeTradeTime = Date.now()
              
              // Store TP1/TP2 levels for TP monitoring
              if (signalWithSymbol.takeProfit1 && signalWithSymbol.takeProfit2) {
                SignalCache.storeTakeProfitLevels(symbol, signalWithSymbol.takeProfit1, signalWithSymbol.takeProfit2)
                console.log(`[v0] TP levels stored: TP1=$${signalWithSymbol.takeProfit1.toFixed(2)}, TP2=$${signalWithSymbol.takeProfit2.toFixed(2)}`)
              }
              
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
