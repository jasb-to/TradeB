/**
 * GET_READY Evaluator Module
 * 
 * STRICT RULE: GET_READY is INFORMATIONAL ONLY
 * - NEVER triggers a trade
 * - NEVER bypasses EntryDecision
 * - NEVER affects alert levels or scoring
 */

import type { Signal, EntryDecision } from "@/types/trading"

export interface GetReadyState {
  isGetReady: boolean
  direction: "LONG" | "SHORT" | null
  htfPolarity: "LONG" | "SHORT" | "NEUTRAL_IMPROVING" | "NEUTRAL_CONFLICTING"
  primaryBlocker: string
  structuralConditionsMet: number
  structuralConditionsRequired: number
  indicatorConditionsMet: boolean
  blockedReason: string | null
  legitimate: boolean
}

interface HTFStructure {
  daily: "HH" | "HL" | "LL" | "LH" | "NEUTRAL"
  h4: "HH" | "HL" | "LL" | "LH" | "NEUTRAL"
}

interface IndicatorValues {
  adx: number
  atr: number
  rsi: number
  stochRSI: number
  stochRSIState: "MOMENTUM_UP" | "MOMENTUM_DOWN" | "COMPRESSION" | "CALCULATING"
}

interface MTFBias {
  daily?: "LONG" | "SHORT" | "NEUTRAL"
  h4?: "LONG" | "SHORT" | "NEUTRAL"
  h1?: "LONG" | "SHORT" | "NEUTRAL"
  m15?: "LONG" | "SHORT" | "NEUTRAL"
  m5?: "LONG" | "SHORT" | "NEUTRAL"
}

// Thresholds - these match existing config, NOT modifying strategy
const ADX_THRESHOLD = 20
const ATR_THRESHOLD_XAU = 10
const ATR_THRESHOLD_XAG = 0.25
const RSI_MIN = 25
const RSI_MAX = 75

// Track last GET_READY alert per symbol/direction to prevent spam
const lastGetReadyAlert: Record<string, { direction: string; timestamp: number }> = {}
const GET_READY_COOLDOWN_MS = 4 * 60 * 60 * 1000 // 4 hours

