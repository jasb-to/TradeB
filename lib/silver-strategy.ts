import type { Candle, Signal, TechnicalIndicators } from "@/types/trading"
import { TechnicalAnalysis } from "./indicators"
import { SilverCache } from "./silver-cache"

export interface SilverEvalResult {
  signal: Signal
  getReadyAlert?: {
    shouldSend: boolean
    conditionPercentage: number
    missingConditions: string[]
  }
}

export class SilverStrategy {
  /**
   * Evaluate Silver (XAG/USD) signal with STRICT requirements
   * 
   * Multi-Timeframe Alignment: Valid if ANY TWO align (not all three required)
   * - Daily + 4H
   * - 4H + 1H
   * 
   * ADX Thresholds:
   * - A+ Setup: ADX ≥ 22
   * - A Setup: ADX ≥ 18
   * 
   * Volatility Filter:
   * - Minimum ATR ≥ 0.25
   * 
   * Session Filter:
   * - Only 07:00-17:00 UTC
   * 
   * ONE TRADE RULE:
   * - Max 1 active trade per direction
   * - Block re-entries until TP2/SL AND bias resets
   */
  static evaluateSilverSignal(
    dataDaily: Candle[],
    data4h: Candle[],
    data1h: Candle[],
    data15m: Candle[] = [],
    data5m: Candle[] = [],
  ): SilverEvalResult {
    if (!data1h.length || !data4h.length) {
      console.log("[v0] SILVER: Insufficient 1H/4H data for evaluation")
      return {
        signal: { type: "NO_TRADE", timestamp: Date.now(), alertLevel: 0, confidence: 0, strategy: "BREAKOUT", reasons: [], indicators: {} },
      }
    }

    // Check session first - fail fast
    if (!SilverCache.isSessionAllowed()) {
      console.log(`[v0] SILVER NO_TRADE: ${SilverCache.getSessionStatus()}`)
      return {
        signal: { type: "NO_TRADE", timestamp: Date.now(), alertLevel: 0, confidence: 0, strategy: "BREAKOUT", reasons: [SilverCache.getSessionStatus()], indicators: {} },
      }
    }

    const indicatorsDaily = dataDaily.length > 0 ? TechnicalAnalysis.calculateAllIndicators(dataDaily, { symbol: "XAG_USD" }) : null
    const indicators4h = TechnicalAnalysis.calculateAllIndicators(data4h, { symbol: "XAG_USD" })
    const indicators1h = TechnicalAnalysis.calculateAllIndicators(data1h, { symbol: "XAG_USD" })
    const indicators15m = data15m.length > 0 ? TechnicalAnalysis.calculateAllIndicators(data15m, { symbol: "XAG_USD" }) : null
    const indicators5m = data5m.length > 0 ? TechnicalAnalysis.calculateAllIndicators(data5m, { symbol: "XAG_USD" }) : null

    const adx1h = indicators1h.adx || 0
    const atr1h = indicators1h.atr || 0
    const close1h = data1h[data1h.length - 1].close

    console.log(`[v0] SILVER: ADX=${adx1h.toFixed(1)} ATR=${atr1h.toFixed(3)} Price=${close1h.toFixed(2)}`)

    // Volatility filter: reject ultra-low volatility
    if (atr1h < 0.25) {
      console.log(`[v0] SILVER NO_TRADE: ATR too low (${atr1h.toFixed(3)} < 0.25)`)
      return {
        signal: { type: "NO_TRADE", timestamp: Date.now(), alertLevel: 0, confidence: 0, strategy: "BREAKOUT", reasons: ["ATR insufficient"], indicators: { atr: atr1h, adx: adx1h } },
      }
    }

    // Determine bias from each timeframe
    const biasDaily = indicatorsDaily ? this.determineBias(dataDaily, indicatorsDaily) : "NEUTRAL"
    const bias4h = this.determineBias(data4h, indicators4h)
    const bias1h = this.determineBias(data1h, indicators1h)
    const bias15m = data15m.length > 0 && indicators15m ? this.determineBias(data15m, indicators15m) : "NEUTRAL"
    const bias5m = data5m.length > 0 && indicators5m ? this.determineBias(data5m, indicators5m) : "NEUTRAL"

    console.log(`[v0] SILVER BIAS: Daily=${biasDaily} 4H=${bias4h} 1H=${bias1h} 15M=${bias15m} 5M=${bias5m}`)

    // Multi-timeframe alignment: Valid if ANY TWO align
    const dailyPlusFourH = biasDaily !== "NEUTRAL" && bias4h !== "NEUTRAL" && biasDaily === bias4h
    const fourHPlus1H = bias4h !== "NEUTRAL" && bias1h !== "NEUTRAL" && bias4h === bias1h

    const mtfAligned = dailyPlusFourH || fourHPlus1H
    const alignedDirection = (dailyPlusFourH ? biasDaily : bias4h) || "NONE"

    console.log(`[v0] SILVER MTF: Daily+4H=${dailyPlusFourH} 4H+1H=${fourHPlus1H} Aligned=${mtfAligned} Direction=${alignedDirection}`)

    // Calculate setup completion percentage for "Get Ready" alerts
    let conditionPercentage = 0
    const missingConditions: string[] = []

    if (mtfAligned) conditionPercentage += 0.4
    else missingConditions.push("MTF alignment")

    if (adx1h >= 18) conditionPercentage += 0.3
    else missingConditions.push(`ADX recovery (${adx1h.toFixed(1)}/18)`)

    if (atr1h >= 0.25) conditionPercentage += 0.2
    else missingConditions.push("ATR adequate")

    if (bias1h !== "NEUTRAL") conditionPercentage += 0.1
    else missingConditions.push("1H confirmation")

    // Send "Get Ready" alert if 80%+ of conditions met but not full setup
    let getReadyAlert: SilverEvalResult["getReadyAlert"] | undefined
    if (conditionPercentage >= 0.8 && conditionPercentage < 1.0) {
      const getReadyCheck = SilverCache.canSendGetReadyAlert(conditionPercentage, bias4h)
      if (getReadyCheck.allowed) {
        getReadyAlert = {
          shouldSend: true,
          conditionPercentage,
          missingConditions,
        }
        console.log(`[v0] SILVER GET_READY: ${(conditionPercentage * 100).toFixed(0)}% conditions met`)
      }
    }

    // ENTRY logic
    const isAPlusSetup = adx1h >= 22 && atr1h >= 0.25 && mtfAligned
    const isASetup = adx1h >= 18 && atr1h >= 0.25 && mtfAligned

    if (!isAPlusSetup && !isASetup) {
      console.log(`[v0] SILVER NO_TRADE: Below A tier (ADX=${adx1h.toFixed(1)} ATR=${atr1h.toFixed(3)} MTF=${mtfAligned})`)
      return {
        signal: { type: "NO_TRADE", timestamp: Date.now(), alertLevel: 0, confidence: 0, strategy: "BREAKOUT", reasons: missingConditions, indicators: { atr: atr1h, adx: adx1h } },
        getReadyAlert,
      }
    }

    // ONE TRADE RULE: Check if direction is already locked
    if (SilverCache.isDirectionLocked(alignedDirection as "LONG" | "SHORT")) {
      console.log(`[v0] SILVER BLOCKED: ${alignedDirection} already active (ONE TRADE RULE)`)
      return {
        signal: { type: "NO_TRADE", timestamp: Date.now(), alertLevel: 0, confidence: 0, strategy: "BREAKOUT", reasons: [`${alignedDirection} trade already active`], indicators: { atr: atr1h, adx: adx1h } },
      }
    }

    // Calculate entry, SL, TP for Silver using ATR
    const atrPoints = atr1h
    const entryPrice = close1h
    const stopLoss = alignedDirection === "LONG" 
      ? close1h - atrPoints * 1.5 
      : close1h + atrPoints * 1.5
    
    const tp1 = alignedDirection === "LONG" 
      ? close1h + atrPoints * 1.5 
      : close1h - atrPoints * 1.5
    
    const tp2 = alignedDirection === "LONG" 
      ? close1h + atrPoints * 3 
      : close1h - atrPoints * 3

    const riskReward = Math.abs(tp1 - entryPrice) / Math.abs(entryPrice - stopLoss)
    const setupQuality = isAPlusSetup ? "A+" : "A"
    const confidence = isAPlusSetup ? 95 : 85

    console.log(`[v0] SILVER ${setupQuality} ENTRY: ${alignedDirection} @${entryPrice.toFixed(2)} SL=${stopLoss.toFixed(2)} TP1=${tp1.toFixed(2)} RR=${riskReward.toFixed(2)}:1`)

    return {
      signal: {
        type: "ENTRY",
        timestamp: Date.now(),
        direction: alignedDirection as "LONG" | "SHORT",
        alertLevel: 3,
        confidence,
        strategy: "BREAKOUT",
        setupQuality: isAPlusSetup ? "A+" : "STANDARD",
        entryPrice,
        stopLoss,
        takeProfit1: tp1,
        takeProfit2: tp2,
        riskReward,
        indicators: { atr: atr1h, adx: adx1h },
        mtfBias: {
          daily: biasDaily,
          "4h": bias4h,
          "1h": bias1h,
        },
        reasons: [
          `${setupQuality} Setup: MTF ${dailyPlusFourH ? "Daily+4H" : "4H+1H"} aligned`,
          `ADX ${adx1h.toFixed(1)} (threshold: ${isAPlusSetup ? "≥22" : "≥18"})`,
          `ATR ${atr1h.toFixed(3)} (volatility adequate)`,
          `Risk:Reward ${riskReward.toFixed(2)}:1`,
        ],
      },
    }
  }

  private static determineBias(data: Candle[], indicators: any): "LONG" | "SHORT" | "NEUTRAL" {
    if (!data.length) return "NEUTRAL"

    const close = data[data.length - 1].close
    const ema20 = indicators.ema20 || 0
    const ema50 = indicators.ema50 || 0
    const rsi = indicators.rsi || 50

    // Silver-specific bias: Price position + EMA alignment + RSI
    if (close > ema20 && ema20 > ema50 && rsi > 50) return "LONG"
    if (close < ema20 && ema20 < ema50 && rsi < 50) return "SHORT"
    return "NEUTRAL"
  }
}
