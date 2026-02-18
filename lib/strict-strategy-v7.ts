import type { Candle, Signal } from "@/lib/types"

export class StrictStrategyV7 {
  evaluate(
    dailyCandles: Candle[],
    data8hCandles: Candle[],
    data4hCandles: Candle[],
    data1hCandles: Candle[],
    data15mCandles: Candle[],
    data5mCandles: Candle[],
    config: any
  ): Signal {
    // Input validation
    if (!dailyCandles?.length || !data4hCandles?.length || !data1hCandles?.length) {
      return { type: "NO_TRADE", direction: "NONE", tier: "NO_TRADE", score: 0, indicators: this.getEmptyIndicators() }
    }

    const dailyClose = dailyCandles[dailyCandles.length - 1].close
    const h4Close = data4hCandles[data4hCandles.length - 1].close
    const h1Close = data1hCandles[data1hCandles.length - 1].close
    const h15Close = data15mCandles[data15mCandles.length - 1].close

    // HARD GATE 1: 4H Trend Exists (EMA separation ≥ 0.1% + ADX ≥ 25)
    const ema20_4h = this.calculateEMA(data4hCandles, 20)
    const ema50_4h = this.calculateEMA(data4hCandles, 50)
    const emaGap = Math.abs(ema20_4h - ema50_4h)
    const adx4h = this.calculateADX(data4hCandles)

    // STRICT: 0.1% EMA separation required, ADX must be 25+ (strong trend only)
    if (emaGap < ema50_4h * 0.001 || adx4h < 25) {
      return {
        type: "NO_TRADE",
        direction: "NONE",
        tier: "NO_TRADE",
        score: 0,
        reason: `Hard Gate 1 FAILED: EMA gap ${(emaGap/ema50_4h*100).toFixed(3)}% (need 0.1%), ADX ${adx4h.toFixed(1)} (need 25)`,
        indicators: this.buildIndicators(ema20_4h, ema50_4h, adx4h, data4hCandles, data1hCandles),
      }
    }

    const direction = ema20_4h > ema50_4h ? "UP" : "DOWN"

    // HARD GATE 2: 1H Breakout with Close Confirmation (not just High/Low)
    const h1Recent10 = data1hCandles.slice(-10)
    const h1High = Math.max(...h1Recent10.map(c => c.high))
    const h1Low = Math.min(...h1Recent10.map(c => c.low))
    const h1Range = h1High - h1Low || 1

    // STRICT: Close must break 80% level, not just touch
    const isBreakoutUp = direction === "UP" && h1Close > h1High * 0.8
    const isBreakoutDn = direction === "DOWN" && h1Close < h1Low * 1.2
    const hasBreakout = isBreakoutUp || isBreakoutDn

    if (!hasBreakout) {
      return {
        type: "NO_TRADE",
        direction: "NONE",
        tier: "NO_TRADE",
        score: 0,
        reason: `Hard Gate 2 FAILED: No ${direction} breakout confirmation`,
        indicators: this.buildIndicators(ema20_4h, ema50_4h, adx4h, data4hCandles, data1hCandles),
      }
    }

    // Both hard gates passed - now selective scoring (need 4+ of 6)
    let score = 0
    const componentDetails: Record<string, boolean> = {}

    // Component 1: Daily EMA Alignment (0-1)
    const ema20_daily = this.calculateEMA(dailyCandles, 20)
    const ema50_daily = this.calculateEMA(dailyCandles, 50)
    const dailyAligned = (direction === "UP" && ema20_daily > ema50_daily) || (direction === "DOWN" && ema20_daily < ema50_daily)
    if (dailyAligned) {
      score++
      componentDetails["Daily EMA"] = true
    }

    // Component 2: RSI NOT Overbought/Oversold (STRICT range 40-60)
    const rsi4h = this.calculateRSI(data4hCandles, 14)
    const rsiStrict = (direction === "UP" && rsi4h > 40 && rsi4h < 60) || (direction === "DOWN" && rsi4h > 40 && rsi4h < 60)
    if (rsiStrict) {
      score++
      componentDetails["RSI Neutral"] = true
    }

    // Component 3: ATR Expanding (must be >10% above 20-period average)
    const atr = this.calculateATR(data4hCandles, 14)
    const atr20 = this.calculateATR(data4hCandles.slice(-20), 14)
    const atrExpanding = atr > atr20 * 1.1
    if (atrExpanding) {
      score++
      componentDetails["ATR Expanding"] = true
    }

    // Component 4: 15M Momentum Confirms Direction
    const h15Momentum = (direction === "UP" && h15Close > h1Close) || (direction === "DOWN" && h15Close < h1Close)
    if (h15Momentum) {
      score++
      componentDetails["15M Confirms"] = true
    }

    // Component 5: Price NOT overextended (must be within 40% of recent range)
    const dailyRange = Math.max(...dailyCandles.slice(-20).map(c => c.high)) - Math.min(...dailyCandles.slice(-20).map(c => c.low))
    const distFromHigh = Math.max(...dailyCandles.slice(-20).map(c => c.high)) - dailyClose
    const distFromLow = dailyClose - Math.min(...dailyCandles.slice(-20).map(c => c.low))
    const notOverextended = (distFromHigh > dailyRange * 0.4) && (distFromLow > dailyRange * 0.4)
    if (notOverextended) {
      score++
      componentDetails["Distance OK"] = true
    }

    // Component 6: Volume Confirmation (if available)
    const vol1h = data1hCandles[data1hCandles.length - 1].volume || 1
    const volAvg20 = (data1hCandles.slice(-20).reduce((sum, c) => sum + (c.volume || 1), 0) / 20) || 1
    const volumeUp = vol1h > volAvg20 * 1.1
    if (volumeUp) {
      score++
      componentDetails["Volume Up"] = true
    }

    // Entry requires 4+ of 6 components (strict selectivity)
    if (score >= 4) {
      const tier = score === 6 ? "A+" : score === 5 ? "A" : "B"
      console.log(`[v0] STRICT v7.3 ENTRY: ${direction} | Score ${score}/6 | Components: ${Object.entries(componentDetails).map(([k, v]) => v ? k : null).filter(Boolean).join(", ")}`)
      return {
        type: "ENTRY",
        direction,
        tier,
        score,
        approved: true,
        reason: `Score ${score}/6: ${Object.entries(componentDetails).map(([k, v]) => v ? k : null).filter(Boolean).join(", ")}`,
        indicators: this.buildIndicators(ema20_4h, ema50_4h, adx4h, data4hCandles, data1hCandles),
      }
    }

    // Below threshold
    return {
      type: "NO_TRADE",
      direction: "NONE",
      tier: "NO_TRADE",
      score,
      reason: `Score ${score}/6 < 4: ${Object.entries(componentDetails).map(([k, v]) => v ? k : null).filter(Boolean).join(", ")}`,
      indicators: this.buildIndicators(ema20_4h, ema50_4h, adx4h, data4hCandles, data1hCandles),
    }
  }

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

  private calculateEMA(candles: Candle[], period: number): number {
    if (candles.length < period) return candles[candles.length - 1].close
    const multiplier = 2 / (period + 1)
    let ema = candles[0].close
    for (let i = 1; i < candles.length; i++) {
      ema = candles[i].close * multiplier + ema * (1 - multiplier)
    }
    return ema
  }

  private calculateRSI(candles: Candle[], period: number): number {
    if (candles.length < period + 1) return 50
    let gains = 0,
      losses = 0
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

  private calculateADX(candles: Candle[], period: number = 14): number {
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

  private calculateVWAP(candles: Candle[]): number {
    if (!candles.length) return 0
    let pv = 0,
      v = 0
    for (const c of candles) {
      const tp = (c.high + c.low + c.close) / 3
      pv += tp * (c.volume || 1)
      v += c.volume || 1
    }
    return v > 0 ? pv / v : candles[candles.length - 1].close
  }

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

  private getEmptyIndicators() {
    return { ema20: 0, ema50: 0, adx: 0, atr: 0, rsi: 50, stochRSI: { k: 50, d: 50 }, vwap: 0 }
  }
}
