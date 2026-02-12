import { NextResponse } from "next/server"
import { DataFetcher } from "@/lib/data-fetcher"
import { TradingStrategies } from "@/lib/strategies"
import { DEFAULT_TRADING_CONFIG } from "@/lib/default-config"
import { MarketHours } from "@/lib/market-hours"
import { SignalCache } from "@/lib/signal-cache"
import { createTrade } from "@/lib/trade-lifecycle"
import { checkDirectionChange } from "@/lib/direction-tracker"
import { sendTelegramMessage } from "@/lib/telegram"

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
    
    // [DIAG] Route Entry
    console.log(`[DIAG] SIGNAL ROUTE HIT - symbol=${symbol} time=${new Date().toISOString()} marketOpen=${!marketStatus.isClosed}`)
    
    // [DIAG] Raw Signal
    console.log(`[DIAG] RAW SIGNAL type=${signal.type} direction=${signal.direction} confidence=${signal.confidence} hasStructuralTier=${(signal as any).hasOwnProperty("structuralTier")}`)
    
    // STEP 2: GUARANTEED FIX - Force structuralTier on signal immediately
    // evaluateSignals may return objects where structuralTier is not included as a property
    // We must add it to the signal object before any spreading or type checking
    let injectedTier = false
    if (!(signal as any).hasOwnProperty("structuralTier") || !signal.structuralTier) {
      const reasons = signal.reasons || []
      const reasonsStr = reasons.join(" | ")
      
      // Detect tier from signal properties
      if (reasonsStr.includes("TIER B PASS")) {
        (signal as any).structuralTier = "B"
      } else if (signal.type === "ENTRY") {
        (signal as any).structuralTier = "A+"
      } else {
        (signal as any).structuralTier = "NO_TRADE"
      }
      injectedTier = true
    }
    
    // Ensure it's always defined for later use
    if (!(signal as any).structuralTier) {
      (signal as any).structuralTier = signal.type === "ENTRY" ? "A+" : "NO_TRADE"
      injectedTier = true
    }
    
    // [DIAG] StructuralTier Injection
    console.log(`[DIAG] STRUCTURAL TIER INJECTED injected=${injectedTier} tier=${(signal as any).structuralTier}`)

    // Calculate ATR-based trade setup for LONG/SHORT signals
    const atr = signal.indicators?.atr || 1.0
    const entryPrice = last1hCandle?.close || 0
    const stopLoss = signal.direction === "LONG" ? entryPrice - atr * 1.5 : entryPrice + atr * 1.5
    const takeProfit1 = signal.direction === "LONG" ? entryPrice + atr * 1.5 : entryPrice - atr * 1.5
    const takeProfit2 = signal.direction === "LONG" ? entryPrice + atr * 2.5 : entryPrice - atr * 2.5

    // [DIAG] Before Enhancement
    console.log(`[DIAG] BEFORE ENHANCE structuralTier=${(signal as any).structuralTier}`)
    
    // Enhance signal with last candle data and trade setup for client display
    // CRITICAL: Must explicitly preserve structuralTier - the spread operator may not include optional fields
    const enhancedSignal = {
      ...signal,
      structuralTier: signal.structuralTier,  // Explicitly preserve tier
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

    // [DIAG] After Enhancement
    console.log(`[DIAG] AFTER ENHANCE structuralTier=${enhancedSignal.structuralTier}`)

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
    
    // [DIAG] Entry Decision
    console.log(`[DIAG] ENTRY DECISION approved=${entryDecision.approved} tier=${entryDecision.tier} score=${entryDecision.score}`)
    
    // Create trade file if entry is approved
    if (entryDecision.approved && enhancedSignal.type === "ENTRY" && enhancedSignal.direction && enhancedSignal.entryPrice) {
      try {
        await createTrade(
          symbol,
          enhancedSignal.direction as "BUY" | "SELL",
          enhancedSignal.entryPrice,
          enhancedSignal.stopLoss || 0,
          enhancedSignal.takeProfit1 || 0,
          enhancedSignal.takeProfit2 || 0,
          entryDecision.tier as "A+" | "A" | "B"
        )
        console.log(`[LIFECYCLE OK] Trade persisted successfully - ${symbol} ${enhancedSignal.direction} ${entryDecision.tier}`)
      } catch (tradeError) {
        console.error("[LIFECYCLE] Error creating trade file:", tradeError)
      }
    }
    
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
      let alertCheck: any = null
      let tierUpgraded = false
      
      // [DIAG] Market Hours Check
      const now = new Date()
      const ukHours = now.toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false })
      const isMarketClosed = marketStatus.isClosed || (now.getUTCHours() === 22) // 22:00-23:00 UTC = 10 PM-11 PM UK time
      
      if (isMarketClosed) {
        console.log(`[DIAG] ALERT SKIPPED - MARKET CLOSED ukTime=${ukHours}`)
      } else {
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

        // [DIAG] Alert Check
        console.log(`[DIAG] ALERT CHECK allowed=${alertCheck?.allowed} reason=${alertCheck?.reason} tierUpgraded=${tierUpgraded}`)

        // Check for direction or tier changes
        try {
          const directionResult = await checkDirectionChange(
            symbol,
            enhancedSignal.direction as "BUY" | "SELL" | "NEUTRAL",
            entryDecision.tier as "A+" | "A" | "B" | "NO_TRADE"
          )

          if (directionResult.changed && directionResult.alert && !isMarketClosed) {
            console.log(`[DIRECTION] Sending alert for ${symbol}: ${directionResult.alert}`)
            await sendTelegramMessage(directionResult.alert)
          }
        } catch (directionError) {
          console.error("[DIRECTION] Error checking direction change:", directionError)
        }

        if (!isMarketClosed && alertCheck && alertCheck.allowed && entryDecision.allowed && enhancedSignal.type === "ENTRY" && enhancedSignal.alertLevel >= 2) {
          const normalizedSymbol = symbol === "XAU_USD" ? "XAU" : symbol === "XAG_USD" ? "XAG" : symbol
          const telegramPayload = {
            symbol: normalizedSymbol,
            tier: entryDecision.tier,
            score: entryDecision.score,
            direction: enhancedSignal.direction,
            entryPrice: enhancedSignal.entryPrice,
            takeProfit: enhancedSignal.takeProfit2,
            stopLoss: enhancedSignal.stopLoss,
            timestamp: new Date().toISOString(),
          }
          
          // [DIAG] Telegram Payload
          console.log(`[DIAG] TELEGRAM PAYLOAD ${JSON.stringify(telegramPayload)}`)
          
          // Send to Telegram
          try {
            const telegramResponse = await fetch("https://api.telegram.org/bot" + process.env.TELEGRAM_BOT_TOKEN + "/sendMessage", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: process.env.TELEGRAM_CHAT_ID,
                text: `🔥 ${normalizedSymbol} ${enhancedSignal.direction} Entry\nTier: ${entryDecision.tier}\nScore: ${entryDecision.score}/9\nEntry: ${enhancedSignal.entryPrice?.toFixed(2)}\nTP: ${enhancedSignal.takeProfit2?.toFixed(2)}\nSL: ${enhancedSignal.stopLoss?.toFixed(2)}`,
              }),
            })

            if (telegramResponse.ok) {
              // [DIAG] Alert Sent
              console.log(`[DIAG] ALERT SENT symbol=${normalizedSymbol} tier=${entryDecision.tier}`)
            } else {
              console.error("[v0] Telegram send failed:", await telegramResponse.text())
            }
          } catch (telegramError) {
            console.error("[v0] Error sending Telegram alert:", telegramError)
          }
        } else {
          let skipReason = ""
          if (isMarketClosed) skipReason = "Market closed"
          else if (!alertCheck?.allowed) skipReason = `Fingerprint check: ${alertCheck?.reason}`
          else if (!entryDecision.allowed) skipReason = "Entry decision not approved"
          else if (enhancedSignal.type !== "ENTRY") skipReason = `Not ENTRY signal (type=${enhancedSignal.type})`
          else if (enhancedSignal.alertLevel < 2) skipReason = `Alert level too low (${enhancedSignal.alertLevel} < 2)`
          
          console.log(`[DIAG] ALERT SKIPPED reason=${skipReason}`)
        }
      }
      
    } catch (alertError) {
      console.error("[v0] Error in alert flow:", alertError)
    }

    // [DIAG] Final Response
    console.log(`[DIAG] RESPONSE SENT symbol=${symbol} type=${enhancedSignal.type} tier=${enhancedSignal.entryDecision?.tier}`)

    return NextResponse.json({
      success: true,
      signal: enhancedSignal,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("[v0] Error in signal route:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        symbol,
      },
      { status: 500 },
    )
  }
}
