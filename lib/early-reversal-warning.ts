import type { Signal, ActiveTrade } from "@/types/trading"
import type { Candle } from "@/lib/technical-analysis"
import { TechnicalAnalysis } from "@/lib/technical-analysis"

export interface EarlyReversalWarning {
  tradeId: string
  symbol: string
  triggeredConditions: string[]
  conditionCount: number
  currentPrice: number
  entryPrice: number
  direction: "LONG" | "SHORT"
  timestamp: number
}

/**
 * Early Reversal Warning System
 * Monitors active trades for 2+ reversal risk indicators
 * Purely advisory - does NOT auto-close trades or modify SL
 */
export const EarlyReversalWarningSystem = {
  /**
   * Evaluate if an active trade should trigger early reversal warning
   * Requires 2 or more conditions to trigger
   */
  evaluateReversalRisk: (
    trade: ActiveTrade,
    currentPrice: number,
    candles1h: Candle[],
    candles15m: Candle[],
    initialADX: number,
    symbol: string
  ): EarlyReversalWarning | null => {
    const triggeredConditions: string[] = []

    // CONDITION 1: 1H Bias Weakening (LONG/SHORT → NEUTRAL)
    if (candles1h.length >= 20) {
      const indicators1h = TechnicalAnalysis.calculateAllIndicators(candles1h)
      const bias1h = TechnicalAnalysis.determineBias(candles1h, indicators1h)

      if (
        (trade.direction === "LONG" && bias1h === "NEUTRAL") ||
        (trade.direction === "SHORT" && bias1h === "NEUTRAL")
      ) {
        triggeredConditions.push("1H Bias Weakening (NEUTRAL)")
      }

      // CONDITION 2: ADX Decay (current ADX ≤ 80% of entry ADX)
      const currentADX = indicators1h.adx || initialADX
      const adxDecayThreshold = initialADX * 0.8

      if (currentADX <= adxDecayThreshold && initialADX > 0) {
        const decayPercent = (((initialADX - currentADX) / initialADX) * 100).toFixed(1)
        triggeredConditions.push(`ADX Decay (${decayPercent}% decline)`)
      }

      // CONDITION 3: VWAP Loss (price closes back through VWAP against position)
      const vwap = indicators1h.vwap || currentPrice
      if (trade.direction === "LONG" && currentPrice < vwap) {
        triggeredConditions.push("VWAP Loss (price below VWAP)")
      } else if (trade.direction === "SHORT" && currentPrice > vwap) {
        triggeredConditions.push("VWAP Loss (price above VWAP)")
      }

      // CONDITION 4: Chandelier Exit Threat (price within 0.25 × ATR of chandelier level)
      const atr1h = indicators1h.atr || 0
      const chandelierStop = TechnicalAnalysis.calculateChandelierStop(candles1h, 22, 3)
      const chandelierTP = trade.direction === "LONG" ? chandelierStop.long : chandelierStop.short
      const distanceToChandelier = Math.abs(chandelierTP - currentPrice)
      const chandelierWarningZone = atr1h * 0.25

      if (distanceToChandelier <= chandelierWarningZone) {
        triggeredConditions.push(
          `Chandelier Exit Threatened (${(distanceToChandelier / atr1h).toFixed(2)}x ATR away)`
        )
      }
    }

    // CONDITION 5: 15m Bias Flip (opposes trade direction)
    if (candles15m.length >= 10) {
      const indicators15m = TechnicalAnalysis.calculateAllIndicators(candles15m)
      const bias15m = TechnicalAnalysis.determineBias(candles15m, indicators15m)

      if (
        (trade.direction === "LONG" && bias15m === "BEARISH") ||
        (trade.direction === "SHORT" && bias15m === "BULLISH")
      ) {
        triggeredConditions.push(`15m Bias Flip (${bias15m})`)
      }
    }

    // CONDITION 6: Momentum Score Collapse (< 50% of entry confidence)
    // Estimated by checking if price has stalled
    const priceChange = Math.abs(currentPrice - trade.entryPrice)
    const entryATR = (trade.takeProfit2 - trade.stopLoss) / 2 // Rough ATR estimate from TP/SL

    if (entryATR > 0 && priceChange < entryATR * 0.25) {
      triggeredConditions.push("Momentum Score Collapse (<25% ATR move)")
    }

    // TRIGGER: 2 or more conditions met
    if (triggeredConditions.length >= 2) {
      return {
        tradeId: trade.id,
        symbol,
        triggeredConditions,
        conditionCount: triggeredConditions.length,
        currentPrice,
        entryPrice: trade.entryPrice,
        direction: trade.direction,
        timestamp: Date.now(),
      }
    }

    return null
  },

  /**
   * Generate alert message for Telegram
   */
  formatAlertMessage: (warning: EarlyReversalWarning): string => {
    const emoji = warning.direction === "LONG" ? "🔼" : "🔽"
    const pnlPercent = (((warning.currentPrice - warning.entryPrice) / warning.entryPrice) * 100).toFixed(2)

    return `⚠️ EARLY REVERSAL WARNING – ${warning.symbol}\n\n` +
      `${emoji} ${warning.direction} Trade Active\n` +
      `Entry: ${warning.entryPrice.toFixed(2)}\n` +
      `Current: ${warning.currentPrice.toFixed(2)}\n` +
      `P&L: ${pnlPercent}%\n\n` +
      `Reversal Risk Factors (${warning.conditionCount} triggered):\n` +
      warning.triggeredConditions.map((c) => `• ${c}`).join("\n") +
      `\n\n⚠️ This is a WARNING, not an exit.\n` +
      `Manage risk manually or set additional stops.`
  },
}
