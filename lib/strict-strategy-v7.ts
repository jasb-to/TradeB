export class StrictStrategyV7 {
  evaluate(dailyCandles: any[], h4Candles: any[], h1Candles: any[], m15Candles: any[], config: any) {
    if (!dailyCandles.length || !h4Candles.length || !h1Candles.length) {
      return {
        type: "NO_TRADE",
        direction: "NONE",
        tier: "NO_TRADE",
        score: 0,
        reason: "Insufficient candles",
        indicators: this.getEmptyIndicators(),
      }
    }

    const dailyCandle = dailyCandles[dailyCandles.length - 1]
    const h4Candle = h4Candles[h4Candles.length - 1]
    const h1Candle = h1Candles[h1Candles.length - 1]
    const m15Candle = m15Candles[m15Candles.length - 1]

    // ONLY HARD GATE: 4H Trend Direction Must Exist
    const ema20_4h = this.calculateEMA(h4Candles, 20)
    const ema50_4h = this.calculateEMA(h4Candles, 50)
    const emaGap = Math.abs(ema20_4h - ema50_4h)

    if (emaGap < 0.01) {
      return {
        type: "NO_TRADE",
        direction: "NONE",
        tier: "NO_TRADE",
        score: 0,
        reason: `No 4H trend: EMA20=${ema20_4h.toFixed(2)} EMA50=${ema50_4h.toFixed(2)} Gap=${emaGap.toFixed(5)}`,
        indicators: {
          ema20: ema20_4h,
          ema50: ema50_4h,
          adx: this.calculateADX(h4Candles),
          atr: this.calculateATR(h4Candles),
          rsi: this.calculateRSI(h4Candles),
          stochRSI: undefined,
          vwap: this.calculateVWAP(h1Candles),
        },
      }
    }

    const direction4h = ema20_4h > ema50_4h ? "UP" : "DOWN"

    // SCORING SYSTEM (0-6 points) - Everything is now scoring, not hard gates
    let score = 0
    const scoreReasons = []

    // 1. Daily Trend Alignment (0-1)
    const ema20_daily = this.calculateEMA(dailyCandles, 20)
    const ema50_daily = this.calculateEMA(dailyCandles, 50)
    if ((direction4h === "UP" && ema20_daily > ema50_daily) || (direction4h === "DOWN" && ema20_daily < ema50_daily)) {
      score++
      scoreReasons.push("Daily aligned")
    }

    // 2. ADX Strength - Calculate instead of reading from candle
    const adx4h = this.calculateADX(h4Candles)
    if (adx4h >= 12) { // Lowered from 15
      score++
      scoreReasons.push(`ADX ${adx4h.toFixed(1)}`)
    }

    // 3. RSI Momentum (0-1)
    const rsi4h = this.calculateRSI(h4Candles, 14)
    if ((direction4h === "UP" && rsi4h > 45) || (direction4h === "DOWN" && rsi4h < 55)) { // Relaxed from 50
      score++
      scoreReasons.push(`RSI ${rsi4h.toFixed(0)}`)
    }

    // 4. VWAP Alignment (0-1)
    const vwap = this.calculateVWAP(h1Candles)
    if ((direction4h === "UP" && h1Candle.close > vwap) || (direction4h === "DOWN" && h1Candle.close < vwap)) {
      score++
      scoreReasons.push("VWAP aligned")
    }

    // 5. Breakout Detected (0-1)
    if (this.detectBreakout(h1Candles, direction4h)) {
      score++
      scoreReasons.push("Breakout detected")
    }

    // 6. ATR Expanding (0-1)
    const atr4h = this.calculateATR(h4Candles, 14)
    const atrPrev = this.calculateATR(h4Candles.slice(0, -1), 14)
    if (atr4h > atrPrev * 1.02) { // Relaxed from 1.05
      score++
      scoreReasons.push(`ATR ${atr4h.toFixed(1)}`)
    }

    // Entry Threshold: score >= 3
    if (score >= 3) {
      const tier = score === 6 ? "A+" : score === 5 ? "A" : "B"
      console.log(`[v0] STRICT v7.2 ENTRY: ${direction4h} | Score ${score}/6 | ${scoreReasons.join(", ")}`)
      return {
        type: "ENTRY",
        direction: direction4h,
        tier,
        score,
        approved: true,
        reason: `Score ${score}/6: ${scoreReasons.join(", ")}`,
        indicators: {
          ema20: ema20_4h,
          ema50: ema50_4h,
          adx: adx4h,
          atr: atr4h,
          rsi: rsi4h,
          stochRSI: undefined,
          vwap: vwap,
        },
      }
    }

    // Below Threshold: Score < 3
    return {
      type: "NO_TRADE",
      direction: "NONE",
      tier: "NO_TRADE",
      score,
      reason: `Score ${score}/6 < 3: ${scoreReasons.length ? scoreReasons.join(", ") : "insufficient signals"}`,
      indicators: {
        ema20: ema20_4h,
        ema50: ema50_4h,
        adx: adx4h,
        atr: atr4h,
        rsi: rsi4h,
        stochRSI: undefined,
        vwap: vwap,
      },
    }
    }

    // NO_TRADE: Below threshold
    return {
      type: "NO_TRADE",
      direction: "NONE",
      tier: "NO_TRADE",
      score,
      reason: `Score ${score}/6 < threshold 3: ${scoreReasons.length ? scoreReasons.join(", ") : "No conditions met"}`,
      indicators: {
        ema20: ema20_4h,
        ema50: ema50_4h,
        adx: adx4h,
        atr: h4Candle.atr || 0,
        rsi: rsi4h,
        stochRSI: h4Candle.stochRSI,
        vwap,
      },
    }
  }

  private calculateEMA(candles: any[], period: number): number {
    if (candles.length < period) return candles[candles.length - 1].close
    const k = 2 / (period + 1)
    let ema = candles.slice(0, period).reduce((sum, c) => sum + c.close, 0) / period
    for (let i = period; i < candles.length; i++) {
      ema = candles[i].close * k + ema * (1 - k)
    }
    return ema
  }

  private detectBreakout(candles: any[], direction: string): boolean {
    if (candles.length < 10) return false
    const latest = candles[candles.length - 1]
    const prev10High = Math.max(...candles.slice(-10).map(c => c.high))
    const prev10Low = Math.min(...candles.slice(-10).map(c => c.low))

    if (direction === "UP") {
      return latest.close > prev10High * 0.95
    } else {
      return latest.close < prev10Low * 1.05
    }
  }

  private calculateVWAP(candles: any[]): number {
    if (!candles.length) return 0
    let cumVolPrice = 0
    let cumVol = 0
    for (const c of candles.slice(-20)) {
      const tp = (c.high + c.low + c.close) / 3
      const vol = c.volume || 1
      cumVolPrice += tp * vol
      cumVol += vol
    }
    return cumVolPrice / (cumVol || 1)
  }

  private getEmptyIndicators() {
    return { ema20: 0, ema50: 0, adx: 0, atr: 0, rsi: 50, stochRSI: undefined, vwap: 0 }
  }

  private calculateRSI(candles: any[], period: number = 14): number {
    if (candles.length < period + 1) return 50
    let gains = 0
    let losses = 0
    for (let i = candles.length - period; i < candles.length; i++) {
      const change = candles[i].close - candles[i - 1].close
      if (change > 0) gains += change
      else losses -= change
    }
    const avgGain = gains / period
    const avgLoss = losses / period
    const rs = avgGain / (avgLoss || 0.01)
    return 100 - (100 / (1 + rs))
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
    if (candles.length < period * 2) return 20 // Return neutral value if insufficient data
    let plusDM = 0
    let minusDM = 0
    let tr = 0
    
    // Simplified ADX: count trend bars
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
}
