import { NextResponse } from "next/server"
import { DataFetcher } from "@/lib/data-fetcher"
import { TradingStrategies } from "@/lib/strategies"
import { BalancedBreakoutStrategy } from "@/lib/balanced-strategy"
import { StrictStrategyV7 } from "@/lib/strict-strategy-v7"
import { BalancedStrategyV7 } from "@/lib/balanced-strategy-v7"
import { DEFAULT_TRADING_CONFIG } from "@/lib/default-config"
import { CACHE_BUSTER_V3_3 } from "@/lib/cache-buster"
// CACHE BUST v3.1: Force full rebuild - symbol scope fixed in catch block
import { MarketHours } from "@/lib/market-hours"
import { SignalCache } from "@/lib/signal-cache"
import { createTrade } from "@/lib/trade-lifecycle"

// SYSTEM VERSION - Visible on homepage and all API responses
export const SYSTEM_VERSION = "6.1.1-COMPILE-FIX"

// HARDCODED: Only XAU_USD - never import TRADING_SYMBOLS which gets cached by Vercel
const TRADING_SYMBOLS = ["XAU_USD"] as const
function isValidTradingSymbol(symbol: string): symbol is typeof TRADING_SYMBOLS[number] {
  return symbol === "XAU_USD"
}

// SYMBOL-SPECIFIC STRATEGY ROUTING - v7 Score-Based
// XAU_USD = STRICT v7 (score ≥ 4/6)
function getStrategyModeForSymbol(symbol: string): "STRICT" | "BALANCED" {
  if (symbol === "XAU_USD") return "STRICT"
  throw new Error(`Unsupported symbol for strategy routing: ${symbol}. Only XAU_USD is configured.`)
}

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

let lastValidSignals: { [key: string]: any } = {}
let lastValidTimestamps: { [key: string]: string | null } = {}

