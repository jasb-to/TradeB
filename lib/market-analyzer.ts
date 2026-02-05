import type { Candle, TechnicalIndicators } from "@/types/trading"
import { TechnicalAnalysis } from "./indicators"

export type MarketState = "STRONG_TREND" | "TREND" | "RANGING" | "LOW_VOLATILITY" | "CHOPPY" | "UNKNOWN"

export interface MarketConditionAnalysis {
  state: MarketState
  confidence: number // 0-100
  adx: number
  atr: number
  vwap: number
  atrPercent: number // ATR as % of current price
  volatilityRating: "VERY_HIGH" | "HIGH" | "NORMAL" | "LOW" | "VERY_LOW"
  isInTrend: boolean
  isTrendingUp: boolean
  isTrendingDown: boolean
  isRanging: boolean
  rangeHigh?: number
  rangeLow?: number
  rangeMidpoint?: number
}

export interface PositionRiskAlert {
  triggered: boolean
  riskLevel: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "NONE"
  reason: string
  currentPrice: number
  stopLoss: number
  entry: number
  riskAmount: number
  percentFromEntry: number
  action: "HOLD" | "EXIT_PARTIAL" | "EXIT_FULL" | "NONE"
  timestamp: number
}

export interface ExitSignal {
  triggered: boolean
  type: "STOP_LOSS" | "RISK_REVERSAL" | "TREND_BREAK" | "VOLATILITY_SPIKE" | "TIME_BASED" | "NONE"
  strength: "CRITICAL" | "STRONG" | "MODERATE" | "WEAK" | "NONE"
  reason: string
  recommendation: "EXIT_FULL" | "EXIT_PARTIAL" | "HOLD" | "NONE"
  confidence: number // 0-100
  timestamp: number
}

export interface IndicatorAccuracy {
  symbol: string
  totalSignals: number
  winningTrades: number
  losingTrades: number
  winRate: number
  profitFactor: number
  adxReliability: number
  vwapAccuracy: number
  atrEffectiveness: number
  stochRSITiming: number
  overallConfidence: number
}

export class MarketStateAnalyzer {
  /**
   * Analyze comprehensive market conditions for decision making
   */
  static analyzeMarketCondition(
    candles: Candle[],
    indicators: TechnicalIndicators,
    currentPrice: number,
  ): MarketConditionAnalysis {
    if (!candles.length) {
      return this.unknownState()
    }

    const adx = indicators.adx || 0
    const atr = indicators.atr || 0
    const vwap = indicators.vwap || 0

    // Calculate ATR as % of current price
    const atrPercent = (atr / currentPrice) * 100

    // Determine volatility rating
    let volatilityRating: "VERY_HIGH" | "HIGH" | "NORMAL" | "LOW" | "VERY_LOW"
    if (atrPercent > 2.0) volatilityRating = "VERY_HIGH"
    else if (atrPercent > 1.5) volatilityRating = "HIGH"
    else if (atrPercent > 0.8) volatilityRating = "NORMAL"
    else if (atrPercent > 0.4) volatilityRating = "LOW"
    else volatilityRating = "VERY_LOW"

    // Determine if trending
    const isInTrend = adx > 20
    const strongTrend = adx > 25

    // Price vs VWAP for direction
    const isTrendingUp = currentPrice > vwap && isInTrend
    const isTrendingDown = currentPrice < vwap && isInTrend
    const isRanging = !isInTrend && volatilityRating === "NORMAL"

    // Determine state
    let state: MarketState
    if (strongTrend && isTrendingUp) state = "STRONG_TREND"
    else if (strongTrend && isTrendingDown) state = "STRONG_TREND"
    else if (isInTrend) state = "TREND"
    else if (isRanging) state = "RANGING"
    else if (volatilityRating === "VERY_LOW" || volatilityRating === "LOW") state = "LOW_VOLATILITY"
    else state = "CHOPPY"

    // Calculate range high/low from recent candles
    const recentCandles = candles.slice(-20)
    const rangeHigh = Math.max(...recentCandles.map((c) => c.high))
    const rangeLow = Math.min(...recentCandles.map((c) => c.low))
    const rangeMidpoint = (rangeHigh + rangeLow) / 2

    // Confidence in the identified state
    let confidence = 50
    if (state === "STRONG_TREND") confidence = Math.min(adx, 100)
    else if (state === "TREND") confidence = Math.min(adx - 10, 90)
    else if (state === "RANGING") confidence = Math.min(100 - adx, 90)
    else if (state === "LOW_VOLATILITY") confidence = Math.min((1 / atrPercent) * 20, 85)

    return {
      state,
      confidence,
      adx,
      atr,
      vwap,
      atrPercent,
      volatilityRating,
      isInTrend,
      isTrendingUp,
      isTrendingDown,
      isRanging,
      rangeHigh,
      rangeLow,
      rangeMidpoint,
    }
  }

