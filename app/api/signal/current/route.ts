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
          try {
            cachedSignal.entryDecision = strategies.buildEntryDecision(cachedSignal)
          } catch (err) {
            console.error("[v0] buildEntryDecision failed for cached signal:", err)
            cachedSignal.entryDecision = { approved: false, tier: "NO_TRADE", score: 0, checklist: [] }
          }
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
          try {
            cached.entryDecision = strategies.buildEntryDecision(cached)
          } catch (err) {
            console.error("[v0] buildEntryDecision failed for cached entry:", err)
            cached.entryDecision = { approved: false, tier: "NO_TRADE", score: 0, checklist: [] }
          }
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
    
    // STEP 2: Log raw signal for diagnostics
    console.log(`[v0] 🔥 SIGNAL CURRENT ROUTE HIT - signal.type=${signal.type} direction=${signal.direction}`)
    
    // STEP 3: CRITICAL - Force set structuralTier if missing
    // The issue: evaluateSignals returns structuralTier in return statements,
    // but it's not being included in the object. Reconstruct it now.
    if (typeof (signal as any).structuralTier !== "string") {
      const reasonsStr = (signal.reasons || []).join(" | ")
      
      // Primary detection: Look for TIER B PASS in reasons
      if (reasonsStr.includes("TIER B PASS")) {
        (signal as any).structuralTier = "B"
        console.log(`[v0] ✓ B tier detected from reasons`)
      } else if (signal.type === "ENTRY" && reasonsStr.includes("Score")) {
        // Infer from reasons text for A/A+ tiers
        if (reasonsStr.includes("A+ Setup") || reasonsStr.includes("A+ Setup:")) {
          (signal as any).structuralTier = "A+"
        } else if (reasonsStr.includes("A Setup") && !reasonsStr.includes("A+")) {
          (signal as any).structuralTier = "A"
        } else {
          (signal as any).structuralTier = "NO_TRADE"
        }
        console.log(`[v0] Entry tier set from reasons: ${(signal as any).structuralTier}`)
      } else if (signal.type === "ENTRY") {
        // Fallback for ENTRY without clear tier in reasons
        (signal as any).structuralTier = signal.confidence >= 75 ? "A+" : signal.confidence >= 70 ? "A" : "B"
        console.log(`[v0] Entry tier inferred from confidence: ${(signal as any).structuralTier}`)
      } else {
        (signal as any).structuralTier = "NO_TRADE"
      }
    } else {
      console.log(`[v0] Signal has structuralTier: ${(signal as any).structuralTier}`)
    }

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

    // Build entry decision for checklist display - WRAPPED in try-catch to prevent 500s
    let entryDecision: any = { approved: false, tier: "NO_TRADE", score: 0, checklist: [] }
    try {
      entryDecision = strategies.buildEntryDecision(enhancedSignal)
      if (!entryDecision) {
        console.error("[v0] buildEntryDecision returned null/undefined - using defaults")
        entryDecision = { approved: false, tier: "NO_TRADE", score: 0, checklist: [] }
      }
    } catch (decisionError) {
      console.error("[v0] CRITICAL: buildEntryDecision crashed:", decisionError)
      entryDecision = { approved: false, tier: "NO_TRADE", score: 0, checklist: [], error: String(decisionError) }
    }
    
    // STEP 4: Log what will be returned to client
    console.log(`[v0] FINAL DECISION: tier=${entryDecision.tier} approved=${entryDecision.approved} score=${entryDecision.score}`)
    
    enhancedSignal.entryDecision = entryDecision

    SignalCache.set(enhancedSignal, symbol)

    lastValidSignals[symbol] = enhancedSignal
    lastValidTimestamps[symbol] = new Date().toISOString()

    // Create stable signal fingerprint (NOT including timestamp or fluctuating confidence)
    const signalFingerprint = [
      enhancedSignal.direction,
      (enhancedSignal as any).structuralTier || entryDecision.tier,
      Math.round(enhancedSignal.entryPrice || 0),
      enhancedSignal.timeframeAlignment || 0
    ].join("|")
    
    // ALERTS: Send telegram notification if conditions met
    try {
      console.log(`[v0] STEP 5 - Alert flow starting: tier=${entryDecision.tier} approved=${entryDecision.approved}`)
      
      let alertCheck: any = null
      let tierUpgraded = false
      
      try {
        alertCheck = SignalCache.canAlertSetup(enhancedSignal, symbol, signalFingerprint)
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

      console.log(`[v0] DEBUG: Entering alert flow`)
      console.log(`[v0] Alert fingerprint: ${signalFingerprint}, tier: ${entryDecision.tier}`)

      if (!marketStatus.isClosed && alertCheck && alertCheck.allowed && entryDecision.allowed && enhancedSignal.type === "ENTRY" && enhancedSignal.alertLevel >= 2) {
        if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
          try {
            // STEP 1: Create normalized alert object - single source of truth
            const cleanSymbol = (symbol || "UNKNOWN").toUpperCase().replace(/_USD/g, "")
            const alertTier = entryDecision.tier || "NO_TRADE"
            
            // Enforce tier fallback
            const validTiers = ["A+", "A", "B", "NO_TRADE"]
            const finalTier = validTiers.includes(alertTier) ? alertTier : "NO_TRADE"
            
            const alertPayload = {
              symbol: cleanSymbol,
              direction: (enhancedSignal.direction || "N/A").toUpperCase(),
              tier: finalTier,
              score: entryDecision.score ?? 0,
              entry: enhancedSignal.entryPrice ?? null,
              confidence: Math.round((enhancedSignal.confidence ?? 0) * 100) / 100,
              tp1: enhancedSignal.takeProfit1 ?? null,
              tp2: enhancedSignal.takeProfit2 ?? null,
              sl: enhancedSignal.stopLoss ?? null
            }
            
            console.log(`[v0] Alert Payload: ${JSON.stringify(alertPayload)}`)
            
            const { TelegramNotifier } = await import("@/lib/telegram")
            const notifier = new TelegramNotifier(
              process.env.TELEGRAM_BOT_TOKEN,
              process.env.TELEGRAM_CHAT_ID,
              "https://xptswitch.vercel.app"
            )
            console.log(`[v0] SENDING TELEGRAM ALERT: ${alertPayload.direction} ${alertPayload.symbol} Tier ${alertPayload.tier}`)
            await notifier.sendSignalAlert(alertPayload)
            
            SignalCache.recordAlertSent(enhancedSignal, symbol, signalFingerprint, entryDecision.tier)
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
            // Tier upgrade alert - also use normalized payload
            const cleanSymbol = (symbol || "UNKNOWN").toUpperCase().replace(/_USD/g, "")
            const alertTier = entryDecision.tier || "NO_TRADE"
            const validTiers = ["A+", "A", "B", "NO_TRADE"]
            const finalTier = validTiers.includes(alertTier) ? alertTier : "NO_TRADE"
            
            const upgradePayload = {
              symbol: cleanSymbol,
              direction: (enhancedSignal.direction || "N/A").toUpperCase(),
              tier: finalTier,
              score: entryDecision.score ?? 0,
              entry: enhancedSignal.entryPrice ?? null,
              tp1: enhancedSignal.takeProfit1 ?? null,
              tp2: enhancedSignal.takeProfit2 ?? null,
              sl: enhancedSignal.stopLoss ?? null
            }
            
            const { TelegramNotifier } = await import("@/lib/telegram")
            const notifier = new TelegramNotifier(
              process.env.TELEGRAM_BOT_TOKEN,
              process.env.TELEGRAM_CHAT_ID,
              "https://xptswitch.vercel.app"
            )
            
            const oldTier = (SignalCache as any).getTradeState?.(symbol)?.lastAlertedTier || "?"
            console.log(`[v0] SENDING TIER UPGRADE ALERT: ${cleanSymbol} upgraded to ${finalTier}`)
            
            const tierUpgradeMessage = `
🚀 TIER UPGRADE ALERT - ${cleanSymbol}
═══════════════════════════════════════
Your ${cleanSymbol} trade has UPGRADED to a higher tier!

Previous Tier: ${oldTier}
NEW Tier: ${finalTier} (Score ${(entryDecision.score ?? 0).toFixed(1)}/9)

📊 ACTION REQUIRED:
• Increase position size: Add capital to match new tier
• Update Stop Loss: Tighten to entry price
• Update TP Levels: Use new levels in dashboard

Current Entry: $${(upgradePayload.entry ?? 0).toFixed(2)}
New SL: $${(upgradePayload.sl ?? 0).toFixed(2)}
New TP1: $${(upgradePayload.tp1 ?? 0).toFixed(2)}
${finalTier !== "B" ? `New TP2: $${(upgradePayload.tp2 ?? 0).toFixed(2)}` : "(B tier = TP1-only exit)"}

⏰ Time: ${new Date().toISOString()}
═══════════════════════════════════════
            `
            
            await notifier.sendMessage(tierUpgradeMessage, false)
            SignalCache.updateTier(symbol, finalTier)
            console.log(`[v0] TIER UPGRADE ALERT SENT: ${oldTier} → ${finalTier}`)
          } catch (telegramError) {
            console.error("[v0] Failed to send tier upgrade alert:", telegramError)
          }
        }
      } else {
        // Alert conditions not met - log why (for diagnostics)
        if (marketStatus.isClosed) {
          console.log(`[v0] Alert skipped: Market closed`)
        } else if (!alertCheck?.allowed) {
          console.log(`[v0] Alert skipped: Fingerprint/cooldown check failed - ${alertCheck?.reason}`)
        } else if (!entryDecision.allowed) {
          console.log(`[v0] Alert skipped: Entry decision not approved`)
        } else if (enhancedSignal.type !== "ENTRY") {
          console.log(`[v0] Alert skipped: Not ENTRY signal (type=${enhancedSignal.type})`)
        } else if (enhancedSignal.alertLevel < 2) {
          console.log(`[v0] Alert skipped: Alert level too low (${enhancedSignal.alertLevel} < 2)`)
        }
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