export class GetReadyEvaluator {
  /**
   * Evaluate GET_READY state - INFORMATIONAL ONLY
   * This does NOT modify EntryDecision or affect trading logic
   */
  static evaluate(
    signal: Signal,
    entryDecision: EntryDecision,
    marketOpen: boolean,
    htfStructure: HTFStructure,
    indicators: IndicatorValues,
    mtfBias: MTFBias,
    vwapBias: "LONG" | "SHORT" | "NEUTRAL",
    symbol: string,
    hasActiveTrade: boolean,
    isInCooldown: boolean
  ): GetReadyState {
    // Default blocked state
    const blockedState: GetReadyState = {
      isGetReady: false,
      direction: null,
      htfPolarity: "NEUTRAL_CONFLICTING",
      primaryBlocker: "Not evaluated",
      structuralConditionsMet: 0,
      structuralConditionsRequired: 2,
      indicatorConditionsMet: false,
      blockedReason: null,
      legitimate: false
    }

    // ========================
    // GLOBAL GET_READY CONDITIONS
    // ========================

    // 1. Market must be OPEN
    if (!marketOpen) {
      return { ...blockedState, blockedReason: "Market closed", primaryBlocker: "Market closed" }
    }

    // 2. entryDecision.allowed must be FALSE
    if (entryDecision.allowed) {
      return { ...blockedState, blockedReason: "Entry already allowed", primaryBlocker: "Entry allowed" }
    }

    // 3. signal.type must NOT be "ENTRY"
    if (signal.type === "ENTRY") {
      return { ...blockedState, blockedReason: "Signal is ENTRY", primaryBlocker: "Active entry signal" }
    }

    // 4. signal.alertLevel must be 0
    if (signal.alertLevel !== 0) {
      return { ...blockedState, blockedReason: "Alert level not zero", primaryBlocker: "Alert active" }
    }

    // 5. HTF polarity must NOT be CONFLICTING
    const htfPolarity = this.determineHTFPolarity(htfStructure)
    if (htfPolarity === "NEUTRAL_CONFLICTING") {
      return { ...blockedState, htfPolarity, blockedReason: "HTF polarity conflicting", primaryBlocker: "HTF conflict (Daily vs 4H)" }
    }

    // ========================
    // BLOCKER FILTER
    // ========================

    // Check for momentum/volatility failure in blocked reasons
    const blockedReasons = entryDecision.blockedReasons.map(r => r.toLowerCase())
    if (blockedReasons.some(r => r.includes("momentum"))) {
      return { ...blockedState, htfPolarity, blockedReason: "Momentum failure", primaryBlocker: "Momentum failure" }
    }
    if (blockedReasons.some(r => r.includes("volatility"))) {
      return { ...blockedState, htfPolarity, blockedReason: "Volatility failure", primaryBlocker: "Volatility too low" }
    }

    // Check cooldown
    if (isInCooldown) {
      return { ...blockedState, htfPolarity, blockedReason: "In cooldown window", primaryBlocker: "Cooldown active" }
    }

    // Check active trade
    if (hasActiveTrade) {
      return { ...blockedState, htfPolarity, blockedReason: "Active trade exists", primaryBlocker: "Trade already active" }
    }

    // ========================
    // INDICATOR REQUIREMENTS
    // ========================

    const atrThreshold = symbol === "XAU_USD" ? ATR_THRESHOLD_XAU : ATR_THRESHOLD_XAG
    const indicatorsMet = 
      indicators.adx >= ADX_THRESHOLD &&
      indicators.atr >= atrThreshold &&
      (indicators.stochRSIState === "MOMENTUM_UP" || indicators.stochRSIState === "MOMENTUM_DOWN") &&
      indicators.rsi > RSI_MIN &&
      indicators.rsi < RSI_MAX

    if (!indicatorsMet) {
      const failedIndicators: string[] = []
      if (indicators.adx < ADX_THRESHOLD) failedIndicators.push(`ADX ${indicators.adx.toFixed(1)} < ${ADX_THRESHOLD}`)
      if (indicators.atr < atrThreshold) failedIndicators.push(`ATR ${indicators.atr.toFixed(2)} < ${atrThreshold}`)
      if (indicators.stochRSIState !== "MOMENTUM_UP" && indicators.stochRSIState !== "MOMENTUM_DOWN") {
        failedIndicators.push(`StochRSI state: ${indicators.stochRSIState}`)
      }
      if (indicators.rsi <= RSI_MIN || indicators.rsi >= RSI_MAX) {
        failedIndicators.push(`RSI extreme: ${indicators.rsi.toFixed(1)}`)
      }
      return { 
        ...blockedState, 
        htfPolarity, 
        indicatorConditionsMet: false,
        blockedReason: `Indicators not met: ${failedIndicators.join(", ")}`,
        primaryBlocker: failedIndicators[0] || "Indicators not met"
      }
    }

    // ========================
    // STRUCTURAL REQUIREMENTS (need 2 of 3)
    // ========================

    const dominantDirection = this.getDominantDirection(htfPolarity, htfStructure)
    let structuralMet = 0

    // 1. MTF Bias aligned on 1H OR 15M
    const mtf1hAligned = mtfBias.h1 === dominantDirection
    const mtf15mAligned = mtfBias.m15 === dominantDirection
    if (mtf1hAligned || mtf15mAligned) {
      structuralMet++
    }

    // 2. HTF structure improving (one aligned, other neutral = NEUTRAL_IMPROVING)
    if (htfPolarity === "NEUTRAL_IMPROVING" || htfPolarity === dominantDirection) {
      structuralMet++
    }

    // 3. VWAP bias matches dominant HTF direction
    if (vwapBias === dominantDirection) {
      structuralMet++
    }

    if (structuralMet < 2) {
      return {
        ...blockedState,
        htfPolarity,
        indicatorConditionsMet: true,
        structuralConditionsMet: structuralMet,
        blockedReason: `Only ${structuralMet}/2 structural conditions met`,
        primaryBlocker: `Structural alignment: ${structuralMet}/2`
      }
    }

    // ========================
    // GET_READY IS VALID
    // ========================

    const primaryBlocker = this.determinePrimaryBlocker(entryDecision.blockedReasons, htfPolarity)

    // Log the GET_READY trigger
    console.log(`[v0][GET_READY]`)
    console.log(`Symbol: ${symbol}`)
    console.log(`Direction: ${dominantDirection}`)
    console.log(`HTF polarity: ${htfPolarity}`)
    console.log(`MTF alignment: 1H=${mtfBias.h1} 15M=${mtfBias.m15} VWAP=${vwapBias}`)
    console.log(`ADX=${indicators.adx.toFixed(1)} ATR=${indicators.atr.toFixed(2)} RSI=${indicators.rsi.toFixed(1)} StochRSI=${indicators.stochRSIState}`)
    console.log(`Primary blocker: ${primaryBlocker}`)
    console.log(`Legitimate = true`)

    return {
      isGetReady: true,
      direction: dominantDirection,
      htfPolarity,
      primaryBlocker,
      structuralConditionsMet: structuralMet,
      structuralConditionsRequired: 2,
      indicatorConditionsMet: true,
      blockedReason: null,
      legitimate: true
    }
  }

