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
          adx: h4Candle.adx || 0,
          atr: h4Candle.atr || 0,
          rsi: h4Candle.rsi || 50,
          stochRSI: h4Candle.stochRSI,
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

    // 2. ADX Strength (0-1)
    const adx4h = h4Candle.adx || 0
    if (adx4h >= 15) {
      score++
      scoreReasons.push("ADX strong")
    }

    // 3. RSI Momentum (0-1)
    const rsi4h = h4Candle.rsi || 50
    if ((direction4h === "UP" && rsi4h > 50) || (direction4h === "DOWN" && rsi4h < 50)) {
      score++
      scoreReasons.push("RSI aligned")
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
    const atr4h = h4Candle.atr || 0
    const atrPrev = h4Candles[Math.max(0, h4Candles.length - 5)].atr || 0
    if (atr4h > atrPrev * 1.05) {
      score++
      scoreReasons.push("ATR expanding")
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
          stochRSI: h4Candle.stochRSI,
          vwap,
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
}
