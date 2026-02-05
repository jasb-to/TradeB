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

export class SilverStrategyModerate {
  /**
   * MODERATE APPROACH: RELAXED SILVER STRATEGY
   * 
   * Phase 1 Implementation:
   * - Extended Session: 05:00-19:00 UTC (vs 07:00-17:00)
   * - Relaxed Volatility: ATR ≥ 0.15 (vs 0.25)
   * - Flexible Alignment: ANY ONE timeframe + 1H confirmation
   * - Lower ADX: ≥ 16 (vs 18)
   * 
   * Expected Impact: 15-25 Silver trades (vs 0 currently)
   * Win Rate Target: 85-90%
   */
  static evaluateSilverSignal(
    dataDaily: Candle[],
    data4h: Candle[],
    data1h: Candle[],
    data15m: Candle[] = [],
    data5m: Candle[] = [],
  ): SilverEvalResult {
    if (!data1h.length || !data4h.length) {
      console.log("[v0] SILVER MODERATE: Insufficient 1H/4H data for evaluation")
      return {
        signal: { type: "NO_TRADE", timestamp: Date.now(), alertLevel: 0, confidence: 0, strategy: "BREAKOUT_MODERATE", reasons: [], indicators: {} },
      }
    }

    // MODERATE: Extended session filter (05:00-19:00 UTC)
    if (!SilverCache.isSessionAllowedExtended()) {
      console.log(`[v0] SILVER MODERATE NO_TRADE: ${SilverCache.getSessionStatusExtended()}`)
      return {
        signal: { type: "NO_TRADE", timestamp: Date.now(), alertLevel: 0, confidence: 0, strategy: "BREAKOUT_MODERATE", reasons: [SilverCache.getSessionStatusExtended()], indicators: {} },
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

    console.log(`[v0] SILVER MODERATE: ADX=${adx1h.toFixed(1)} ATR=${atr1h.toFixed(3)} Price=${close1h.toFixed(2)}`)

    // MODERATE: Relaxed volatility filter (ATR ≥ 0.15 vs 0.25)
    if (atr1h < 0.15) {
      console.log(`[v0] SILVER MODERATE NO_TRADE: ATR too low (${atr1h.toFixed(3)} < 0.15)`)
      return {
        signal: { type: "NO_TRADE", timestamp: Date.now(), alertLevel: 0, confidence: 0, strategy: "BREAKOUT_MODERATE", reasons: ["ATR insufficient"], indicators: { atr: atr1h, adx: adx1h } },
      }
    }

    // Determine bias from each timeframe
    const biasDaily = indicatorsDaily ? this.determineBias(dataDaily, indicatorsDaily) : "NEUTRAL"
    const bias4h = this.determineBias(data4h, indicators4h)
    const bias1h = this.determineBias(data1h, indicators1h)
    const bias15m = data15m.length > 0 && indicators15m ? this.determineBias(data15m, indicators15m) : "NEUTRAL"
    const bias5m = data5m.length > 0 && indicators5m ? this.determineBias(data5m, indicators5m) : "NEUTRAL"

    console.log(`[v0] SILVER MODERATE BIAS: Daily=${biasDaily} 4H=${bias4h} 1H=${bias1h} 15M=${bias15m} 5M=${bias5m}`)

    // MODERATE: Flexible MTF alignment (ANY ONE + 1H confirmation)
    const hasAnyAlignment = this.hasAnyTimeframeAlignment(biasDaily, bias4h, bias1h)
    const has1HConfirmation = bias1h !== "NEUTRAL"
    
    const mtfAligned = hasAnyAlignment && has1HConfirmation
    const alignedDirection = this.getAlignedDirection(biasDaily, bias4h, bias1h)

    console.log(`[v0] SILVER MODERATE MTF: AnyAlignment=${hasAnyAlignment} 1HConfirm=${has1HConfirmation} Aligned=${mtfAligned} Direction=${alignedDirection}`)

    // Calculate setup completion percentage for "Get Ready" alerts
    let conditionPercentage = 0
    const missingConditions: string[] = []

    if (mtfAligned) conditionPercentage += 0.4
    else missingConditions.push("MTF alignment")

    // MODERATE: Lower ADX threshold (≥ 16 vs 18)
    if (adx1h >= 16) conditionPercentage += 0.3
    else missingConditions.push(`ADX recovery (${adx1h.toFixed(1)}/16)`)

    if (atr1h >= 0.15) conditionPercentage += 0.2
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
        console.log(`[v0] SILVER MODERATE GET_READY: ${(conditionPercentage * 100).toFixed(0)}% conditions met`)
      }
    }

    // ENTRY logic with MODERATE thresholds
    const isAPlusSetup = adx1h >= 22 && atr1h >= 0.15 && mtfAligned
    const isASetup = adx1h >= 16 && atr1h >= 0.15 && mtfAligned // MODERATE: ADX ≥ 16

    if (!isAPlusSetup && !isASetup) {
      console.log(`[v0] SILVER MODERATE NO_TRADE: Below A tier (ADX=${adx1h.toFixed(1)} ATR=${atr1h.toFixed(3)} MTF=${mtfAligned})`)
      return {
        signal: { type: "NO_TRADE", timestamp: Date.now(), alertLevel: 0, confidence: 0, strategy: "BREAKOUT_MODERATE", reasons: missingConditions, indicators: { atr: atr1h, adx: adx1h } },
        getReadyAlert,
      }
    }

    // ONE TRADE RULE: Check if direction is already locked
    if (SilverCache.isDirectionLocked(alignedDirection as "LONG" | "SHORT")) {
      console.log(`[v0] SILVER MODERATE BLOCKED: ${alignedDirection} already active (ONE TRADE RULE)`)
      return {
        signal: { type: "NO_TRADE", timestamp: Date.now(), alertLevel: 0, confidence: 0, strategy: "BREAKOUT_MODERATE", reasons: [`${alignedDirection} trade already active`], indicators: { atr: atr1h, adx: adx1h } },
      }
    }

    // Calculate entry, SL, TP for Silver using MODERATE parameters
    const atrPoints = atr1h
    const entryPrice = close1h
    const stopLoss = alignedDirection === "LONG" 
      ? close1h - atrPoints * 1.5 
      : close1h + atrPoints * 1.5
    
    const tp1 = alignedDirection === "LONG" 
      ? close1h + atrPoints * 2.0  // MODERATE: Tighter TP1
      : close1h - atrPoints * 2.0
    
    const tp2 = alignedDirection === "LONG" 
      ? close1h + atrPoints * 3.0
      : close1h - atrPoints * 3.0

    const riskReward = Math.abs(tp1 - entryPrice) / Math.abs(entryPrice - stopLoss)
    const setupQuality = isAPlusSetup ? "A+" : "A"
    const confidence = isAPlusSetup ? 90 : 85 // MODERATE: Slightly lower confidence

    console.log(`[v0] SILVER MODERATE ${setupQuality} ENTRY: ${alignedDirection} @${entryPrice.toFixed(2)} SL=${stopLoss.toFixed(2)} TP1=${tp1.toFixed(2)} RR=${riskReward.toFixed(2)}:1`)

    return {
      signal: {
        type: "ENTRY",
        timestamp: Date.now(),
        direction: alignedDirection as "LONG" | "SHORT",
        alertLevel: 3,
        confidence,
        strategy: "BREAKOUT_MODERATE",
        setupQuality: isAPlusSetup ? "A+" : "STANDARD",
        entryPrice,
        stopLoss,
        takeProfit1: tp1,
        takeProfit2: tp2,
        riskReward,
        indicators: { atr: atr1h, adx: adx1h },
        mtfBias: {
          daily: biasDaily,
          "8h": "NEUTRAL",
          "4h": bias4h,
          "1h": bias1h,
          "15m": bias15m,
          "5m": bias5m,
        },
        reasons: [
          `${setupQuality} Setup: MTF ${hasAnyAlignment ? "Any TF aligned" : "Single TF"} + 1H confirmation`,
          `ADX ${adx1h.toFixed(1)} (threshold: ${isAPlusSetup ? "≥22" : "≥16"})`,
          `ATR ${atr1h.toFixed(3)} (volatility adequate)`,
          `Risk:Reward ${riskReward.toFixed(2)}:1`,
        ],
      },
    }
  }

  // MODERATE: Flexible MTF alignment (ANY ONE timeframe + 1H confirmation)
  private static hasAnyTimeframeAlignment(
    dailyBias: string, 
    h4Bias: string, 
    h1Bias: string
  ): boolean {
    const dailyPlusFourH = dailyBias !== "NEUTRAL" && h4Bias !== "NEUTRAL" && dailyBias === h4Bias
    const fourHPlus1H = h4Bias !== "NEUTRAL" && h1Bias !== "NEUTRAL" && h4Bias === h1Bias
    const dailyPlus1H = dailyBias !== "NEUTRAL" && h1Bias !== "NEUTRAL" && dailyBias === h1Bias
    
    return dailyPlusFourH || fourHPlus1H || dailyPlus1H
  }

  // MODERATE: Get aligned direction from any timeframe
  private static getAlignedDirection(
    dailyBias: string, 
    h4Bias: string, 
    h1Bias: string
  ): string {
    // Priority: 1H > 4H > Daily (faster timeframes more relevant for Silver)
    if (h1Bias !== "NEUTRAL") return h1Bias
    if (h4Bias !== "NEUTRAL") return h4Bias
    if (dailyBias !== "NEUTRAL") return dailyBias
    return "NONE"
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