  /**
   * Detect if position is at risk and should exit
   */
  static analyzePositionRisk(
    currentPrice: number,
    entryPrice: number,
    stopLoss: number,
    direction: "LONG" | "SHORT",
    riskRewardRatio: number,
  ): PositionRiskAlert {
    const distanceToStop = Math.abs(currentPrice - stopLoss)
    const riskAmount = Math.abs(entryPrice - stopLoss)
    const percentFromEntry = ((currentPrice - entryPrice) / entryPrice) * 100

    let riskLevel: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "NONE"
    let action: "HOLD" | "EXIT_PARTIAL" | "EXIT_FULL" | "NONE"

    // Check if position is under stress
    if (direction === "LONG") {
      // Price approaching stop loss
      if (distanceToStop < riskAmount * 0.25) {
        riskLevel = "CRITICAL"
        action = "EXIT_FULL"
      } else if (distanceToStop < riskAmount * 0.5) {
        riskLevel = "HIGH"
        action = "EXIT_PARTIAL"
      } else if (percentFromEntry < -2) {
        riskLevel = "MEDIUM"
        action = "EXIT_PARTIAL"
      } else if (currentPrice < stopLoss) {
        riskLevel = "CRITICAL"
        action = "EXIT_FULL"
      } else {
        riskLevel = "LOW"
        action = "HOLD"
      }
    } else {
      // SHORT logic
      if (distanceToStop < riskAmount * 0.25) {
        riskLevel = "CRITICAL"
        action = "EXIT_FULL"
      } else if (distanceToStop < riskAmount * 0.5) {
        riskLevel = "HIGH"
        action = "EXIT_PARTIAL"
      } else if (percentFromEntry > 2) {
        riskLevel = "MEDIUM"
        action = "EXIT_PARTIAL"
      } else if (currentPrice > stopLoss) {
        riskLevel = "CRITICAL"
        action = "EXIT_FULL"
      } else {
        riskLevel = "LOW"
        action = "HOLD"
      }
    }

    return {
      triggered: riskLevel !== "NONE" && riskLevel !== "LOW",
      riskLevel,
      reason:
        riskLevel === "CRITICAL"
          ? `Position critically close to stop loss. Distance: ${distanceToStop.toFixed(2)}`
          : riskLevel === "HIGH"
            ? `Position approaching stop loss. Distance: ${distanceToStop.toFixed(2)}`
            : riskLevel === "MEDIUM"
              ? `Position moving against entry. ${percentFromEntry.toFixed(2)}% from entry`
              : "Position within acceptable risk",
      currentPrice,
      stopLoss,
      entry: entryPrice,
      riskAmount,
      percentFromEntry,
      action,
      timestamp: Date.now(),
    }
  }

