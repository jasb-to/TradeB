import { Candle, Signal, StrategyConfig } from "@/lib/types"
import { SYMBOL_CONFIG } from "@/lib/symbol-config"

/**
 * BALANCED Strategy v7 - Score-Based Entry System
 * 
 * Hard gates: 4H trend + 1H breakout only
 * Entry: 4H trend + 1H breakout + score ≥ 3/6
 * 
 * Same scoring as STRICT v7 but lower threshold (3/6 vs 4/6)
 * Allows more frequent entries with slightly lower confidence
 * Uses instrument-aware ADX thresholds from symbol-config
 */

interface ScoreBreakdown {
  dailyBias: number
  adx4h: number
  adxDaily: number
  vwap: number
  atr: number
  rsiMomentum: number
  total: number
  reasons: string[]
}

export class BalancedStrategyV7 {
  evaluate(
    daily: Candle[],
    candle4h: Candle[],
    candle1h: Candle[],
    candle15m: Candle[],
    config: StrategyConfig,
    symbol: string = "XAU_USD"
  ): Signal {
    if (!daily.length || !candle4h.length || !candle1h.length) {
      return { 
        type: "NO_TRADE", 
        direction: "NONE", 
        tier: "NO_TRADE", 
        score: 0, 
        reason: "Insufficient data",
        indicators: this.getEmptyIndicators() // CRITICAL: Must include indicators for UI display
      }
    }

    // Get symbol-aware configuration
    const symbolConfig = SYMBOL_CONFIG[symbol as keyof typeof SYMBOL_CONFIG]
    const adxMinimum = symbolConfig?.adxMinimum || 10

    const latest1h = candle1h[candle1h.length - 1]
    const latest4h = candle4h[candle4h.length - 1]
    const latestDaily = daily[daily.length - 1]

    // HARD GATE 1: 4H Trend Direction (EMA20 ≠ EMA50, ADX ≥ symbol-specific minimum)
    const ema20_4h = this.calculateEMA(candle4h, 20)
    const ema50_4h = this.calculateEMA(candle4h, 50)
    const adx4h = latest4h.adx || 0

    const has4hTrend = ema20_4h !== ema50_4h && adx4h >= adxMinimum
    const direction4h = ema20_4h > ema50_4h ? "UP" : "DOWN"

    if (!has4hTrend) {
      return {
        type: "NO_TRADE",
        direction: "NONE",
        tier: "NO_TRADE",
        score: 0,
        reason: `4H trend gate failed: EMA aligned=${ema20_4h === ema50_4h}, ADX=${adx4h}`,
        indicators: this.getEmptyIndicators() // CRITICAL: Must include indicators
      }
    }

    // HARD GATE 2: 1H or 15M Breakout
    const breakout1h = this.detectBreakout(candle1h, direction4h)
    const breakout15m = this.detectBreakout(candle15m, direction4h)

    if (!breakout1h && !breakout15m) {
      return {
        type: "NO_TRADE",
        direction: "NONE",
        tier: "NO_TRADE",
        score: 0,
        reason: "1H/15M breakout gate failed: No breakout detected",
        indicators: this.getEmptyIndicators() // CRITICAL: Must include indicators
      }
    }

    // HARD GATES PASSED - Now calculate score
    const score = this.calculateScore(daily, candle4h, candle1h, direction4h)

    // Entry threshold for BALANCED: score ≥ 3/6
    if (score.total < 3) {
      return {
        type: "NO_TRADE",
        direction: "NONE",
        tier: "NO_TRADE",
        score: score.total,
        reason: `Score ${score.total}/6 < threshold 3: ${score.reasons.join(", ")}`,
        indicators: this.buildIndicators(ema20_4h, ema50_4h, adx4h, candle4h, candle1h) // CRITICAL: Include indicators
      }
    }

    // ENTRY APPROVED
    const tier = score.total === 6 ? "A+" : score.total === 5 ? "A" : score.total === 4 ? "B" : "B-"
    
    console.log(`[v0] BALANCED v7 ENTRY: ${direction4h} | Score ${score.total}/6 (${score.reasons.join(", ")}) | Tier ${tier}`)

    return {
      type: "ENTRY",
      direction: direction4h,
      tier,
      score: score.total,
      approved: true,
      reason: `Score ${score.total}/6: ${score.reasons.join(", ")}`,
      indicators: this.buildIndicators(ema20_4h, ema50_4h, adx4h, candle4h, candle1h) // CRITICAL: Include indicators for UI
    }
  }

