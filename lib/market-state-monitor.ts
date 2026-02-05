import type { Candle, TechnicalIndicators } from "@/types/trading"
import { TechnicalAnalysis } from "./indicators"

export interface MarketState {
  regime: "HIGH_TREND" | "TREND" | "WEAK" | "CHOPPY"
  bias: "BULLISH" | "BEARISH" | "RANGING"
  volatility: "HIGH" | "MEDIUM" | "LOW"
  momentum: "STRONG_UP" | "MODERATE_UP" | "NEUTRAL" | "MODERATE_DOWN" | "STRONG_DOWN"
  strength: number // 0-10 scale
  riskLevel: "HIGH" | "MEDIUM" | "LOW"
  indicators: {
    adx: number
    atr: number
    rsi: number
    stochRSI: number
    vwap: number
  }
  signals: {
    trendConfirmed: boolean
    volatilityAdequate: boolean
    momentumAligned: boolean
    supportResistanceValid: boolean
  }
  warnings: string[]
  recommendations: string[]
}

export interface IndicatorVerification {
  symbol: string
  timestamp: number
  indicators: TechnicalIndicators
  verification: {
    adxAccurate: boolean
    atrAccurate: boolean
    rsiAccurate: boolean
    stochRSIAccurate: boolean
    vwapAccurate: boolean
    allValid: boolean
  }
  deviations: string[]
  confidence: number // 0-100%
}

export class MarketStateMonitor {
  /**
   * Analyze current market state based on technical indicators
   */
  static analyzeMarketState(
    candles: Candle[],
    indicators: TechnicalIndicators,
    symbol: string = "XAU_USD",
  ): MarketState {
    const adx = indicators.adx || 0
    const atr = indicators.atr || 0
    const rsi = indicators.rsi || 50
    const stochRSI = indicators.stochRSI || 50
    const vwap = indicators.vwap || 0

    // Determine market regime
    const regime = adx >= 25 ? "HIGH_TREND" : adx >= 20 ? "TREND" : adx >= 15 ? "WEAK" : "CHOPPY"

    // Determine market bias
    const bias = this.determineBias(indicators)

    // Assess volatility
    const minAtr = symbol === "XAU_USD" ? 2.5 : 0.35
    const volatility =
      atr >= minAtr * 1.5 ? "HIGH" : atr >= minAtr ? "MEDIUM" : "LOW"

    // Determine momentum
    const momentum = this.determineMomentum(rsi, stochRSI, indicators.macd)

    // Calculate overall strength
    const strength = this.calculateMarketStrength(adx, atr, rsi, stochRSI, vwap, minAtr)

    // Assess risk level
    const riskLevel = this.assessRiskLevel(adx, atr, rsi, volatility)

    // Check signal validity
    const signals = {
      trendConfirmed: adx >= 20 && bias !== "RANGING",
      volatilityAdequate: volatility !== "LOW",
      momentumAligned: this.isMomentumAligned(rsi, stochRSI, bias),
      supportResistanceValid: indicators.supportResistance ? 
        (indicators.supportResistance.support.length > 0 && indicators.supportResistance.resistance.length > 0) : false,
    }

    // Generate warnings
    const warnings = this.generateWarnings(adx, atr, rsi, stochRSI, volatility, regime, signals)

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      regime,
      bias,
      volatility,
      momentum,
      strength,
      signals,
      warnings,
    )