  /**
   * Generate exit signals based on technical conditions
   */
  static generateExitSignal(
    currentPrice: number,
    entryPrice: number,
    stopLoss: number,
    indicators: TechnicalIndicators,
    marketCondition: MarketConditionAnalysis,
    direction: "LONG" | "SHORT",
    candles: Candle[],
  ): ExitSignal {
    let exitTriggered = false
    let type: ExitSignal["type"] = "NONE"
    let strength: ExitSignal["strength"] = "NONE"
    let confidence = 0
    let reason = ""

    // Check for stop loss breach
    if ((direction === "LONG" && currentPrice <= stopLoss) || (direction === "SHORT" && currentPrice >= stopLoss)) {
      return {
        triggered: true,
        type: "STOP_LOSS",
        strength: "CRITICAL",
        reason: "Stop loss hit",
        recommendation: "EXIT_FULL",
        confidence: 100,
        timestamp: Date.now(),
      }
    }

    // Check for trend reversal
    const adxDropped = indicators.adx !== undefined && indicators.adx < 20
    const priceBreaksVWAP =
      direction === "LONG"
        ? currentPrice < (indicators.vwap || 0)
        : currentPrice > (indicators.vwap || 0)

    if ((adxDropped || priceBreaksVWAP) && marketCondition.state === "RANGING") {
      exitTriggered = true
      type = "TREND_BREAK"
      strength = "STRONG"
      confidence = 75
      reason = "Trend reversal detected - market shifted to ranging"
    }

    // Check for excessive volatility
    if (
      marketCondition.volatilityRating === "VERY_HIGH" &&
      marketCondition.atrPercent > 3.0 &&
      Math.abs((currentPrice - entryPrice) / entryPrice) < 0.01
    ) {
      exitTriggered = true
      type = "VOLATILITY_SPIKE"
      strength = "MODERATE"
      confidence = 60
      reason = "Extreme volatility spike - risk management exit"
    }

    // Check for stochastic divergence (exit signal)
    if (indicators.stochRSI !== undefined) {
      const isOverbought = indicators.stochRSI > 80 && direction === "LONG"
      const isOversold = indicators.stochRSI < 20 && direction === "SHORT"

      if ((isOverbought || isOversold) && marketCondition.state !== "STRONG_TREND") {
        exitTriggered = true
        type = "RISK_REVERSAL"
        strength = "MODERATE"
        confidence = 65
        reason = "Momentum reversal signal - oscillator extreme"
      }
    }

    // Time-based exit (e.g., after 4 hours in position)
    // This would be tracked in the main signal object - placeholder here
    // if (timeInPosition > 4 * 60 * 60 * 1000 && profitPercent < 0.5) {
    //   type = "TIME_BASED"
    // }

    return {
      triggered: exitTriggered,
      type,
      strength,
      reason,
      recommendation:
        strength === "CRITICAL" ? "EXIT_FULL" : strength === "STRONG" ? "EXIT_PARTIAL" : "HOLD",
      confidence,
      timestamp: Date.now(),
    }
  }

  private static unknownState(): MarketConditionAnalysis {
    return {
      state: "UNKNOWN",
      confidence: 0,
      adx: 0,
      atr: 0,
      vwap: 0,
      atrPercent: 0,
      volatilityRating: "NORMAL",
      isInTrend: false,
      isTrendingUp: false,
      isTrendingDown: false,
      isRanging: false,
    }
  }
}

export class IndicatorAccuracyTracker {
  /**
   * Calculate historical accuracy of indicators
   * This would be populated from trading history
   */
  static calculateAccuracy(
    totalSignals: number,
    winningTrades: number,
    losingTrades: number,
  ): IndicatorAccuracy {
    const winRate = totalSignals > 0 ? (winningTrades / totalSignals) * 100 : 0
    const profitFactor =
      losingTrades > 0
        ? winningTrades / losingTrades
        : winningTrades > 0
          ? Infinity
          : 0

    return {
      symbol: "XAU_USD / XAG_USD",
      totalSignals,
      winningTrades,
      losingTrades,
      winRate,
      profitFactor,
      adxReliability: this.estimateADXReliability(winRate),
      vwapAccuracy: this.estimateVWAPAccuracy(winRate),
      atrEffectiveness: this.estimateATREffectiveness(winRate),
      stochRSITiming: this.estimateStochRSITiming(winRate),
      overallConfidence: (winRate / 100) * 100, // Convert to confidence score
    }
  }

  private static estimateADXReliability(winRate: number): number {
    // ADX is reliable for trending markets (60-70% base accuracy)
    return Math.min(65 + (winRate - 50) * 0.3, 95)
  }

  private static estimateVWAPAccuracy(winRate: number): number {
    // VWAP accuracy for support/resistance (55-75%)
    return Math.min(65 + (winRate - 50) * 0.4, 95)
  }

  private static estimateATREffectiveness(winRate: number): number {
    // ATR for stop loss placement (60-80%)
    return Math.min(70 + (winRate - 50) * 0.4, 95)
  }

  private static estimateStochRSITiming(winRate: number): number {
    // Stoch RSI timing accuracy (50-70%)
    return Math.min(60 + (winRate - 50) * 0.2, 85)
  }
}
