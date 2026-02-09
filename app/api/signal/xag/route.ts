import { NextResponse } from "next/server"
import { DataFetcher } from "@/lib/data-fetcher"
import { SilverStrategy } from "@/lib/silver-strategy"
import { DEFAULT_TRADING_CONFIG } from "@/lib/default-config"
import { MarketHours } from "@/lib/market-hours"
import { SignalCache } from "@/lib/signal-cache"
import { TechnicalAnalysis } from "@/lib/indicators"
import { SilverNotifier } from "@/lib/silver-notifier"
import { ShortRejectionTracker } from "@/lib/short-rejection-tracker"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

let lastValidSignalXAG: any = null
let lastValidTimestampXAG: string | null = null

export async function GET() {
  try {
    const marketStatus = MarketHours.getMarketStatus()
    const symbol = "XAG_USD"

    const dataFetcher = new DataFetcher(symbol)

    try {
      const dataDaily = await dataFetcher.fetchCandles("1d", 100)
      const data4h = await dataFetcher.fetchCandles("4h", 200)
      const data1h = await dataFetcher.fetchCandles("1h", 200)
      const result15m = await dataFetcher.fetchCandles("15m", 200).catch(() => ({ candles: [] }))
      const result5m = await dataFetcher.fetchCandles("5m", 200).catch(() => ({ candles: [] }))

      const data15m = result15m.candles || []
      const data5m = result5m.candles || []

      if (!marketStatus.isOpen) {
        console.log("[v0] XAG: Market closed, checking for cached signal...")
        if (lastValidSignalXAG && lastValidTimestampXAG) {
          console.log("[v0] XAG: Market closed, returning cached signal")
          return NextResponse.json({
            success: true,
            signal: lastValidSignalXAG,
            timestamp: lastValidTimestampXAG,
            marketClosed: true,
            marketStatus: marketStatus.message,
            symbol: "XAG_USD",
          })
        }
        console.log("[v0] XAG: No cached signal. Proceeding with fresh evaluation despite market being closed.")
        // Continue processing - do NOT return 503
      }

      if (!dataDaily?.candles?.length || !data4h?.candles?.length || !data1h?.candles?.length) {
        console.log("[v0] XAG: Insufficient market data")
        return NextResponse.json({
          success: false,
          error: "Insufficient market data",
          symbol: "XAG_USD",
        }, { status: 503 })
      }

      // Evaluate Silver signal using SilverStrategy
      const evalResult = SilverStrategy.evaluateSilverSignal(
        dataDaily.candles,
        data4h.candles,
        data1h.candles,
        data15m,
        data5m,
      )

      const signal = evalResult.signal

      // Always include indicator data
      const data1hCandles = data1h.candles || []
      const last1hCandle = data1hCandles[data1hCandles.length - 1] || {}

      const closePrice = (last1hCandle as any)?.bid?.c || (last1hCandle as any)?.close || signal.entryPrice || 0

      // Normalize OANDA candle structure for TechnicalAnalysis
      const normalizedCandles = data1hCandles.map((c: any) => ({
        open: c.bid?.o || 0,
        high: c.bid?.h || 0,
        low: c.bid?.l || 0,
        close: c.bid?.c || 0,
        volume: c.volume || 1,
        time: c.time,
      }))

      // Calculate VWAP with new return type
      const vwapResult = normalizedCandles && normalizedCandles.length > 0
        ? TechnicalAnalysis.calculateVWAP(normalizedCandles)
        : { value: 0, bias: "FLAT" }

      // Stoch RSI is NOT an entry gate. Informational only.
      // STRICT: Pass full structured object, NEVER fallback to 0
      // SAFETY: Ensure all indicators have numeric values (never undefined)
      const indicators = {
        ...signal.indicators,
        adx: typeof signal.indicators?.adx === "number" ? signal.indicators.adx : 0,
        atr: typeof signal.indicators?.atr === "number" ? signal.indicators.atr : 0,
        rsi: typeof signal.indicators?.rsi === "number" ? signal.indicators.rsi : 50,
        stochRSI: signal.indicators?.stochRSI ?? { value: null, state: "CALCULATING" },
        vwap: vwapResult.value > 0 ? vwapResult.value : (closePrice || 0),
        vwapBias: vwapResult.bias,
      }

      const enhancedSignal = {
        ...signal,
        symbol: symbol,
        indicators: indicators,
        debugInfo: indicators,
        lastCandle: {
          close: closePrice,
          bid: (last1hCandle as any)?.bid?.c,
          ask: (last1hCandle as any)?.ask?.c,
          volume: (last1hCandle as any)?.volume,
          time: (last1hCandle as any)?.time,
        },
      }

      // BUILD ENTRY DECISION - Determines tier (A+, A, B, NO_TRADE) and alert level
      const { buildEntryDecision } = await import("@/lib/strategies")
      const strategies = new (await import("@/lib/strategies")).TradingStrategies()
      const entryDecision = strategies.buildEntryDecision(enhancedSignal)
      enhancedSignal.entryDecision = entryDecision

      // Cache the signal
      SignalCache.set(enhancedSignal, symbol)
      lastValidSignalXAG = enhancedSignal
      lastValidTimestampXAG = new Date().toISOString()

      console.log("[v0] XAG Signal evaluated:", {
        type: enhancedSignal.type,
        direction: enhancedSignal.direction,
        setupQuality: enhancedSignal.setupQuality,
        alertLevel: enhancedSignal.alertLevel,
        entryPrice: enhancedSignal.entryPrice,
        vwap: vwapResult.value,
      })

      // SHORT REJECTION TRACKING: Log potential setups that are rejected
      // This helps verify the HTF fix is working and rejections are legitimate
      if (!entryDecision.allowed) {
        const htfStructure = {
          daily: enhancedSignal.timeframeAlignment?.daily?.includes("HH") ? "HH" : 
                 enhancedSignal.timeframeAlignment?.daily?.includes("LL") ? "LL" : 
                 enhancedSignal.timeframeAlignment?.daily || "UNKNOWN",
          h4: enhancedSignal.timeframeAlignment?.h4?.includes("HH") ? "HH" : 
              enhancedSignal.timeframeAlignment?.h4?.includes("LL") ? "LL" : 
              enhancedSignal.timeframeAlignment?.h4 || "UNKNOWN"
        }
        
        const { ShortRejectionTracker } = await import("@/lib/short-rejection-tracker")
        ShortRejectionTracker.logShortRejection(
          "XAG_USD",
          enhancedSignal.htfTrend || "NEUTRAL",
          htfStructure,
          {
            daily: enhancedSignal.mtfBias?.daily || "NO_CLEAR_BIAS",
            h4: enhancedSignal.mtfBias?.["4h"] || enhancedSignal.mtfBias?.h4 || "NO_CLEAR_BIAS",
            h1: enhancedSignal.mtfBias?.["1h"] || enhancedSignal.mtfBias?.h1 || "NO_CLEAR_BIAS",
            m15: enhancedSignal.mtfBias?.["15m"] || enhancedSignal.mtfBias?.m15,
            m5: enhancedSignal.mtfBias?.["5m"] || enhancedSignal.mtfBias?.m5
          },
          {
            adx: indicators.adx || 0,
            atr: indicators.atr || 0,
            rsi: indicators.rsi || 0,
            stochRSI: typeof indicators.stochRSI === "object" ? (indicators.stochRSI as any).value : null,
            vwap: indicators.vwap as number
          },
          entryDecision
        )
      }

      // ENTRY ALERTS: Check all rules before sending
      if (entryDecision.allowed && entryDecision.alertLevel >= 2) {
        const alertCheck = SignalCache.canAlertSetup(enhancedSignal, symbol)

        if (alertCheck.allowed && process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
          try {
            const notifier = new SilverNotifier(
              process.env.TELEGRAM_BOT_TOKEN,
              process.env.TELEGRAM_CHAT_ID,
            )
            console.log("[v0] SILVER: Sending entry alert - tier " + entryDecision.tier + " all rules passed")
            await notifier.sendSilverAlert(enhancedSignal)
            
            // Record alert sent in state machine
            SignalCache.recordAlertSent(enhancedSignal, symbol)
            SignalCache.setTradeState(symbol, "IN_TRADE", "ENTRY alert sent")
          } catch (telegramError) {
            console.error("[v0] SILVER: Failed to send alert:", telegramError)
          }
        } else {
          console.log(`[v0] SILVER ENTRY ALERT BLOCKED: ${alertCheck.reason}`)
        }
      } else if (!entryDecision.allowed) {
        console.log(`[v0] SILVER ENTRY BLOCKED: Tier ${entryDecision.tier} | Score ${entryDecision.score}/9 | Reasons: ${entryDecision.blockedReasons.join(" | ")}`)
      }

      // GET READY ALERTS: Optional, controlled "setup forming" alerts
      if (evalResult.getReadyAlert?.shouldSend && process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
        try {
          const notifier = new SilverNotifier(
            process.env.TELEGRAM_BOT_TOKEN,
            process.env.TELEGRAM_CHAT_ID,
          )
          console.log("[v0] SILVER: Sending GET READY alert")
          await notifier.sendSilverGetReadyAlert(
            signal.mtfBias?.h4 as "LONG" | "SHORT",
            evalResult.getReadyAlert.conditionPercentage,
            evalResult.getReadyAlert.missingConditions,
          )
        } catch (telegramError) {
          console.error("[v0] SILVER: Failed to send GET READY alert:", telegramError)
        }
      }

      return NextResponse.json({
        success: true,
        signal: enhancedSignal,
        timestamp: lastValidTimestampXAG,
        marketClosed: false,
        symbol: "XAG_USD",
      })
    } catch (fetchError) {
      console.error("[v0] XAG: Error fetching data:", fetchError)
      return NextResponse.json({
        success: false,
        error: "Failed to fetch data",
        symbol: "XAG_USD",
      }, { status: 500 })
    }
  } catch (error) {
    console.error("[v0] XAG: Internal error:", error)
    return NextResponse.json({
      success: false,
      error: "Internal error",
      symbol: "XAG_USD",
    }, { status: 500 })
  }
}