  private calculateScore(daily: Candle[], candle4h: Candle[], candle1h: Candle[], direction4h: string): ScoreBreakdown {
    const score: ScoreBreakdown = {
      dailyBias: 0,
      adx4h: 0,
      adxDaily: 0,
      vwap: 0,
      atr: 0,
      rsiMomentum: 0,
      total: 0,
      reasons: [],
    }

    const latestDaily = daily[daily.length - 1]
    const latest4h = candle4h[candle4h.length - 1]
    const latest1h = candle1h[candle1h.length - 1]

    // Criterion 1: Daily bias alignment
    const dailyRSI = latestDaily.rsi || 50
    const dailyIsUp = dailyRSI > 50
    const alignsWithDirection = (dailyIsUp && direction4h === "UP") || (!dailyIsUp && direction4h === "DOWN")
    
    if (alignsWithDirection) {
      score.dailyBias = 1
      score.reasons.push("Daily aligned")
    }

    // Criterion 2: ADX ≥ 25 on 4H (relaxed: ADX ≥ 20 for BALANCED)
    const adx4h = latest4h.adx || 0
    if (adx4h >= 20) {
      score.adx4h = 1
      score.reasons.push("ADX4H trend")
    }

    // Criterion 3: ADX ≥ 20 on Daily (relaxed from 25)
    const adxDaily = latestDaily.adx || 0
    if (adxDaily >= 20) {
      score.adxDaily = 1
      score.reasons.push("ADXDaily trend")
    }

    // Criterion 4: VWAP confirmation
    const vwap = this.calculateVWAP(candle1h)
    const priceAboveVWAP = latest1h.close > vwap
    const shouldBeAbove = direction4h === "UP"
    
    if (priceAboveVWAP === shouldBeAbove) {
      score.vwap = 1
      score.reasons.push("VWAP confirmed")
    }

    // Criterion 5: ATR > 1H median
    const atr1h = latest1h.atr || 0
    const medianATR = this.calculateMedianATR(candle1h)
    
    if (atr1h > medianATR) {
      score.atr = 1
      score.reasons.push("ATR elevated")
    }

    // Criterion 6: RSI momentum alignment
    const rsi1h = latest1h.rsi || 50
    const rsiUp = rsi1h > 50
    const alignsMomentum = (rsiUp && direction4h === "UP") || (!rsiUp && direction4h === "DOWN")
    
    if (alignsMomentum) {
      score.rsiMomentum = 1
      score.reasons.push("RSI aligned")
    }

    score.total = score.dailyBias + score.adx4h + score.adxDaily + score.vwap + score.atr + score.rsiMomentum
    return score
  }

  private detectBreakout(candles: Candle[], direction: string): boolean {
    if (candles.length < 20) return false
    
    const latest = candles[candles.length - 1]
    const prev20High = Math.max(...candles.slice(-20).map(c => c.high))
    const prev20Low = Math.min(...candles.slice(-20).map(c => c.low))
    
    if (direction === "UP") {
      return latest.close > prev20High
    } else {
      return latest.close < prev20Low
    }
  }

  private calculateEMA(candles: Candle[], period: number): number {
    if (candles.length < period) return 0
    
    const closes = candles.map(c => c.close)
    const k = 2 / (period + 1)
    let ema = closes.slice(0, period).reduce((a, b) => a + b) / period
    
    for (let i = period; i < closes.length; i++) {
      ema = closes[i] * k + ema * (1 - k)
    }
    
    return ema
  }

  private calculateVWAP(candles: Candle[]): number {
    if (!candles.length) return 0
    
    let numerator = 0
    let denominator = 0
    
    for (const candle of candles.slice(-20)) {
      const typicalPrice = (candle.high + candle.low + candle.close) / 3
      numerator += typicalPrice * (candle.volume || 1)
      denominator += (candle.volume || 1)
    }
    
    return denominator ? numerator / denominator : candles[candles.length - 1].close
  }

  private calculateMedianATR(candles: Candle[]): number {
    const atrs = candles.slice(-20).map(c => c.atr || 0)
    atrs.sort((a, b) => a - b)
    return atrs[Math.floor(atrs.length / 2)]
  }

  // Build indicators object for display - matches StrictStrategyV7 format
  private buildIndicators(ema20: number, ema50: number, adx: number, h4Candles: Candle[], h1Candles: Candle[]) {
    return {
      ema20,
      ema50,
      adx,
      atr: this.calculateATR(h4Candles),
      rsi: this.calculateRSI(h4Candles),
      stochRSI: this.calculateStochRSI(h4Candles),
      vwap: this.calculateVWAP(h1Candles),
    }
  }

  // Empty indicators fallback
  private getEmptyIndicators() {
    return { 
      ema20: 0, 
      ema50: 0, 
      adx: 0, 
      atr: 0, 
      rsi: 50, 
      stochRSI: { k: 50, d: 50 }, 
      vwap: 0 
    }
  }

  // Calculate RSI from candles
  private calculateRSI(candles: Candle[], period: number = 14): number {
    if (candles.length < period + 1) return 50
    let gains = 0, losses = 0
    for (let i = candles.length - period; i < candles.length; i++) {
      const diff = candles[i].close - candles[i - 1].close
      if (diff > 0) gains += diff
      else losses -= diff
    }
    const avgGain = gains / period
    const avgLoss = losses / period
    const rs = avgGain / (avgLoss || 0.01)
    return 100 - 100 / (1 + rs)
  }

  // Calculate ATR from candles
  private calculateATR(candles: Candle[], period: number = 14): number {
    if (candles.length < period) return 0
    let sumTR = 0
    for (let i = Math.max(1, candles.length - period); i < candles.length; i++) {
      const tr = Math.max(
        candles[i].high - candles[i].low,
        Math.abs(candles[i].high - candles[i - 1].close),
        Math.abs(candles[i].low - candles[i - 1].close)
      )
      sumTR += tr
    }
    return sumTR / period
  }

  // Calculate StochRSI from candles
  private calculateStochRSI(candles: Candle[]): { k: number; d: number } {
    if (candles.length < 17) return { k: 50, d: 50 }
    const rsiVals = []
    for (let i = 0; i < candles.length - 13; i++) {
      rsiVals.push(this.calculateRSI(candles.slice(i, i + 14), 14))
    }
    const rsiHi = Math.max(...rsiVals.slice(-3))
    const rsiLo = Math.min(...rsiVals.slice(-3))
    const range = rsiHi - rsiLo || 1
    const k = 100 * ((rsiVals[rsiVals.length - 1] - rsiLo) / range)
    const d = (100 * ((rsiVals[rsiVals.length - 1] - rsiLo) / range) + 100 * ((rsiVals[rsiVals.length - 2] - rsiLo) / range) + 100 * ((rsiVals[rsiVals.length - 3] - rsiLo) / range)) / 3
    return { k: isNaN(k) ? 50 : k, d: isNaN(d) ? 50 : d }
  }
}