    return {
      regime,
      bias,
      volatility,
      momentum,
      strength,
      riskLevel,
      indicators: { adx, atr, rsi, stochRSI, vwap },
      signals,
      warnings,
      recommendations,
    }
  }

  /**
   * Verify indicator accuracy by cross-checking calculations
   */
  static verifyIndicators(
    candles: Candle[],
    indicators: TechnicalIndicators,
    symbol: string = "XAU_USD",
  ): IndicatorVerification {
    const verification = {
      adxAccurate: false,
      atrAccurate: false,
      rsiAccurate: false,
      stochRSIAccurate: false,
      vwapAccurate: false,
      allValid: false,
    }

    const deviations: string[] = []
    let validCount = 0

    // Verify ADX
    if (candles.length >= 30) {
      const recalcADX = TechnicalAnalysis.calculateADX(candles)
      const adxDiff = Math.abs(recalcADX - (indicators.adx || 0))
      if (adxDiff < 2) {
        verification.adxAccurate = true
        validCount++
      } else {
        deviations.push(`ADX deviation: ${adxDiff.toFixed(2)} points`)
      }
    }

    // Verify ATR
    if (candles.length >= 15) {
      const recalcATR = TechnicalAnalysis.calculateATR(candles)
      const atrDiff = Math.abs(recalcATR - (indicators.atr || 0))
      const atrDeviation = (atrDiff / (indicators.atr || 1)) * 100
      if (atrDeviation < 5) {
        verification.atrAccurate = true
        validCount++
      } else {
        deviations.push(`ATR deviation: ${atrDeviation.toFixed(1)}%`)
      }
    }

    // Verify RSI
    if (candles.length >= 15) {
      const recalcRSI = TechnicalAnalysis.calculateRSI(candles)
      const rsiDiff = Math.abs(recalcRSI - (indicators.rsi || 50))
      if (rsiDiff < 3) {
        verification.rsiAccurate = true
        validCount++
      } else {
        deviations.push(`RSI deviation: ${rsiDiff.toFixed(2)} points`)
      }
    }

    // Verify StochRSI
    if (candles.length >= 30) {
      const recalcStochRSI = TechnicalAnalysis.calculateStochasticRSI(candles)
      const stochDiff = Math.abs(recalcStochRSI - (indicators.stochRSI || 50))
      if (stochDiff < 5) {
        verification.stochRSIAccurate = true
        validCount++
      } else {
        deviations.push(`StochRSI deviation: ${stochDiff.toFixed(2)} points`)
      }
    }

    // Verify VWAP
    if (candles.length > 0) {
      const recalcVWAP = TechnicalAnalysis.calculateVWAP(candles)
      const vwapDiff = Math.abs(recalcVWAP - (indicators.vwap || 0))
      const minPrice = Math.min(...candles.map((c) => c.low))
      const vwapDeviation = (vwapDiff / (minPrice || 1)) * 100
      if (vwapDeviation < 2) {
        verification.vwapAccurate = true
        validCount++
      } else {
        deviations.push(`VWAP deviation: ${vwapDeviation.toFixed(2)}%`)
      }
    }

    verification.allValid = validCount >= 4
    const confidence = (validCount / 5) * 100

    return {
      symbol,
      timestamp: Date.now(),
      indicators,
      verification,
      deviations,
      confidence,
    }
  }

  /**
   * Detect if market conditions require exit
   */
  static checkExitConditions(
    currentPrice: number,
    tradeEntry: number,
    tradeStopLoss: number,
    tradeTakeProfit1: number,
    tradeTakeProfit2: number,
    indicators: TechnicalIndicators,
    direction: "LONG" | "SHORT",
  ): {
    shouldExit: boolean
    exitReason: string | null
    urgency: "CRITICAL" | "HIGH" | "MEDIUM" | null
    recommendation: string
  } {
    const rsi = indicators.rsi || 50
    const adx = indicators.adx || 0
    const atr = indicators.atr || 0
    const stochRSI = indicators.stochRSI || 50

    // Check basic price levels
    if (direction === "LONG") {
      if (currentPrice >= tradeTakeProfit2) {
        return {
          shouldExit: true,
          exitReason: "TP2 target reached",
          urgency: "HIGH",
          recommendation: "Close position at TP2",
        }
      }

      if (currentPrice <= tradeStopLoss) {
        return {
          shouldExit: true,
          exitReason: "Stop loss hit",
          urgency: "CRITICAL",
          recommendation: "IMMEDIATE: Exit position to protect capital",
        }
      }

      // Check for reversal patterns
      if (rsi > 75 && stochRSI > 80) {
        return {
          shouldExit: true,
          exitReason: "Overbought reversal signal",
          urgency: "HIGH",
          recommendation: "Consider taking profits - market is overbought",
        }
      }

      // Check for trend loss
      if (adx < 15) {
        return {
          shouldExit: true,
          exitReason: "Trend momentum weakening",
          urgency: "MEDIUM",
          recommendation: "Trend is weakening - consider partial exit",
        }
      }
    } else {
      // SHORT logic
      if (currentPrice <= tradeTakeProfit2) {
        return {
          shouldExit: true,
          exitReason: "TP2 target reached",
          urgency: "HIGH",
          recommendation: "Close position at TP2",
        }
      }

      if (currentPrice >= tradeStopLoss) {
        return {
          shouldExit: true,
          exitReason: "Stop loss hit",
          urgency: "CRITICAL",
          recommendation: "IMMEDIATE: Exit position to protect capital",
        }
      }

      if (rsi < 25 && stochRSI < 20) {
        return {
          shouldExit: true,
          exitReason: "Oversold reversal signal",
          urgency: "HIGH",
          recommendation: "Consider taking profits - market is oversold",
        }
      }

      if (adx < 15) {
        return {
          shouldExit: true,
          exitReason: "Trend momentum weakening",
          urgency: "MEDIUM",
          recommendation: "Trend is weakening - consider partial exit",
        }
      }
    }

    return {
      shouldExit: false,
      exitReason: null,
      urgency: null,
      recommendation: "Continue monitoring position",
    }
  }

  private static determineBias(indicators: TechnicalIndicators): "BULLISH" | "BEARISH" | "RANGING" {
    return indicators.marketBias || "RANGING"
  }

  private static determineMomentum(
    rsi: number,
    stochRSI: number,
    macd?: { macd: number; signal: number; histogram: number },
  ): "STRONG_UP" | "MODERATE_UP" | "NEUTRAL" | "MODERATE_DOWN" | "STRONG_DOWN" {
    let score = 0

    if (rsi > 70) score += 2
    else if (rsi > 60) score += 1
    else if (rsi < 30) score -= 2
    else if (rsi < 40) score -= 1

    if (stochRSI > 75) score += 1
    else if (stochRSI < 25) score -= 1

    if (macd && macd.histogram > 0) score += 1
    else if (macd && macd.histogram < 0) score -= 1

    if (score >= 3) return "STRONG_UP"
    if (score >= 1) return "MODERATE_UP"
    if (score <= -3) return "STRONG_DOWN"
    if (score <= -1) return "MODERATE_DOWN"
    return "NEUTRAL"
  }

  private static isMomentumAligned(
    rsi: number,
    stochRSI: number,
    bias: "BULLISH" | "BEARISH" | "RANGING",
  ): boolean {
    if (bias === "BULLISH") return rsi > 50 && stochRSI > 50
    if (bias === "BEARISH") return rsi < 50 && stochRSI < 50
    return true // RANGING allows both
  }

  private static calculateMarketStrength(
    adx: number,
    atr: number,
    rsi: number,
    stochRSI: number,
    vwap: number,
    minAtr: number,
  ): number {
    let strength = 0

    // ADX contribution (0-3)
    if (adx >= 30) strength += 3
    else if (adx >= 25) strength += 2.5
    else if (adx >= 20) strength += 2
    else if (adx >= 15) strength += 1

    // ATR contribution (0-2)
    if (atr >= minAtr * 1.5) strength += 2
    else if (atr >= minAtr) strength += 1.5

    // RSI contribution (0-2)
    if ((rsi > 60 && rsi < 80) || (rsi > 20 && rsi < 40)) strength += 2
    else if ((rsi > 50 && rsi < 70) || (rsi > 30 && rsi < 50)) strength += 1

    // StochRSI contribution (0-2)
    if ((stochRSI > 70 && stochRSI < 90) || (stochRSI > 10 && stochRSI < 30)) strength += 2
    else if ((stochRSI > 60 && stochRSI < 80) || (stochRSI > 20 && stochRSI < 40)) strength += 1

    // VWAP validity (0-1)
    if (vwap > 0) strength += 1

    return Math.min(strength, 10)
  }

  private static assessRiskLevel(
    adx: number,
    atr: number,
    rsi: number,
    volatility: "HIGH" | "MEDIUM" | "LOW",
  ): "HIGH" | "MEDIUM" | "LOW" {
    let riskScore = 0

    if (volatility === "HIGH") riskScore += 2
    else if (volatility === "MEDIUM") riskScore += 1

    if (adx < 15) riskScore += 2 // Low ADX = choppy = risky
    else if (adx < 20) riskScore += 1

    if ((rsi > 80 || rsi < 20) && atr > 0) riskScore += 1 // Extreme RSI

    if (riskScore >= 4) return "HIGH"
    if (riskScore >= 2) return "MEDIUM"
    return "LOW"
  }

  private static generateWarnings(
    adx: number,
    atr: number,
    rsi: number,
    stochRSI: number,
    volatility: "HIGH" | "MEDIUM" | "LOW",
    regime: string,
    signals: any,
  ): string[] {
    const warnings: string[] = []

    if (adx < 15) warnings.push("⚠️ LOW ADX: Market is choppy - avoid entries")
    if (volatility === "LOW") warnings.push("⚠️ LOW VOLATILITY: ATR too low for reliable trades")
    if (rsi > 85) warnings.push("⚠️ EXTREME OVERBOUGHT: Risk of reversal")
    if (rsi < 15) warnings.push("⚠️ EXTREME OVERSOLD: Risk of reversal")
    if (stochRSI > 90) warnings.push("⚠️ StochRSI EXTREME: Momentum overextended")
    if (stochRSI < 10) warnings.push("⚠️ StochRSI EXTREME: Momentum overextended")
    if (!signals.trendConfirmed) warnings.push("⚠️ TREND NOT CONFIRMED: Wait for ADX >= 20")
    if (!signals.volatilityAdequate) warnings.push("⚠️ INADEQUATE VOLATILITY: Position risk too high")
    if (!signals.momentumAligned) warnings.push("⚠️ MOMENTUM MISALIGNED: Entry confirmation weak")

    return warnings
  }

  private static generateRecommendations(
    regime: string,
    bias: string,
    volatility: string,
    momentum: string,
    strength: number,
    signals: any,
    warnings: string[],
  ): string[] {
    const recommendations: string[] = []

    if (strength >= 7) {
      recommendations.push("✅ Strong market - good opportunity for entries")
    } else if (strength >= 5) {
      recommendations.push("ℹ️ Moderate strength - proceed with caution")
    } else {
      recommendations.push("🛑 Low strength - wait for better setup")
    }

    if (regime === "HIGH_TREND") {
      recommendations.push("📈 Strong trend detected - follow momentum")
    } else if (regime === "TREND") {
      recommendations.push("📊 Developing trend - confirm with LTF signals")
    } else if (regime === "WEAK") {
      recommendations.push("🔄 Weak trend - use support/resistance levels")
    } else {
      recommendations.push("⚡ Choppy market - avoid large positions")
    }

    if (bias === "BULLISH") {
      recommendations.push("🟢 Bias is BULLISH - favor LONG entries")
    } else if (bias === "BEARISH") {
      recommendations.push("🔴 Bias is BEARISH - favor SHORT entries")
    } else {
      recommendations.push("⚪ Bias is RANGING - look for breakout signals")
    }

    if (momentum.includes("STRONG")) {
      recommendations.push("🚀 Strong momentum - align with trend direction")
    } else if (momentum.includes("NEUTRAL")) {
      recommendations.push("⏸️ Neutral momentum - wait for confirmation")
    }

    if (warnings.length > 0) {
      recommendations.push("🔍 Address warnings before entering new trades")
    }

    return recommendations
  }
}