  /**
   * Determine HTF polarity based on Daily and 4H structure
   */
  private static determineHTFPolarity(htfStructure: HTFStructure): "LONG" | "SHORT" | "NEUTRAL_IMPROVING" | "NEUTRAL_CONFLICTING" {
    const { daily, h4 } = htfStructure

    const dailyBullish = daily === "HH" || daily === "HL"
    const dailyBearish = daily === "LL" || daily === "LH"
    const h4Bullish = h4 === "HH" || h4 === "HL"
    const h4Bearish = h4 === "LL" || h4 === "LH"

    // CONFLICTING: Daily and 4H opposing
    if ((dailyBullish && h4Bearish) || (dailyBearish && h4Bullish)) {
      return "NEUTRAL_CONFLICTING"
    }

    // LONG: Both aligned bullish
    if (dailyBullish && h4Bullish) {
      return "LONG"
    }

    // SHORT: Both aligned bearish
    if (dailyBearish && h4Bearish) {
      return "SHORT"
    }

    // NEUTRAL_IMPROVING: One aligned, other neutral
    if ((dailyBullish && h4 === "NEUTRAL") || (daily === "NEUTRAL" && h4Bullish)) {
      return "NEUTRAL_IMPROVING"
    }
    if ((dailyBearish && h4 === "NEUTRAL") || (daily === "NEUTRAL" && h4Bearish)) {
      return "NEUTRAL_IMPROVING"
    }

    // Both neutral
    return "NEUTRAL_CONFLICTING"
  }

  /**
   * Get dominant direction from HTF polarity
   */
  private static getDominantDirection(
    htfPolarity: "LONG" | "SHORT" | "NEUTRAL_IMPROVING" | "NEUTRAL_CONFLICTING",
    htfStructure: HTFStructure
  ): "LONG" | "SHORT" {
    if (htfPolarity === "LONG") return "LONG"
    if (htfPolarity === "SHORT") return "SHORT"

    // For NEUTRAL_IMPROVING, determine from the aligned timeframe
    const dailyBullish = htfStructure.daily === "HH" || htfStructure.daily === "HL"
    const dailyBearish = htfStructure.daily === "LL" || htfStructure.daily === "LH"
    const h4Bullish = htfStructure.h4 === "HH" || htfStructure.h4 === "HL"
    const h4Bearish = htfStructure.h4 === "LL" || htfStructure.h4 === "LH"

    if (dailyBullish || h4Bullish) return "LONG"
    if (dailyBearish || h4Bearish) return "SHORT"

    return "LONG" // Default fallback
  }

  /**
   * Determine primary blocker from entry decision
   */
  private static determinePrimaryBlocker(blockedReasons: string[], htfPolarity: string): string {
    if (blockedReasons.length === 0) {
      return htfPolarity.includes("NEUTRAL") ? "Waiting for HTF alignment" : "Entry criteria not met"
    }
    return blockedReasons[0]
  }

  /**
   * Check if GET_READY Telegram alert should be sent (4H cooldown per direction)
   */
  static shouldSendTelegramAlert(symbol: string, direction: "LONG" | "SHORT"): boolean {
    const key = `${symbol}_${direction}`
    const last = lastGetReadyAlert[key]
    
    if (!last) return true
    
    const elapsed = Date.now() - last.timestamp
    return elapsed >= GET_READY_COOLDOWN_MS
  }

  /**
   * Record that a GET_READY alert was sent
   */
  static recordTelegramAlert(symbol: string, direction: "LONG" | "SHORT"): void {
    const key = `${symbol}_${direction}`
    lastGetReadyAlert[key] = {
      direction,
      timestamp: Date.now()
    }
  }

  /**
   * Reset GET_READY tracking (call when HTF polarity changes or ENTRY occurs)
   */
  static resetTracking(symbol: string): void {
    const keysToDelete = Object.keys(lastGetReadyAlert).filter(k => k.startsWith(symbol))
    keysToDelete.forEach(k => delete lastGetReadyAlert[k])
  }
}
