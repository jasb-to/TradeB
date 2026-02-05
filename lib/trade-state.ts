import type { Signal, TradeStateInfo, TradeLifecycleState } from "@/types/trading"

export class TradeStateCalculator {
  static computeTradeState(signal: Signal, currentPrice: number): TradeStateInfo {
    const entry = signal.entryPrice || currentPrice
    const sl = signal.stopLoss || 0
    const tp1 = signal.takeProfit1 || 0
    const tp2 = signal.takeProfit2 || 0
    const vwap = signal.indicators?.vwap || 0
    const stochRsi = signal.indicators?.stochRSI

    // Get momentum state
    let momentumState = "NEUTRAL"
    if (stochRsi && typeof stochRsi === "object" && "state" in stochRsi) {
      momentumState = (stochRsi as any).state || "NEUTRAL"
    }

    let state: TradeLifecycleState = "ACTIVE"
    let reason = ""
    let invalidationRisk: string | null = null

    // Check if TP2 is hit first (final state)
    if (signal.direction === "LONG") {
      if (currentPrice >= tp2) {
        state = "TP2_HIT"
        reason = `Price ${currentPrice.toFixed(2)} >= TP2 ${tp2.toFixed(2)}`
        return { state, priceDistance: currentPrice - entry, percentToTP1: 100, percentToTP2: 100, pullbackDepth: 0, invalidationRisk, reason }
      }

      // Check if TP1 is hit
      if (currentPrice >= tp1) {
        state = "TP1_HIT"
        reason = `Price ${currentPrice.toFixed(2)} >= TP1 ${tp1.toFixed(2)}`
        return { state, priceDistance: currentPrice - entry, percentToTP1: 100, percentToTP2: ((currentPrice - tp1) / (tp2 - tp1)) * 100, pullbackDepth: 0, invalidationRisk, reason }
      }

      // Check if stop is hit
      if (currentPrice <= sl) {
        state = "STOPPED"
        reason = `Price ${currentPrice.toFixed(2)} <= Stop ${sl.toFixed(2)}`
        return { state, priceDistance: currentPrice - entry, percentToTP1: ((currentPrice - entry) / (tp1 - entry)) * 100, percentToTP2: 0, pullbackDepth: entry - currentPrice, invalidationRisk, reason }
      }

      // Check invalidation signals
      const vwapLost = currentPrice < vwap * 0.998 // Price below VWAP
      const momentumBroken = momentumState === "COMPRESSION" || momentumState === "CALCULATING"
      const structureRisk = currentPrice < entry - ((entry - sl) * 0.5) // Price dropped 50% of distance to SL

      if (vwapLost || momentumBroken || structureRisk) {
        invalidationRisk = []
        if (vwapLost) invalidationRisk.push("VWAP loss")
        if (momentumBroken) invalidationRisk.push("Momentum compressed")
        if (structureRisk) invalidationRisk.push("Approaching 50% SL")

        // Near invalidation if conditions are close but not confirmed
        if ((currentPrice > sl * 1.1 || currentPrice > entry - ((entry - sl) * 0.3))) {
          state = "NEAR_INVALIDATION"
          reason = `Invalidation risk: ${(invalidationRisk as string[]).join(", ")}`
          const pullbackDepth = Math.max(0, entry - currentPrice)
          return { state, priceDistance: currentPrice - entry, percentToTP1: ((currentPrice - entry) / (tp1 - entry)) * 100, percentToTP2: ((currentPrice - entry) / (tp2 - entry)) * 100, pullbackDepth, invalidationRisk: reason, reason }
        }

        // Confirmed invalidation
        state = "INVALIDATED"
        reason = `Trade invalidated: ${(invalidationRisk as string[]).join(", ")}`
        return { state, priceDistance: currentPrice - entry, percentToTP1: ((currentPrice - entry) / (tp1 - entry)) * 100, percentToTP2: ((currentPrice - entry) / (tp2 - entry)) * 100, pullbackDepth: Math.max(0, entry - currentPrice), invalidationRisk: reason, reason }
      }

      // Healthy pullback (price pulling back but structure intact)
      if (currentPrice < entry) {
        state = "PULLBACK_HEALTHY"
        const pullbackDepth = entry - currentPrice
        reason = `Healthy pullback: ${pullbackDepth.toFixed(2)} from entry. Structure intact.`
        return { state, priceDistance: currentPrice - entry, percentToTP1: ((currentPrice - entry) / (tp1 - entry)) * 100, percentToTP2: ((currentPrice - entry) / (tp2 - entry)) * 100, pullbackDepth, invalidationRisk, reason }
      }
    } else if (signal.direction === "SHORT") {
      if (currentPrice <= tp2) {
        state = "TP2_HIT"
        reason = `Price ${currentPrice.toFixed(2)} <= TP2 ${tp2.toFixed(2)}`
        return { state, priceDistance: entry - currentPrice, percentToTP1: 100, percentToTP2: 100, pullbackDepth: 0, invalidationRisk, reason }
      }

      if (currentPrice <= tp1) {
        state = "TP1_HIT"
        reason = `Price ${currentPrice.toFixed(2)} <= TP1 ${tp1.toFixed(2)}`
        return { state, priceDistance: entry - currentPrice, percentToTP1: 100, percentToTP2: ((tp1 - currentPrice) / (tp1 - tp2)) * 100, pullbackDepth: 0, invalidationRisk, reason }
      }

      if (currentPrice >= sl) {
        state = "STOPPED"
        reason = `Price ${currentPrice.toFixed(2)} >= Stop ${sl.toFixed(2)}`
        return { state, priceDistance: entry - currentPrice, percentToTP1: ((entry - currentPrice) / (entry - tp1)) * 100, percentToTP2: 0, pullbackDepth: currentPrice - entry, invalidationRisk, reason }
      }

      const vwapLost = currentPrice > vwap * 1.002 // Price above VWAP
      const momentumBroken = momentumState === "COMPRESSION" || momentumState === "CALCULATING"
      const structureRisk = currentPrice > entry + ((sl - entry) * 0.5)

      if (vwapLost || momentumBroken || structureRisk) {
        invalidationRisk = []
        if (vwapLost) invalidationRisk.push("VWAP loss")
        if (momentumBroken) invalidationRisk.push("Momentum compressed")
        if (structureRisk) invalidationRisk.push("Approaching 50% SL")

        if ((currentPrice < sl * 0.9 || currentPrice < entry + ((sl - entry) * 0.3))) {
          state = "NEAR_INVALIDATION"
          reason = `Invalidation risk: ${(invalidationRisk as string[]).join(", ")}`
          const pullbackDepth = Math.max(0, currentPrice - entry)
          return { state, priceDistance: entry - currentPrice, percentToTP1: ((entry - currentPrice) / (entry - tp1)) * 100, percentToTP2: ((entry - currentPrice) / (entry - tp2)) * 100, pullbackDepth, invalidationRisk: reason, reason }
        }

        state = "INVALIDATED"
        reason = `Trade invalidated: ${(invalidationRisk as string[]).join(", ")}`
        return { state, priceDistance: entry - currentPrice, percentToTP1: ((entry - currentPrice) / (entry - tp1)) * 100, percentToTP2: ((entry - currentPrice) / (entry - tp2)) * 100, pullbackDepth: Math.max(0, currentPrice - entry), invalidationRisk: reason, reason }
      }

      if (currentPrice > entry) {
        state = "PULLBACK_HEALTHY"
        const pullbackDepth = currentPrice - entry
        reason = `Healthy pullback: ${pullbackDepth.toFixed(2)} from entry. Structure intact.`
        return { state, priceDistance: entry - currentPrice, percentToTP1: ((entry - currentPrice) / (entry - tp1)) * 100, percentToTP2: ((entry - currentPrice) / (entry - tp2)) * 100, pullbackDepth, invalidationRisk, reason }
      }
    }

    // Default ACTIVE state
    state = "ACTIVE"
    reason = "Trade active - monitoring for TP targets or invalidation signals"
    const distancePct = signal.direction === "LONG" ? ((currentPrice - entry) / (tp2 - entry)) * 100 : ((entry - currentPrice) / (entry - tp2)) * 100

    return {
      state,
      priceDistance: signal.direction === "LONG" ? currentPrice - entry : entry - currentPrice,
      percentToTP1: signal.direction === "LONG" ? ((currentPrice - entry) / (tp1 - entry)) * 100 : ((entry - currentPrice) / (entry - tp1)) * 100,
      percentToTP2: distancePct,
      pullbackDepth: 0,
      invalidationRisk,
      reason,
    }
  }
}