// Initialize for all trading symbols
TRADING_SYMBOLS.forEach((symbol) => {
  lastValidSignals[symbol] = null
  lastValidTimestamps[symbol] = null
})

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const symbolParam = searchParams.get("symbol")
    
    console.log(`[v0] SIGNAL/CURRENT GUARD: symbolParam=${symbolParam}`)
    
    // Guard: reject invalid symbols
    if (!symbolParam || !isValidTradingSymbol(symbolParam)) {
      console.error(`[GUARD] Invalid symbol requested: ${symbolParam}. Valid symbols: ${TRADING_SYMBOLS.join(", ")}`)
      return NextResponse.json(
        { success: false, error: "Invalid trading symbol", requestedSymbol: symbolParam, validSymbols: TRADING_SYMBOLS },
        { status: 400 }
      )
    }
    
    const symbol = symbolParam as typeof TRADING_SYMBOLS[number]
    console.log(`[v0] SIGNAL/CURRENT PASSED GUARD: symbol=${symbol}`)
    console.log(`[v0] CACHE_BUSTER v3.3 ACTIVE: ${CACHE_BUSTER_V3_3}`)
    console.log(`[v0] This proves the FIXED source code is running, not cached old bytecode`)
    
    // Runtime failsafe: reject XAG if it somehow appears
    if (symbol === "XAG_USD") {
      throw new Error("[FAILSAFE] XAG_USD should not exist in production")
    }

    const marketStatus = MarketHours.getMarketStatus()

    const dataFetcher = new DataFetcher(symbol)
    const strategies = new TradingStrategies(DEFAULT_TRADING_CONFIG)

    strategies.setDataSource("oanda")

    let dataDaily, data8h, data4h, data1h, data15m, data5m

    try {
      dataDaily = await dataFetcher.fetchCandles("1d", 100, "LIVE")
      data8h = await dataFetcher.fetchCandles("8h", 200, "LIVE")
      data4h = await dataFetcher.fetchCandles("4h", 200, "LIVE")
      data1h = await dataFetcher.fetchCandles("1h", 200, "LIVE")

      const [result15m, result5m] = await Promise.allSettled([
        dataFetcher.fetchCandles("15m", 200, "LIVE"),
        dataFetcher.fetchCandles("5m", 200, "LIVE"),
      ])

      data15m = result15m.status === "fulfilled" ? result15m.value : { candles: [], source: "oanda" as const }
      data5m = result5m.status === "fulfilled" ? result5m.value : { candles: [], source: "oanda" as const }

      // STRICT DATA VALIDATION - v5.7.0
      console.log(`[DATA_FETCH]`, {
        instrument: symbol,
        dailyCandles: dataDaily.candles.length,
        h8Candles: data8h.candles.length,
        h4Candles: data4h.candles.length,
        h1Candles: data1h.candles.length,
        m15Candles: data15m.candles.length,
        m5Candles: data5m.candles.length,
        lastDailyTime: dataDaily.candles[dataDaily.candles.length - 1]?.time,
        lastH1Time: data1h.candles[data1h.candles.length - 1]?.time,
        source: dataDaily.source,
      })

      // Validate minimum candle counts
      if (!dataDaily.candles || dataDaily.candles.length < 50) {
        console.error("[DATA_INVALID] Daily candles insufficient", dataDaily?.candles?.length)
        return NextResponse.json(
          {
            success: false,
            error: "DATA_INSUFFICIENT",
            message: "Insufficient daily candles for analysis",
            details: { dailyCandles: dataDaily?.candles?.length || 0 },
          },
          { status: 422 }
        )
      }

      if (!data1h.candles || data1h.candles.length < 100) {
        console.error("[DATA_INVALID] 1H candles insufficient", data1h?.candles?.length)
        return NextResponse.json(
          {
            success: false,
            error: "DATA_INSUFFICIENT",
            message: "Insufficient 1H candles for analysis",
            details: { h1Candles: data1h?.candles?.length || 0 },
          },
          { status: 422 }
        )
      }

      if (!data4h.candles || data4h.candles.length < 50) {
        console.error("[DATA_INVALID] 4H candles insufficient", data4h?.candles?.length)
        return NextResponse.json(
          {
            success: false,
            error: "DATA_INSUFFICIENT",
            message: "Insufficient 4H candles for analysis",
            details: { h4Candles: data4h?.candles?.length || 0 },
          },
          { status: 422 }
        )
      }

      console.log(
        `[v0] Data loaded: Daily=${dataDaily.candles.length} (${dataDaily.source}), 4H=${data4h.candles.length} (${data4h.source}), 1H=${data1h.candles.length} (${data1h.source}), 15M=${data15m.candles.length} (${data15m.source}), 5M=${data5m.candles.length} (${data5m.source})`,
      )

      // REMOVED: Synthetic data block was blocking signals when credentials temporarily unavailable
      // Since credentials ARE configured in Vercel, signals should proceed with whatever data is loaded
    } catch (fetchError) {
      console.error("[FETCH_ERROR] Candle fetch failed:", fetchError)
      return NextResponse.json(
        {
          success: false,
          error: "OANDA_FETCH_FAILED",
          message: "Failed to fetch market data from OANDA",
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

    // Symbol-specific strategy routing - v7 Score-Based System
    const activeMode = getStrategyModeForSymbol(symbol)
    console.log(`[v0] ACTIVE_MODE_FOR_${symbol}=${activeMode} (v7 Score-Based)`)

    let signal
    // Strategy evaluation based on mode
    console.log(`[v0] STRICT EVALUATION START: activeMode=${activeMode} symbol=${symbol}`)
    
    if (activeMode === "BALANCED") {
      // BALANCED mode
      const balancedV7 = new BalancedStrategyV7()
      signal = balancedV7.evaluate(
        dataDaily.candles,
        data8h.candles,
        data4h.candles,
        data1h.candles,
        data15m.candles,
        data5m.candles,
        DEFAULT_TRADING_CONFIG,
      )
    } else {
      // STRICT mode - v7 Score-Based
      const strictV7 = new StrictStrategyV7()
      signal = strictV7.evaluate(
        dataDaily.candles,
        data8h.candles,
        data4h.candles,
        data1h.candles,
        data15m.candles,
        data5m.candles,
        DEFAULT_TRADING_CONFIG,
      )
      console.log(`[v0] STRICT EVALUATION RESULT: type=${signal.type} score=${(signal as any).score} direction=${signal.direction}`)
    }
    
    // [DIAG] Route Entry
    console.log(`[DIAG] SIGNAL ROUTE HIT - symbol=${symbol} time=${new Date().toISOString()} marketOpen=${!marketStatus.isClosed}`)
    console.log(`[DIAG] SYSTEM_VERSION=${SYSTEM_VERSION}`)
    
    // [DIAG] Strategy Details for STRICT v7
    console.log(`[DIAG] AFTER EVAL: activeMode=${activeMode} signal.type=${signal.type} score=${(signal as any).score}`)
    if (activeMode === "STRICT") {
      console.log(`[DIAG] STRICT V7.3 EVALUATION COMPLETE:
        type=${signal.type}
        score=${(signal as any).score || 0}
        direction=${signal.direction}
        tier=${(signal as any).tier || "UNKNOWN"}
        component_scores=${JSON.stringify((signal as any).component_scores || {})}
        hard_gate_1=${(signal as any).hard_gate_1 || "NOT_LOGGED"}
        hard_gate_2=${(signal as any).hard_gate_2 || "NOT_LOGGED"}
      `)
    }
    
    // [DIAG] Raw Signal
    console.log(`[DIAG] RAW SIGNAL type=${signal.type} direction=${signal.direction} score=${(signal as any).score || "?"} tier=${(signal as any).tier || "?"}`)
    
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

        if (!isMarketClosed && alertCheck && alertCheck.allowed && entryDecision.allowed && enhancedSignal.type === "ENTRY" && enhancedSignal.alertLevel >= 2) {
          const normalizedSymbol = symbol === "XAU_USD" ? "XAU" : symbol === "GBP_JPY" ? "GBP/JPY" : symbol
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
      systemVersion: SYSTEM_VERSION,
      strategyDetails: {
        mode: activeMode,
        hardGate1: (signal as any).hard_gate_1,
        hardGate2: (signal as any).hard_gate_2,
        componentScores: (signal as any).component_scores,
        score: (signal as any).score,
        tier: (signal as any).tier,
      }
    })
  } catch (error) {
    console.error("[v0] Error in signal route - v3.4 catch block:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
