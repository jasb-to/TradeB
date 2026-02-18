export class StrictStrategyV7 {
  evaluate(dailyCandles: any[], h4Candles: any[], h1Candles: any[], m15Candles: any[], config: any) {
    if (!dailyCandles.length || !h4Candles.length || !h1Candles.length) {
      return {
        type: "NO_TRADE",
        direction: "NONE",
        tier: "NO_TRADE",
        score: 0,
        component_scores: { trend: 0, pullback: 0, breakout: 0, momentum: 0, volatility: 0, distance: 0 },
        reason: "Insufficient candles",
        indicators: this.getEmptyIndicators(),
      }
    }

    const h4Candle = h4Candles[h4Candles.length - 1]
    const h1Candle = h1Candles[h1Candles.length - 1]

    // Calculate base indicators
    const ema20_4h = this.calculateEMA(h4Candles, 20)
    const ema50_4h = this.calculateEMA(h4Candles, 50)
    const ema20_daily = this.calculateEMA(dailyCandles, 20)
    const ema50_daily = this.calculateEMA(dailyCandles, 50)
    const adx4h = this.calculateADX(h4Candles)
    const rsi4h = this.calculateRSI(h4Candles)
    const atr4h = this.calculateATR(h4Candles)
    const vwap = this.calculateVWAP(h1Candles)

    // HARD GATE 1: 4H Trend Must Exist (EMA20 ≠ EMA50 with 0.01 pip tolerance, ADX ≥ 10)
    const emaGap = Math.abs(ema20_4h - ema50_4h)
    if (emaGap < 0.01 || adx4h < 10) {
      return {
        type: "NO_TRADE",
        direction: "NONE",
        tier: "NO_TRADE",
        score: 0,
        component_scores: { trend: 0, pullback: 0, breakout: 0, momentum: 0, volatility: 0, distance: 0 },
        reason: `Hard gate failed: EMA gap=${emaGap.toFixed(5)}, ADX=${adx4h.toFixed(1)}`,
        indicators: { ema20: ema20_4h, ema50: ema50_4h, adx: adx4h, atr: atr4h, rsi: rsi4h, vwap },
      }
    }

    const direction = ema20_4h > ema50_4h ? "UP" : "DOWN"

    // HARD GATE 2: 1H Breakout or Pullback Must Exist
    const breakout1h = this.detectBreakout(h1Candles, direction)
    const pullback1h = this.detectPullback(h1Candles, direction)
    if (!breakout1h && !pullback1h) {
      return {
        type: "NO_TRADE",
        direction: "NONE",
        tier: "NO_TRADE",
        score: 0,
        component_scores: { trend: 0, pullback: 0, breakout: 0, momentum: 0, volatility: 0, distance: 0 },
        reason: "No 1H breakout or pullback",
        indicators: { ema20: ema20_4h, ema50: ema50_4h, adx: adx4h, atr: atr4h, rsi: rsi4h, vwap },
      }
    }

    // SCORING: 6 independent components (0-1 each)
    const component_scores = {
      trend: this.scoreTrendDirection(ema20_daily, ema50_daily, direction),
      pullback: pullback1h ? 1 : 0,
      breakout: breakout1h ? 1 : 0,
      momentum: this.scoreMomentum(rsi4h, direction),
      volatility: this.scoreVolatility(atr4h, h4Candles),
      distance: this.scoreDistance(h4Candle.close, h4Candles),
    }

    const score = Object.values(component_scores).reduce((sum, val) => sum + val, 0)

    // ENTRY THRESHOLD: score >= 4/6 (selective: ~1 trade per week, 8-20 per 6 months)
    if (score >= 4) {
      const tier = score === 6 ? "A+" : score === 5 ? "A" : "B"
      return {
        type: "ENTRY",
        direction,
        tier,
        score,
        component_scores,
        approved: true,
        reason: `Score ${score}/6 (components: ${Object.entries(component_scores).map(([k, v]) => `${k}=${v}`).join(", ")})`,
        indicators: { ema20: ema20_4h, ema50: ema50_4h, adx: adx4h, atr: atr4h, rsi: rsi4h, vwap },
      }
    }

    // NO_TRADE: Below threshold
    return {
      type: "NO_TRADE",
      direction: "NONE",
      tier: "NO_TRADE",
      score,
      component_scores,
      reason: `Score ${score}/6 < 4 (components: ${Object.entries(component_scores).map(([k, v]) => `${k}=${v}`).join(", ")})`,
      indicators: { ema20: ema20_4h, ema50: ema50_4h, adx: adx4h, atr: atr4h, rsi: rsi4h, vwap },
    }
  }

  private scoreTrendDirection(ema20: number, ema50: number, direction: string): number {
    return (direction === "UP" && ema20 > ema50) || (direction === "DOWN" && ema20 < ema50) ? 1 : 0
  }

  private scoreMomentum(rsi: number, direction: string): number {
    if (direction === "UP") return rsi >= 55 && rsi <= 70 ? 1 : 0
    return rsi >= 30 && rsi <= 45 ? 1 : 0
  }

  private scoreVolatility(atr: number, candles: any[]): number {
    const atrPrev = this.calculateATR(candles.slice(0, -1))
    return atr > atrPrev * 1.05 ? 1 : 0
  }

  private scoreDistance(price: number, candles: any[]): number {
    const high = Math.max(...candles.slice(-20).map(c => c.high))
    const low = Math.min(...candles.slice(-20).map(c => c.low))
    const range = high - low
    const from_high = (high - price) / range
    const from_low = (price - low) / range
    return from_high > 0.3 && from_low > 0.3 ? 1 : 0
  }

  private detectBreakout(candles: any[], direction: string): boolean {
    if (candles.length < 10) return false
    const latest = candles[candles.length - 1]
    const prev10High = Math.max(...candles.slice(-10).map(c => c.high))
    const prev10Low = Math.min(...candles.slice(-10).map(c => c.low))
    if (direction === "UP") return latest.close > prev10High * 0.95
    return latest.close < prev10Low * 1.05
  }

  private detectPullback(candles: any[], direction: string): boolean {
    if (candles.length < 10) return false
    const latest = candles[candles.length - 1]
    const ema20 = this.calculateEMA(candles, 20)
    return Math.abs(latest.close - ema20) < 0.5
  }

  private calculateEMA(candles: any[], period: number): number {
    if (candles.length < period) return candles[candles.length - 1]?.close || 0
    const k = 2 / (period + 1)
    let ema = candles.slice(0, period).reduce((sum, c) => sum + c.close, 0) / period
    for (let i = period; i < candles.length; i++) {
      ema = candles[i].close * k + ema * (1 - k)
    }
    return ema
  }

  private calculateRSI(candles: any[], period: number = 14): number {
    if (candles.length < period + 1) return 50
    let gains = 0,
      losses = 0
    for (let i = candles.length - period; i < candles.length; i++) {
      const change = candles[i].close - candles[i - 1].close
      if (change > 0) gains += change
      else losses -= change
    }
    const avgGain = gains / period
    const avgLoss = losses / period
    const rs = avgGain / (avgLoss || 0.01)
    return 100 - 100 / (1 + rs)
  }

  private calculateATR(candles: any[], period: number = 14): number {
    if (candles.length < period) return 0
    let sumTR = 0
    for (let i = Math.max(1, candles.length - period); i < candles.length; i++) {
      const high = candles[i].high
      const low = candles[i].low
      const prevClose = candles[i - 1].close
      const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose))
      sumTR += tr
    }
    return sumTR / period
  }

  private calculateADX(candles: any[], period: number = 14): number {
    if (candles.length < period * 2) return 20
    let plusDM = 0,
      minusDM = 0,
      tr = 0
    for (let i = Math.max(1, candles.length - period); i < candles.length; i++) {
      const high = candles[i].high - candles[i - 1].high
      const low = candles[i - 1].low - candles[i].low
      if (high > 0 && high > low) plusDM += high
      if (low > 0 && low > high) minusDM += low
      const trValue = Math.max(
        candles[i].high - candles[i].low,
        Math.abs(candles[i].high - candles[i - 1].close),
        Math.abs(candles[i].low - candles[i - 1].close)
      )
      tr += trValue
    }
    const di = Math.abs(plusDM - minusDM) / (tr || 1)
    return Math.min(100, di * 100)
  }

  private calculateVWAP(candles: any[]): number {
    if (!candles.length) return 0
    let pv = 0,
      v = 0
    for (const c of candles) {
      const typicalPrice = (c.high + c.low + c.close) / 3
      pv += typicalPrice * (c.volume || 1)
      v += c.volume || 1
    }
    return v > 0 ? pv / v : candles[candles.length - 1].close
  }

  private getEmptyIndicators() {
    return { ema20: 0, ema50: 0, adx: 0, atr: 0, rsi: 50, vwap: 0 }
  }
}
