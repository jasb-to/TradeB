/**
 * B-TRADE EVALUATOR - DIAGNOSTIC ONLY, NON-INVASIVE
 * 
 * This module evaluates B_SETUP opportunities independently from A/A+ logic.
 * B trades are NEVER ESCALATED to ENTRY automatically.
 * B trades are NEVER TRIGGERED by cron jobs.
 * B trades are DIAGNOSTIC ONLY - for visibility into early structure recognition.
 * 
 * CORE RULE: A/A+ logic remains COMPLETELY UNCHANGED.
 */

import type { Signal, EntryDecision, HTFPolarityState } from "@/types/trading"

export interface BTradeEvaluationResult {
  isValid: boolean
  classification: "ONE_RULE_AWAY" | "STRUCTURE_DELAY" | "INDICATOR_LAG" | "NONE"
  reason: string
  indicatorGaps: {
    adxGap: number // How far from B threshold
    rsiGap: number // How far from B threshold
    atrGap: number // 0 if passed, positive if failed
  }
  structureScore: number // 0-3 based on timeframe alignment
  positionSizePercent: number // 50-60% of A trade
  blockers: string[] // What prevents A/A+ tier
  nextUpgradeCondition: string | null
}

export const BTradeEvaluator = {
  /**
   * Evaluate if a signal qualifies as B_SETUP
   * Called ONLY when A/A+ are rejected
   * Never modifies signal or makes trading decisions
   */
  evaluateBSetup(signal: Signal, aDecision: EntryDecision): BTradeEvaluationResult {
    const result: BTradeEvaluationResult = {
      isValid: false,
      classification: "NONE",
      reason: "Not evaluated",
      indicatorGaps: { adxGap: 0, rsiGap: 0, atrGap: 0 },
      structureScore: 0,
      positionSizePercent: 50,
      blockers: [...aDecision.blockedReasons],
      nextUpgradeCondition: null,
    }

    // GUARD: Only evaluate if A/A+ were explicitly rejected
    if (aDecision.allowed) {
      result.reason = "A/A+ already approved - B not evaluated"
      return result
    }

    // GUARD: Must have direction
    if (!signal.direction) {
      result.reason = "No direction specified"
      return result
    }

    // GUARD: Must have indicators
    if (!signal.indicators) {
      result.reason = "No indicators available"
      return result
    }

    // ====== B-TIER ENTRY CONDITIONS ======

    // 1. STRUCTURE CHECK (2 of 3 required, relaxed from A/A+)
    const dailyState = signal.mtfBias?.daily
    const h4State = signal.mtfBias?.["4h"]
    const h1State = signal.mtfBias?.["1h"]

    // Reject if Daily is explicitly OPPOSING the signal direction
    if (dailyState && dailyState !== "NO_CLEAR_BIAS" && dailyState !== signal.direction) {
      // Check if it's improving (transitioning toward direction)
      const isImproving =
        (signal.htfPolarityState === "NEUTRAL_IMPROVING" || 
         signal.htfPolarityState === "SOFT_CONFLICT")
      
      if (!isImproving) {
        result.reason = "Daily structure explicitly opposing"
        result.blockers.push("Daily opposing (not improving)")
        return result
      }
    }

    // Count aligned timeframes (2 of 3 required)
    let alignedCount = 0
    if (h4State === signal.direction) alignedCount++
    if (h1State === signal.direction) alignedCount++
    if (dailyState === signal.direction) alignedCount++

    if (alignedCount < 2) {
      result.reason = `Insufficient structure alignment: ${alignedCount}/3`
      result.blockers.push(`Only ${alignedCount}/3 timeframes aligned`)
      return result
    }

    result.structureScore = alignedCount

    // 2. HTF POLARITY CHECK (Allow ONLY NEUTRAL_IMPROVING or SOFT_CONFLICT)
    const polarityState = signal.htfPolarityState as HTFPolarityState | undefined
    const allowedPolarities = ["NEUTRAL_IMPROVING", "SOFT_CONFLICT"]

    if (polarityState && !allowedPolarities.includes(polarityState)) {
      result.reason = `HTF polarity not compatible: ${polarityState}`
      result.blockers.push(`HTF polarity: ${polarityState}`)
      return result
    }

    // 3. INDICATOR THRESHOLDS (3% RELAXED vs A/A+)
    const atr = signal.indicators.atr || 0
    const adx = signal.indicators.adx || 0
    const rsi = signal.indicators.rsi || 0

    // ATR must still pass (no volatility compression)
    const atrThreshold = 2.375
    if (atr < atrThreshold) {
      result.reason = `ATR compression: ${atr.toFixed(2)} < ${atrThreshold}`
      result.blockers.push(`ATR compression`)
      result.indicatorGaps.atrGap = atrThreshold - atr
      return result
    }

    // ADX: B requires 18+ (A requires 20+)
    const adxThresholdB = 18
    const adxGap = adxThresholdB - adx
    if (adx < adxThresholdB) {
      result.indicatorGaps.adxGap = adxGap
      result.blockers.push(`ADX weak: ${adx.toFixed(1)} < ${adxThresholdB}`)
      // Note: ADX alone doesn't block B if other conditions are met
    }

    // RSI: Check direction-specific thresholds
    let rsiGap = 0
    const isLong = signal.direction === "LONG"
    const rsiThresholdLong = 55
    const rsiThresholdShort = 45

    if (isLong && rsi < rsiThresholdLong) {
      rsiGap = rsiThresholdLong - rsi
      result.blockers.push(`RSI weak for LONG: ${rsi.toFixed(1)} < ${rsiThresholdLong}`)
    } else if (!isLong && rsi > rsiThresholdShort) {
      rsiGap = rsi - rsiThresholdShort
      result.blockers.push(`RSI weak for SHORT: ${rsi.toFixed(1)} > ${rsiThresholdShort}`)
    }

    result.indicatorGaps.rsiGap = rsiGap

    // 4. BLOCKER RULE (Maximum 1 blocker, must be HTF-related)
    const nonHTFBlockers = result.blockers.filter(
      (b) =>
        !b.includes("Daily") &&
        !b.includes("4H") &&
        !b.includes("1H") &&
        !b.includes("HTF") &&
        !b.includes("polarity")
    )

    if (nonHTFBlockers.length > 1) {
      result.reason = `Too many non-HTF blockers: ${nonHTFBlockers.join(", ")}`
      return result
    }

    // Counter-trend blocks are NOT allowed
    if (result.blockers.some((b) => b.includes("Counter-trend"))) {
      result.reason = "Counter-trend detected - B not allowed"
      return result
    }

    // ====== CLASSIFICATION ======

    if (adxGap > 0 && rsiGap === 0) {
      result.classification = "INDICATOR_LAG"
      result.nextUpgradeCondition = `ADX > ${adxThresholdB}`
    } else if (alignedCount === 2 && polarityState === "NEUTRAL_IMPROVING") {
      result.classification = "STRUCTURE_DELAY"
      result.nextUpgradeCondition = "Wait for Daily alignment"
    } else if (alignedCount >= 3 && adxGap <= 1) {
      result.classification = "ONE_RULE_AWAY"
      result.nextUpgradeCondition = "Slight momentum confirmation needed"
    }

    // All checks passed
    result.isValid = true
    result.reason = "B_SETUP valid"
    result.positionSizePercent = 50 + Math.random() * 10 // 50-60%

    return result
  },

  /**
   * Get human-readable classification name
   */
  getClassificationLabel(classification: string): string {
    const labels: Record<string, string> = {
      ONE_RULE_AWAY: "Very Close to A",
      STRUCTURE_DELAY: "Early Structure",
      INDICATOR_LAG: "Momentum Lag",
      NONE: "N/A",
    }
    return labels[classification] || classification
  },
}
