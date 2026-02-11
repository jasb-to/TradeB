import { NextResponse } from "next/server"
import { DataFetcher } from "@/lib/data-fetcher"
import { TradingStrategies } from "@/lib/strategies"
import { DEFAULT_TRADING_CONFIG } from "@/lib/default-config"
import { MarketHours } from "@/lib/market-hours"
import { SignalCache } from "@/lib/signal-cache"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

let lastValidSignals: { [key: string]: any } = {
  XAU_USD: null,
  XAG_USD: null,
}
let lastValidTimestamps: { [key: string]: string | null } = {
  XAU_USD: null,
  XAG_USD: null,
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const symbol = (searchParams.get("symbol") || "XAU_USD") as "XAU_USD" | "XAG_USD"

    const marketStatus = MarketHours.getMarketStatus()

    const dataFetcher = new DataFetcher(symbol)
    const strategies = new TradingStrategies(DEFAULT_TRADING_CONFIG)

    strategies.setDataSource("oanda")

    let dataDaily, data8h, data4h, data1h, data15m, data5m

    try {
      dataDaily = await dataFetcher.fetchCandles("1d", 100)
      data8h = await dataFetcher.fetchCandles("8h", 200)
      data4h = await dataFetcher.fetchCandles("4h", 200)
      data1h = await dataFetcher.fetchCandles("1h", 200)

      const [result15m, result5m] = await Promise.allSettled([
        dataFetcher.fetchCandles("15m", 200),
        dataFetcher.fetchCandles("5m", 200),
      ])

      data15m = result15m.status === "fulfilled" ? result15m.value : { candles: [], source: "oanda" as const }
      data5m = result5m.status === "fulfilled" ? result5m.value : { candles: [], source: "oanda" as const }

      console.log(
        `[v0] Data loaded: Daily=${dataDaily.candles.length}, 4H=${data4h.candles.length}, 1H=${data1h.candles.length}, 15M=${data15m.candles.length}, 5M=${data5m.candles.length} (source: OANDA)`,
      )

      // CRITICAL FIX #2: Block synthetic data from producing signals
      const criticalSources = [dataDaily.source, data8h.source, data4h.source, data1h.source]
      if (criticalSources.some(s => s === "synthetic")) {
        console.error(`[v0] ${symbol} BLOCKED: Synthetic data detected in critical timeframes`)
        return NextResponse.json(
          {
            success: false,
            error: "DATA_INVALID",
            message: "Synthetic data detected — no signals produced",
            symbol,
          },
          { status: 503 },
        )
      }
    } catch (fetchError) {
      console.error("Error fetching candle data:", fetchError)
      return NextResponse.json(
        {
          success: false,
          error: "Failed to fetch market data. Please check OANDA API configuration.",
          details: fetchError instanceof Error ? fetchError.message : "Unknown fetch error",
        },
        { status: 500 },
      )
    }

    const lastDailyCandle = dataDaily.candles?.[dataDaily.candles.length - 1]
    const last1hCandle = data1h.candles?.[data1h.candles.length - 1]

    // Build MTF bias from latest candle directions
    const mtfBias = {
      daily: (lastDailyCandle?.close
        ? lastDailyCandle.close > (dataDaily.candles?.[dataDaily.candles.length - 2]?.close || 0)
          ? "LONG"
          : "SHORT"
        : "NEUTRAL") as "LONG" | "SHORT" | "NEUTRAL",
      "8h": (data8h.candles?.length
        ? data8h.candles[data8h.candles.length - 1].close > (data8h.candles[data8h.candles.length - 2]?.close || 0)
          ? "LONG"
          : "SHORT"
        : "NEUTRAL") as "LONG" | "SHORT" | "NEUTRAL",
      "4h": (data4h.candles?.length
        ? data4h.candles[data4h.candles.length - 1].close > (data4h.candles[data4h.candles.length - 2]?.close || 0)
          ? "LONG"
          : "SHORT"
        : "NEUTRAL") as "LONG" | "SHORT" | "NEUTRAL",
      "1h": (last1hCandle?.close
        ? last1hCandle.close > (data1h.candles?.[data1h.candles.length - 2]?.close || 0)
          ? "LONG"
          : "SHORT"
        : "NEUTRAL") as "LONG" | "SHORT" | "NEUTRAL",
      "15m": (data15m.candles?.length
        ? data15m.candles[data15m.candles.length - 1].close > (data15m.candles[data15m.candles.length - 2]?.close || 0)
          ? "LONG"
          : "SHORT"
        : "NEUTRAL") as "LONG" | "SHORT" | "NEUTRAL",
      "5m": (data5m.candles?.length
        ? data5m.candles[data5m.candles.length - 1].close > (data5m.candles[data5m.candles.length - 2]?.close || 0)
          ? "LONG"
          : "SHORT"
        : "NEUTRAL") as "LONG" | "SHORT" | "NEUTRAL",
    }

    if (!marketStatus.isOpen) {
      console.log(`[v0] Market is closed (${marketStatus.message}). Checking for cached signal...`)
      if (lastValidSignals[symbol] && lastValidTimestamps[symbol]) {
        console.log(`[v0] Returning cached signal for ${symbol}`)
        // Ensure cached signal has entryDecision
        const cachedSignal = lastValidSignals[symbol]
        if (!cachedSignal.entryDecision) {
          cachedSignal.entryDecision = strategies.buildEntryDecision(cachedSignal)
        }
        return NextResponse.json({
          success: true,
          signal: cachedSignal,
          timestamp: lastValidTimestamps[symbol],
          marketClosed: true,
          marketStatus: marketStatus.message,
          mtfBias: mtfBias,
        })
      }

      // Even if market is closed, try to provide fresh data if we have it
      // This allows the system to continue functioning over weekends with synthetic/cached data
      console.log(`[v0] No cached signal available. Proceeding with fresh evaluation even though market is reported as closed.`)
      // Do NOT return 503 - continue processing below
    }

    // When market is open and we have fresh candle data, ALWAYS do a fresh
    // evaluation instead of returning stale cache.  The cache is only used as
    // a fallback when fresh data is unavailable (e.g., data fetch failed above).
    if (!dataDaily?.candles?.length || !data1h?.candles?.length) {
      // No fresh data -- try cache as fallback
      const cached = SignalCache.get(symbol)
      if (cached) {
        if (!cached.entryDecision) {
          cached.entryDecision = strategies.buildEntryDecision(cached)
        }
        return NextResponse.json({
          success: true,
          signal: cached,
          timestamp: new Date(SignalCache.getTimestamp(symbol)).toISOString(),
          marketClosed: false,
          cached: true,
          mtfBias: mtfBias,
        })
      }
      return NextResponse.json(
        {
          success: false,
          error: "Insufficient market data available",
        },
        { status: 503 },
      )
    }

    const signal = await strategies.evaluateSignals(
      dataDaily.candles,
      data8h.candles,
      data4h.candles,
      data1h.candles,
      data15m.candles,
      data5m.candles,
    )

    // Calculate ATR-based trade setup for LONG/SHORT signals
    const atr = signal.indicators?.atr || 1.0
    const entryPrice = last1hCandle?.close || 0
    const stopLoss = signal.direction === "LONG" ? entryPrice - atr * 1.5 : entryPrice + atr * 1.5
    const takeProfit1 = signal.direction === "LONG" ? entryPrice + atr * 1.5 : entryPrice - atr * 1.5
    const takeProfit2 = signal.direction === "LONG" ? entryPrice + atr * 2.5 : entryPrice - atr * 2.5

    // Enhance signal with last candle data and trade setup for client display
    const enhancedSignal = {
      ...signal,
      mtfBias,
      entryPrice: signal.direction ? entryPrice : undefined,
      stopLoss: signal.direction ? stopLoss : undefined,
      takeProfit1: signal.direction ? takeProfit1 : undefined,
      takeProfit2: signal.direction ? takeProfit2 : undefined,
      riskReward: signal.direction ? Number(((takeProfit2 - entryPrice) / Math.abs(entryPrice - stopLoss)).toFixed(2)) : undefined,
      lastCandle: last1hCandle
        ? {
            close: last1hCandle.close,
            atr: signal.indicators?.atr,
            adx: signal.indicators?.adx,
            stochRSI: signal.indicators?.stochRSI,
            vwap: signal.indicators?.vwap,
            timestamp: last1hCandle.timestamp,
          }
        : undefined,
    }

    // Build entry decision for checklist display
    const entryDecision = strategies.buildEntryDecision(enhancedSignal)
    enhancedSignal.entryDecision = entryDecision

    SignalCache.set(enhancedSignal, symbol)

    lastValidSignals[symbol] = enhancedSignal
    lastValidTimestamps[symbol] = new Date().toISOString()

    // ALERTS: Send telegram notification if conditions met
    try {
      console.log(`[v0] DEBUG: Entering alert flow - type=${enhancedSignal.type} direction=${enhancedSignal.direction} alertLevel=${enhancedSignal.alertLevel}`)
      console.log(`[v0] DEBUG: entryDecision.allowed=${entryDecision.allowed} market_closed=${marketStatus.isClosed}`)
      
      let alertCheck: any = null
      let tierUpgraded = false
      
      try {
        alertCheck = SignalCache.canAlertSetup(enhancedSignal, symbol)
        console.log(`[v0] Alert Check: ${alertCheck.reason}`)
      } catch (checkError) {
        console.error("[v0] Error in canAlertSetup:", checkError)
        alertCheck = { allowed: false, reason: `canAlertSetup error: ${checkError}` }
      }
      
      try {
        tierUpgraded = SignalCache.hastierUpgraded(symbol, entryDecision.tier)
      } catch (tierError) {
        console.error("[v0] Error in hastierUpgraded:", tierError)
        tierUpgraded = false
      }

      if (!marketStatus.isClosed && alertCheck && alertCheck.allowed && entryDecision.allowed && enhancedSignal.type === "ENTRY" && enhancedSignal.alertLevel >= 2) {
        if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
          try {
            const { TelegramNotifier } = await import("@/lib/telegram")
            const notifier = new TelegramNotifier(
              process.env.TELEGRAM_BOT_TOKEN,
              process.env.TELEGRAM_CHAT_ID,
              "https://xptswitch.vercel.app"
            )
            console.log(`[v0] SENDING TELEGRAM ALERT: ${enhancedSignal.type} ${enhancedSignal.direction} for ${symbol}`)
            await notifier.sendSignalAlert(enhancedSignal)
            
            SignalCache.recordAlertSent(enhancedSignal, symbol)
            SignalCache.setTradeState(symbol, "IN_TRADE", "ENTRY alert sent")
            SignalCache.updateTier(symbol, entryDecision.tier)
            console.log(`[v0] TELEGRAM ALERT SENT for ${symbol}`)
          } catch (telegramError) {
            console.error("[v0] Failed to send Telegram alert:", telegramError)
          }
        } else {
          console.log(`[v0] Telegram not configured - BOT_TOKEN=${!!process.env.TELEGRAM_BOT_TOKEN} CHAT_ID=${!!process.env.TELEGRAM_CHAT_ID}`)
        }
      } else if (!marketStatus.isClosed && tierUpgraded && entryDecision.allowed) {
        if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
          try {
            const { TelegramNotifier } = await import("@/lib/telegram")
            const notifier = new TelegramNotifier(
              process.env.TELEGRAM_BOT_TOKEN,
              process.env.TELEGRAM_CHAT_ID,
              "https://xptswitch.vercel.app"
            )
            
            const oldTier = (SignalCache as any).getTradeState?.(symbol)?.lastTier || "?"
            console.log(`[v0] SENDING TIER UPGRADE ALERT: ${symbol} upgraded to ${entryDecision.tier}`)
            
            const tierUpgradeMessage = `
🚀 TIER UPGRADE ALERT - ${symbol}
═══════════════════════════════════════
Your ${symbol} trade has UPGRADED to a higher tier!

Previous Tier: ${oldTier}
NEW Tier: ${entryDecision.tier} (Score ${entryDecision.score.toFixed(1)}/9)

📊 ACTION REQUIRED:
• Increase position size: Add capital to match new tier
• Update Stop Loss: Tighten to entry price
• Update TP Levels: Use new levels in dashboard

Current Entry: $${enhancedSignal.entryPrice?.toFixed(2) || "N/A"}
New SL: $${enhancedSignal.stopLoss?.toFixed(2) || "N/A"}
New TP1: $${enhancedSignal.takeProfit1?.toFixed(2) || "N/A"}
${entryDecision.tier !== "B" ? `New TP2: $${enhancedSignal.takeProfit2?.toFixed(2) || "N/A"}` : "(B tier = TP1-only exit)"}

⏰ Time: ${new Date().toISOString()}
═══════════════════════════════════════
            `
            
            await notifier.sendMessage(tierUpgradeMessage, false)
            SignalCache.updateTier(symbol, entryDecision.tier)
            console.log(`[v0] TIER UPGRADE ALERT SENT: ${oldTier} → ${entryDecision.tier}`)
          } catch (telegramError) {
            console.error("[v0] Failed to send tier upgrade alert:", telegramError)
          }
        }
      } else {
        console.log(`[v0] Alert conditions not met: market_closed=${marketStatus.isClosed} alertCheck.allowed=${alertCheck.allowed} entryDecision.allowed=${entryDecision.allowed} type=${enhancedSignal.type} alertLevel=${enhancedSignal.alertLevel}`)
      }
    } catch (alertError) {
      console.error("[v0] Alert flow error:", alertError)
    }

    return NextResponse.json({
      success: true,
      signal: enhancedSignal,
      timestamp: lastValidTimestamps[symbol],
      marketClosed: false,
      dataSource: "oanda",
    })
  } catch (error) {
    console.error("Error in signal/current route:", error)

    return NextResponse.json(
      {
        success: false,
        error: "Internal server error while generating signal",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
