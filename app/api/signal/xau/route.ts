import { NextResponse } from "next/server"
import { DataFetcher } from "@/lib/data-fetcher"
import { TradingStrategies } from "@/lib/strategies"
import { DEFAULT_TRADING_CONFIG } from "@/lib/default-config"
import { MarketHours } from "@/lib/market-hours"
import { SignalCache } from "@/lib/signal-cache"
import { TechnicalAnalysis } from "@/lib/indicators"
import { TradeStateCalculator } from "@/lib/trade-state"
import { ShortRejectionTracker } from "@/lib/short-rejection-tracker"
import { PatienceTracker } from "@/lib/patience-tracker"
import { GetReadyEvaluator } from "@/lib/get-ready-evaluator"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

let lastValidSignalXAU: any = null
let lastValidTimestampXAU: string | null = null

export async function GET() {
  try {
    const marketStatus = MarketHours.getMarketStatus()
    const symbol = "XAU_USD"

    const dataFetcher = new DataFetcher(symbol)
    const strategies = new TradingStrategies(DEFAULT_TRADING_CONFIG)
    strategies.setDataSource("oanda")

    try {
      const dataDaily = await dataFetcher.fetchCandles("1d", 100)
      const data8h = await dataFetcher.fetchCandles("8h", 150)
      const data4h = await dataFetcher.fetchCandles("4h", 200)
      const data1h = await dataFetcher.fetchCandles("1h", 200)
      const result15m = await dataFetcher.fetchCandles("15m", 200).catch(() => ({ candles: [] }))
      const result5m = await dataFetcher.fetchCandles("5m", 200).catch(() => ({ candles: [] }))

      const data15m = result15m.candles || []
      const data5m = result5m.candles || []

      // Note: We continue processing even when market is closed
      // This allows us to display the Friday close snapshot using available candle data
      const isMarketClosed = !marketStatus.isOpen
      console.log(`[v0] Market status: isOpen=${marketStatus.isOpen}, isMarketClosed=${isMarketClosed}, message=${marketStatus.message}`)

      // DISABLED: Cache was keeping stale signals with ADX=0.0 forever
      // Each request now forces fresh signal evaluation to get latest market data
      // const cached = SignalCache.get(symbol)
      // if (cached && cached.indicators && cached.indicators.adx > 0) {
      //   return NextResponse.json({ ... })
      // }

      if (!dataDaily?.candles?.length || !data1h?.candles?.length) {
        return NextResponse.json({
          success: false,
          error: "Insufficient market data",
          symbol: "XAU_USD",
        }, { status: 503 })
      }

      const signal = await strategies.evaluateSignals(
        dataDaily.candles,
        data8h.candles,
        data4h.candles,
        data1h.candles,
        data15m,
        data5m,
      )

      // Always include indicator data, even for NO_TRADE signals
      const data1hCandles = data1h.candles || []
      const last1hCandle = data1hCandles.length > 0 ? data1hCandles[data1hCandles.length - 1] : {}

      // Extract proper close price - OANDA uses bid.c structure
      const closePrice = (last1hCandle as any)?.bid?.c || (last1hCandle as any)?.close || signal.entryPrice || 0
      const normalizedCandles = data1hCandles.map((c: any) => ({
        open: c.bid?.o || 0,
        high: c.bid?.h || 0,
        low: c.bid?.l || 0,
        close: c.bid?.c || 0,
        volume: c.volume || 1,
        time: c.time,
        timestamp: c.time || Date.now(),
      }))

      // Calculate indicators from raw candle data using TechnicalAnalysis
      const adxValue = TechnicalAnalysis.calculateADX(data1hCandles, 14)
      const atrValue = TechnicalAnalysis.calculateATR(data1hCandles, 14)
      const rsiValue = TechnicalAnalysis.calculateRSI(data1hCandles, 14)
      
      console.log(`[v0] XAU Indicators Calculated: ADX=${adxValue.toFixed(2)} ATR=${atrValue.toFixed(2)} RSI=${rsiValue.toFixed(2)} | Candle Count=${data1hCandles.length}`)
      
      // Stoch RSI is NOT an entry gate. Informational only.
      // STRICT: Pass full structured object, NEVER fallback to 50
      const stochRSIResult = TechnicalAnalysis.calculateStochasticRSI(data1hCandles, 14, 3)
      
      // Calculate VWAP from normalized candles
      const vwapResult = normalizedCandles && normalizedCandles.length > 0
        ? TechnicalAnalysis.calculateVWAP(normalizedCandles)
        : { value: 0, bias: "FLAT" }
      const vwapValue = typeof vwapResult === "object" ? vwapResult.value : vwapResult

      // Build indicators object - stochRSI is full structured object (value + state)
      const indicators = {
        adx: adxValue || 0,
        atr: atrValue || 0,
        rsi: rsiValue || 50,
        stochRSI: stochRSIResult, // FULL OBJECT: { value: number | null, state: string }
        vwap: vwapValue > 0 ? vwapValue : closePrice,
        ema20: 0,
        ema50: 0,
        ema200: 0,
        bollingerUpper: 0,
        bollingerLower: 0,
        chandelierStop: { long: 0, short: 0 },
      }

      console.log("[v0] XAU Indicators prepared:", indicators)

      // Import market analyzer BEFORE using it
      const { MarketStateAnalyzer } = await import("@/lib/market-analyzer")

      // Analyze market condition BEFORE building enhancedSignal
      const marketCondition = MarketStateAnalyzer.analyzeMarketCondition(
        data1hCandles,
        indicators,
        closePrice,
      )

      // If signal is active ENTRY, analyze exit conditions
      // NOTE: exitSignal is declared in outer scope, assign here (don't redeclare)
      const exitSignal = signal.type === "ENTRY" && signal.stopLoss
        ? MarketStateAnalyzer.generateExitSignal(
            closePrice,
            signal.entryPrice || closePrice,
            signal.stopLoss,
            indicators,
            marketCondition,
            signal.direction as "LONG" | "SHORT",
            data1hCandles,
          )
        : null

      // NOW build enhancedSignal with all data in place
      const enhancedSignal = {
        ...signal,
        type: signal.type === "ENTRY" ? "ENTRY" : signal.type,
        symbol: symbol,
        indicators: indicators,
        mtfBias: signal.mtfBias || {
          daily: "NO_CLEAR_BIAS",
          "4h": "NO_CLEAR_BIAS",
          "1h": "NO_CLEAR_BIAS",
          "15m": "NO_CLEAR_BIAS",
          "5m": "NO_CLEAR_BIAS",
        },
        timeframeAlignment: signal.timeframeAlignment || {
          daily: "UNKNOWN",
          h4: "UNKNOWN",
          h1: "UNKNOWN",
          m15: "UNKNOWN",
          m5: "UNKNOWN",
        },
        marketState: marketCondition,
        exitSignal: exitSignal,
        currentPrice: closePrice,
        bid: (last1hCandle as any)?.bid?.c,
        ask: (last1hCandle as any)?.ask?.c,
        lastCandle: {
          close: closePrice,
          bid: (last1hCandle as any)?.bid?.c,
          ask: (last1hCandle as any)?.ask?.c,
          volume: (last1hCandle as any)?.volume,
          time: (last1hCandle as any)?.time,
        },
      } as any

      // BUILD CANONICAL ENTRY DECISION - Single source of truth for entry criteria
      const entryDecision = strategies.buildEntryDecision(enhancedSignal)
      enhancedSignal.entryDecision = entryDecision
      
      // PATIENCE TRACKING - Update HTF polarity state (DIAGNOSTIC ONLY - NO LOGIC CHANGES)
      const htfPolarity = enhancedSignal.htfTrend || "NEUTRAL"
      PatienceTracker.updateHTFPolarity(symbol, htfPolarity as "LONG" | "SHORT" | "NEUTRAL")
      PatienceTracker.logNeutralDuration(symbol)
      
      // Record valid A/A+ setups when they occur
      if (entryDecision.allowed && (entryDecision.tier === "A" || entryDecision.tier === "A+") && enhancedSignal.direction) {
        PatienceTracker.recordValidSetup(symbol, entryDecision.tier, enhancedSignal.direction as "LONG" | "SHORT")
      }
      
      // Build patience metrics for API response
      const primaryBlocker = entryDecision.blockedReasons.length > 0 
        ? entryDecision.blockedReasons[0] 
        : htfPolarity === "NEUTRAL" ? "HTF polarity unclear" : "Entry criteria not met"
      
      const patienceMetrics = PatienceTracker.getMetrics(symbol, htfPolarity as "LONG" | "SHORT" | "NEUTRAL", primaryBlocker)
      
      // Generate no-trade summary if not entering
      if (!entryDecision.allowed) {
        const dailyStructure = enhancedSignal.timeframeAlignment?.daily || "UNKNOWN"
        const h4Structure = enhancedSignal.timeframeAlignment?.h4 || "UNKNOWN"
        patienceMetrics.noTradeSummary = PatienceTracker.generateNoTradeSummary(
          symbol,
          htfPolarity as "LONG" | "SHORT" | "NEUTRAL",
          dailyStructure,
          h4Structure,
          entryDecision.blockedReasons
        )
      }
      
      // Format duration for display
      const htfNeutralFormatted = PatienceTracker.formatDuration(patienceMetrics.htfNeutralDurationMinutes)
      const lastAlignedFormatted = patienceMetrics.lastHTFAlignedAt 
        ? new Date(patienceMetrics.lastHTFAlignedAt).toLocaleString() 
        : null
      
      enhancedSignal.patienceMetrics = {
        ...patienceMetrics,
        htfNeutralFormatted,
        lastHTFAlignedFormatted: lastAlignedFormatted,
      }
      
      // COMPUTE TRADE STATE: For active/historical trades, compute lifecycle state
      // This provides real-time trade management communication via Telegram
      if (enhancedSignal.type === "ENTRY" || enhancedSignal.entryPrice) {
        const tradeStateInfo = TradeStateCalculator.computeTradeState(enhancedSignal, closePrice)
        enhancedSignal.tradeStateInfo = tradeStateInfo
        console.log(`[v0] TRADE STATE: ${tradeStateInfo.state} | Reason: ${tradeStateInfo.reason}`)
      }
      
      // ENFORCE: Only use entryDecision.allowed for alert gating
      // Update alertLevel based on canonical decision, not ad-hoc thresholds
      enhancedSignal.alertLevel = entryDecision.alertLevel

      // GET_READY EVALUATION - INFORMATIONAL ONLY (UI display for XAU)
      // This does NOT modify EntryDecision, scoring, or alert gating
      const htfStructureForGetReady = {
        daily: (enhancedSignal.timeframeAlignment?.daily?.includes("BULLISH") ? "HL" : 
               enhancedSignal.timeframeAlignment?.daily?.includes("BEARISH") ? "LH" : "NEUTRAL") as "HH" | "HL" | "LL" | "LH" | "NEUTRAL",
        h4: (enhancedSignal.timeframeAlignment?.h4?.includes("BULLISH") ? "HL" : 
             enhancedSignal.timeframeAlignment?.h4?.includes("BEARISH") ? "LH" : "NEUTRAL") as "HH" | "HL" | "LL" | "LH" | "NEUTRAL"
      }
      
      const stochRSIState = typeof indicators.stochRSI === "object" 
        ? (indicators.stochRSI as any).state || "CALCULATING"
        : indicators.stochRSI > 80 ? "MOMENTUM_UP" : indicators.stochRSI < 20 ? "MOMENTUM_DOWN" : "COMPRESSION"
      
      const vwapBias: "LONG" | "SHORT" | "NEUTRAL" = closePrice > (indicators.vwap || 0) ? "LONG" : closePrice < (indicators.vwap || 0) ? "SHORT" : "NEUTRAL"
      
      const getReadyState = GetReadyEvaluator.evaluate(
        enhancedSignal || signal,
        entryDecision,
        marketStatus.isOpen,
        htfStructureForGetReady,
        {
          adx: indicators.adx || 0,
          atr: indicators.atr || 0,
          rsi: indicators.rsi || 50,
          stochRSI: typeof indicators.stochRSI === "object" ? (indicators.stochRSI as any).value || 0 : indicators.stochRSI || 0,
          stochRSIState: stochRSIState as "MOMENTUM_UP" | "MOMENTUM_DOWN" | "COMPRESSION" | "CALCULATING"
        },
        {
          daily: signal.mtfBias?.daily || enhancedSignal?.mtfBias?.daily || "UNKNOWN",
          h4: signal.mtfBias?.["4h"] || enhancedSignal?.mtfBias?.["4h"] || "UNKNOWN",
          h1: signal.mtfBias?.["1h"] || enhancedSignal?.mtfBias?.["1h"] || "UNKNOWN",
          m15: signal.mtfBias?.["15m"] || enhancedSignal?.mtfBias?.["15m"] || "UNKNOWN",
          m5: signal.mtfBias?.["5m"] || enhancedSignal?.mtfBias?.["5m"] || "UNKNOWN"
        },
        vwapBias,
        symbol,
        false,
        false
      )
      
      enhancedSignal.getReadyState = getReadyState

      // SHORT REJECTION TRACKING: Log potential SHORT setups that are rejected
      // This helps verify the HTF fix is working and rejections are legitimate
      if (!entryDecision.allowed) {
        const htfStructure = {
          daily: signal.timeframeAlignment?.daily?.includes("HH") ? "HH" : 
                 signal.timeframeAlignment?.daily?.includes("LL") ? "LL" : 
                 signal.timeframeAlignment?.daily || "UNKNOWN",
          h4: signal.timeframeAlignment?.h4?.includes("HH") ? "HH" : 
              signal.timeframeAlignment?.h4?.includes("LL") ? "LL" : 
              signal.timeframeAlignment?.h4 || "UNKNOWN"
        }
        
        ShortRejectionTracker.logShortRejection(
          "XAU_USD",
          signal.htfTrend || "NEUTRAL",
          htfStructure,
          {
            daily: signal.mtfBias?.daily || "NO_CLEAR_BIAS",
            h4: signal.mtfBias?.["4h"] || "NO_CLEAR_BIAS",
            h1: signal.mtfBias?.["1h"] || "NO_CLEAR_BIAS",
            m15: signal.mtfBias?.["15m"] || "NO_CLEAR_BIAS",
            m5: signal.mtfBias?.["5m"] || "NO_CLEAR_BIAS"
          },
          {
            adx: indicators.adx || 0,
            atr: indicators.atr || 0,
            rsi: indicators.rsi || 50,
            stochRSI: typeof indicators.stochRSI === "object" ? (indicators.stochRSI as any).value : null,
            vwap: indicators.vwap || 0
          },
          {
            allowed: entryDecision.allowed,
            tier: entryDecision.tier,
            score: entryDecision.score,
            blockedReasons: entryDecision.blockedReasons
          }
        )
      }

      // ASSERTION: timeframeAlignment must exist in every signal
      if (!enhancedSignal.timeframeAlignment) {
        enhancedSignal.timeframeAlignment = {
          daily: "UNKNOWN",
          h4: "UNKNOWN",
          h1: "UNKNOWN",
          m15: "UNKNOWN",
          m5: "UNKNOWN",
        }
      }
      console.log(
        `[v0] CANONICAL MTF ALIGNMENT: Daily=${enhancedSignal.timeframeAlignment.daily} | 4H=${enhancedSignal.timeframeAlignment.h4} | 1H=${enhancedSignal.timeframeAlignment.h1} | 15M=${enhancedSignal.timeframeAlignment.m15} | 5M=${enhancedSignal.timeframeAlignment.m5}`,
      )

      SignalCache.set(enhancedSignal, symbol)
      lastValidSignalXAU = enhancedSignal
      lastValidTimestampXAU = new Date().toISOString()

      console.log("[v0] XAU Signal cached:", {
        type: enhancedSignal.type,
        direction: enhancedSignal.direction,
        alertLevel: enhancedSignal.alertLevel,
        entryPrice: enhancedSignal.entryPrice,
        stopLoss: enhancedSignal.stopLoss,
        marketState: marketCondition.state,
        exitSignal: exitSignal?.type || "NONE",
        symbol: symbol,
      })

      // Check if we should send an alert for this signal using the CANONICAL ENTRY DECISION
      const alertCheck = SignalCache.canAlertSetup(enhancedSignal, symbol)
      console.log(`[v0] XAU Alert Check: ${alertCheck.reason}`)

      // CRITICAL: Only send alert if entryDecision.allowed === true AND market is open
      if (!isMarketClosed && alertCheck.allowed && entryDecision.allowed && enhancedSignal.type === "ENTRY" && enhancedSignal.alertLevel >= 2) {
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
            
            // ASSERTION: Verify no desync - if alert sent, entryDecision must be allowed
            if (!entryDecision.allowed) {
              throw new Error(`ENTRY DESYNC DETECTED: Alert sent for ${symbol} but entryDecision.allowed=false!`)
            }
            
            // Record in state machine
            SignalCache.recordAlertSent(enhancedSignal, symbol)
            SignalCache.setTradeState(symbol, "IN_TRADE", "ENTRY alert sent")
            console.log(`[v0] TELEGRAM ALERT SENT for ${symbol}`)
          } catch (telegramError) {
            console.error("[v0] Failed to send Telegram alert:", telegramError)
          }
        }
      } else if (!alertCheck.allowed) {
        console.log(`[v0] ALERT BLOCKED for ${symbol}: ${alertCheck.reason}`)
      } else if (!entryDecision.allowed) {
        console.log(`[v0] ALERT BLOCKED for ${symbol} by entryDecision: ${entryDecision.blockedReasons.join(" | ")}`)
      }

      return NextResponse.json({
        success: true,
        signal: enhancedSignal,
        timestamp: lastValidTimestampXAU,
        marketClosed: isMarketClosed,
        marketStatus: isMarketClosed ? marketStatus.message : null,
        symbol: "XAU_USD",
      })
    } catch (fetchError) {
      console.error("Error fetching XAU data:", fetchError)
      return NextResponse.json({
        success: false,
        error: "Failed to fetch data",
        symbol: "XAU_USD",
      }, { status: 500 })
    }
  } catch (error) {
    console.error("Error in XAU signal route:", error)
    return NextResponse.json({
      success: false,
      error: "Internal error",
      symbol: "XAU_USD",
    }, { status: 500 })
  }
}
