import type { Candle, Signal } from "@/lib/types"
import { SYMBOL_CONFIG } from "@/lib/symbol-config"

export class StrictStrategyV7 {
  evaluate(
    dailyCandles: Candle[],
    data8hCandles: Candle[],
    data4hCandles: Candle[],
    data1hCandles: Candle[],
    data15mCandles: Candle[],
    data5mCandles: Candle[],
    config: any,
    symbol: string = "XAU_USD"
  ): Signal {
    // Input validation
    if (!dailyCandles?.length || !data4hCandles?.length || !data1hCandles?.length) {
      return { type: "NO_TRADE", direction: "NONE", tier: "NO_TRADE", score: 0, indicators: this.getEmptyIndicators() }
    }

    // Get symbol-aware configuration
    const symbolConfig = SYMBOL_CONFIG[symbol as keyof typeof SYMBOL_CONFIG]
    const adxMinimum = symbolConfig?.adxMinimum || 10
    const emaGapMinimum = symbolConfig?.emaGapMinimum || 1.0

    const dailyClose = dailyCandles[dailyCandles.length - 1]?.close || 0
    const h4Close = data4hCandles[data4hCandles.length - 1]?.close || 0
    const h1Close = data1hCandles[data1hCandles.length - 1]?.close || 0
    const h15Close = data15mCandles?.length ? data15mCandles[data15mCandles.length - 1]?.close || 0 : 0

    // Validate we have actual price data
    if (!dailyClose || !h4Close || !h1Close) {
      return { type: "NO_TRADE", direction: "NONE", tier: "NO_TRADE", score: 0, reason: "Missing candle close prices", indicators: this.getEmptyIndicators() }
    }

    // HARD GATE 1: 4H Trend Exists - Instrument-Aware Thresholds
    // Use symbol-specific ADX and EMA Gap minimums for indices vs commodities
    const ema20_4h = this.calculateEMA(data4hCandles, 20)
    const ema50_4h = this.calculateEMA(data4hCandles, 50)
    const emaGap = Math.abs(ema20_4h - ema50_4h)
    const adx4h = this.calculateADX(data4hCandles)
    
    const gapOK = emaGap >= emaGapMinimum
    const adxOK = adx4h >= adxMinimum
    
    console.log(`[v0] HARD_GATE_1: emaGap=${emaGap.toFixed(4)} pips (need ${emaGapMinimum}) adx=${adx4h.toFixed(1)} (need ${adxMinimum}) | Result: gap=${gapOK ? "PASS" : "FAIL"} adx=${adxOK ? "PASS" : "FAIL"} [${symbol}]`)

    if (!gapOK || !adxOK) {
      console.log(`[v0] HARD_GATE_1 FAILED [${symbol}]: ${!gapOK ? `EMA gap only ${emaGap.toFixed(4)} pips (need ${emaGapMinimum})` : ""} ${!adxOK ? `ADX only ${adx4h.toFixed(1)} (need ${adxMinimum})` : ""}`)
      return {
        type: "NO_TRADE",
        direction: "NONE",
        tier: "NO_TRADE",
        score: 0,
        reason: `Hard Gate 1 FAILED: ${!gapOK ? "EMA gap too small" : ""} ${!adxOK ? "ADX too weak" : ""}`,
        indicators: this.buildIndicators(ema20_4h, ema50_4h, adx4h, data4hCandles, data1hCandles),
      }
    }

    const direction = ema20_4h > ema50_4h ? "UP" : "DOWN"

    // HARD GATE 2: 1H Breakout with Close Confirmation (relaxed to 70% level)
    const h1Recent10 = data1hCandles.slice(-10)
    const h1High = Math.max(...h1Recent10.map(c => c.high))
    const h1Low = Math.min(...h1Recent10.map(c => c.low))
    const h1Range = h1High - h1Low || 1

    // STRICT: Close must break 70% level (was 80%, too restrictive)
    const isBreakoutUp = direction === "UP" && h1Close > h1High * 0.7
    const isBreakoutDn = direction === "DOWN" && h1Close < h1Low * 1.3
    const hasBreakout = isBreakoutUp || isBreakoutDn
    
    console.log(`[v0] HARD_GATE_2: dir=${direction} h1Close=${h1Close.toFixed(2)} h1High=${h1High.toFixed(2)} h1Low=${h1Low.toFixed(2)} breakout=${hasBreakout}`)

    if (!hasBreakout) {
      console.log(`[v0] HARD_GATE_2 FAILED: No ${direction} breakout at 70% level`)
      return {
        type: "NO_TRADE",
        direction: "NONE",
        tier: "NO_TRADE",
        score: 0,
        reason: `Hard Gate 2 FAILED: No ${direction} breakout confirmation`,
        indicators: this.buildIndicators(ema20_4h, ema50_4h, adx4h, data4hCandles, data1hCandles),
      }
    }
    
    console.log(`[v0] BOTH HARD GATES PASSED - Starting selective scoring`)

    // HARD GATE 3: 4H Bias must align with signal direction (mandatory)
    const ema20_daily = this.calculateEMA(dailyCandles, 20)
    const ema50_daily = this.calculateEMA(dailyCandles, 50)
    const dailyBiasUp = ema20_daily > ema50_daily
    const dailyAligned = (direction === "UP" && dailyBiasUp) || (direction === "DOWN" && !dailyBiasUp)
    
    if (!dailyAligned) {
      console.log(`[v0] HARD_GATE_3 FAILED: Daily bias (${dailyBiasUp ? "UP" : "DOWN"}) opposes signal direction (${direction})`)
      return {
        type: "NO_TRADE",
        direction: "NONE",
        tier: "NO_TRADE",
        score: 0,
        reason: "HTF misalignment: Daily bias opposes direction",
        indicators: this.buildIndicators(ema20_4h, ema50_4h, adx4h, data4hCandles, data1hCandles),
      }
    }

    // HARD GATE 4: 1H alignment - must have clear directional bias
    const ema20_1h = this.calculateEMA(data1hCandles, 20)
    const ema50_1h = this.calculateEMA(data1hCandles, 50)
    const h1Aligned = (direction === "UP" && ema20_1h > ema50_1h) || (direction === "DOWN" && ema20_1h < ema50_1h)
    
    if (!h1Aligned) {
      console.log(`[v0] HARD_GATE_4 FAILED: 1H alignment failed`)
      return {
        type: "NO_TRADE",
        direction: "NONE",
        tier: "NO_TRADE",
        score: 0,
        reason: "1H alignment failed",
        indicators: this.buildIndicators(ema20_4h, ema50_4h, adx4h, data4hCandles, data1hCandles),
      }
    }

    // HARD GATE 5: ADX must meet symbol-config minimum + 2 buffer
    const adxBuffer = adxMinimum + 2
    const adxBufferOK = adx4h >= adxBuffer
    
    if (!adxBufferOK) {
      console.log(`[v0] HARD_GATE_5 FAILED: ADX ${adx4h.toFixed(1)} below buffer threshold ${adxBuffer}`)
      return {
        type: "NO_TRADE",
        direction: "NONE",
        tier: "NO_TRADE",
        score: 0,
        reason: `Low ADX: ${adx4h.toFixed(1)} < ${adxBuffer}`,
        indicators: this.buildIndicators(ema20_4h, ema50_4h, adx4h, data4hCandles, data1hCandles),
      }
    }

    // HARD GATE 6: ATR volatility must be true
    const atr = this.calculateATR(data4hCandles, 14)
    const atr20 = this.calculateATR(data4hCandles.slice(-20), 14)
    const atrVolatility = atr > atr20 * 1.1
    
    if (!atrVolatility) {
      console.log(`[v0] HARD_GATE_6 FAILED: ATR volatility too low`)
      return {
        type: "NO_TRADE",
        direction: "NONE",
        tier: "NO_TRADE",
        score: 0,
        reason: "Low volatility: ATR not expanding",
        indicators: this.buildIndicators(ema20_4h, ema50_4h, adx4h, data4hCandles, data1hCandles),
      }
    }

    // HARD GATE 7: Entry Timing Requirement - at least one of 15M alignment OR StochRSI momentum
    const h15Momentum = (direction === "UP" && h15Close > h1Close) || (direction === "DOWN" && h15Close < h1Close)
    const stochRSI = this.calculateStochRSI(data5mCandles)
    const stochRSIConfirms = (direction === "UP" && stochRSI.k > 50) || (direction === "DOWN" && stochRSI.k < 50)
    
    if (!h15Momentum && !stochRSIConfirms) {
      console.log(`[v0] HARD_GATE_7 FAILED: No entry confirmation (15M: ${h15Momentum}, StochRSI: ${stochRSIConfirms})`)
      return {
        type: "NO_TRADE",
        direction: "NONE",
        tier: "NO_TRADE",
        score: 0,
        reason: "No entry confirmation: 15M and StochRSI both false",
        indicators: this.buildIndicators(ema20_4h, ema50_4h, adx4h, data4hCandles, data1hCandles),
      }
    }

    console.log(`[v0] ALL HARD GATES PASSED - Starting selective scoring`)

    // Both hard gates passed - now selective scoring (need 4+ of 6)
    let score = 0
    const componentDetails: Record<string, boolean> = {}

    // Component 1: Daily EMA Alignment (0-1) 
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
    if (atrVolatility) {
      score++
      componentDetails["ATR Expanding"] = true
    }

    // Component 4: 15M Momentum Confirms Direction
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

    // APPLY CONFLICT PENALTY: If daily bias opposes direction, subtract 1.0 from score
    let finalScore = score
    let conflictPenalty = false
    if (!dailyAligned) {
      finalScore = Math.max(0, score - 1.0)
      conflictPenalty = true
      console.log(`[v0] Conflict penalty applied: Daily bias opposes direction. Score ${score} -> ${finalScore}`)
    }

    // STRICT TIER ENFORCEMENT: Score must meet minimum AND structural conditions must be satisfied
    let entryTier: "A+" | "A" | "B" | null = null
    let canEnter = false

    // A+: score ≥ 7 AND 5+ TF aligned AND ADX ≥ 23
    if (finalScore >= 7 && Object.values(componentDetails).filter(Boolean).length >= 5 && adx4h >= 23) {
      entryTier = "A+"
      canEnter = true
    }
    // A: score ≥ 6 AND 4+ TF aligned AND ADX ≥ 21
    else if (finalScore >= 6 && Object.values(componentDetails).filter(Boolean).length >= 4 && adx4h >= 21) {
      entryTier = "A"
      canEnter = true
    }
    // B: score ≥ 6 AND 4H+1H aligned AND ADX ≥ 17
    else if (finalScore >= 6 && h1Aligned && adx4h >= 17) {
      entryTier = "B"
      canEnter = true
    }

    if (!canEnter) {
      console.log(`[v0] REJECTED: Score ${finalScore} does not meet tier requirements. Components: ${Object.entries(componentDetails).map(([k, v]) => v ? k : null).filter(Boolean).join(", ")}`)
      return {
        type: "NO_TRADE",
        direction: "NONE",
        tier: "NO_TRADE",
        score: finalScore,
        reason: `Score below threshold: ${finalScore}/6 does not meet tier requirements`,
        indicators: this.buildIndicators(ema20_4h, ema50_4h, adx4h, data4hCandles, data1hCandles),
      }
    }

    console.log(`[v0] STRICT v7.4 ENTRY: ${direction} | Score ${finalScore}/6 | Tier ${entryTier} | Components: ${Object.entries(componentDetails).map(([k, v]) => v ? k : null).filter(Boolean).join(", ")}`)
    return {
      type: "ENTRY",
      direction,
      tier: entryTier,
      score: finalScore,
      approved: true,
      reason: `Tier ${entryTier}: Score ${finalScore}/6 with ${Object.values(componentDetails).filter(Boolean).length}+ components aligned`,
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
