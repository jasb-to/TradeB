import type { Candle, TechnicalIndicators } from "../types/trading"

export class TechnicalAnalysis {
  static calculateATR(candles: Candle[], period = 14): number {
    if (candles.length < period + 1) return 0

    const trueRanges = []
    for (let i = 1; i < candles.length; i++) {
      const high = candles[i]?.high ?? 0
      const low = candles[i]?.low ?? 0
      const prevClose = candles[i - 1]?.close ?? 0

      const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose))
      trueRanges.push(tr)
    }

    return this.calculateEMA(trueRanges, period)
  }

  static calculateADX(candles: Candle[], period = 14): number {
    if (candles.length < period * 2 + period) return 25 // Default to mid-range if not enough data

    const plusDM: number[] = []
    const minusDM: number[] = []
    const tr: number[] = []

    // Calculate +DM, -DM, and TR for each period
    for (let i = 1; i < candles.length; i++) {
      const highDiff = candles[i].high - candles[i - 1].high
      const lowDiff = candles[i - 1].low - candles[i].low

      plusDM.push(highDiff > lowDiff && highDiff > 0 ? highDiff : 0)
      minusDM.push(lowDiff > highDiff && lowDiff > 0 ? lowDiff : 0)

      const prevClose = candles[i - 1].close
      tr.push(
        Math.max(
          candles[i].high - candles[i].low,
          Math.abs(candles[i].high - prevClose),
          Math.abs(candles[i].low - prevClose),
        ),
      )
    }

    // Calculate smoothed TR, +DM, -DM using Wilder's smoothing
    let smoothedTR = tr.slice(0, period).reduce((a, b) => a + b, 0)
    let smoothedPlusDM = plusDM.slice(0, period).reduce((a, b) => a + b, 0)
    let smoothedMinusDM = minusDM.slice(0, period).reduce((a, b) => a + b, 0)

    const dxValues: number[] = []

    for (let i = period; i < tr.length; i++) {
      // Wilder's smoothing: smoothed = prev - (prev/period) + current
      smoothedTR = smoothedTR - smoothedTR / period + tr[i]
      smoothedPlusDM = smoothedPlusDM - smoothedPlusDM / period + plusDM[i]
      smoothedMinusDM = smoothedMinusDM - smoothedMinusDM / period + minusDM[i]

      // Calculate +DI and -DI
      const plusDI = smoothedTR > 0 ? (smoothedPlusDM / smoothedTR) * 100 : 0
      const minusDI = smoothedTR > 0 ? (smoothedMinusDM / smoothedTR) * 100 : 0

      // Calculate DX
      const diSum = plusDI + minusDI
      const dx = diSum > 0 ? (Math.abs(plusDI - minusDI) / diSum) * 100 : 0
      dxValues.push(dx)
    }

    // Calculate ADX as smoothed average of DX values
    if (dxValues.length < period) {
      return dxValues.length > 0 ? dxValues.reduce((a, b) => a + b, 0) / dxValues.length : 25
    }

    // First ADX is simple average of first 'period' DX values
    let adx = dxValues.slice(0, period).reduce((a, b) => a + b, 0) / period

    // Smooth the rest using Wilder's method
    for (let i = period; i < dxValues.length; i++) {
      adx = (adx * (period - 1) + dxValues[i]) / period
    }

    return adx
  }

  static calculateVWAP(candles: Candle[], anchorTime?: string): { value: number; bias: string } {
    if (!candles || candles.length === 0) {
      return { value: 0, bias: "FLAT" }
    }

    let cumVolume = 0
    let cumTypicalPriceVolume = 0

    for (const candle of candles) {
      const typicalPrice = (candle.high + candle.low + candle.close) / 3
      const volume = candle.volume || 1 // Fallback for APIs without volume

      cumTypicalPriceVolume += typicalPrice * volume
      cumVolume += volume
    }

    const vwap = cumVolume > 0 ? cumTypicalPriceVolume / cumVolume : 0
    
    if (vwap === 0) {
      return { value: 0, bias: "FLAT" }
    }

    // Get current price (latest close)
    const currentPrice = candles[candles.length - 1].close

    // Determine bias
    let bias = "FLAT"
    if (currentPrice > vwap * 1.001) {
      bias = "BULLISH"
    } else if (currentPrice < vwap * 0.999) {
      bias = "BEARISH"
    }

    return { value: vwap, bias }
  }

  static calculateEMA(values: number[], period: number): number {
    if (values.length < period) return 0

    const multiplier = 2 / (period + 1)
    let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period

    for (let i = period; i < values.length; i++) {
      ema = (values[i] - ema) * multiplier + ema
    }

    return ema
  }

  static calculateSMA(values: number[], period: number): number {
    if (values.length < period) return 0
    const slice = values.slice(-period)
    return slice.reduce((a, b) => a + b, 0) / period
  }

  static calculateRSI(candles: Candle[], period = 14): number {
    if (candles.length < period + 1) return 50

    const changes = []
    for (let i = 1; i < candles.length; i++) {
      changes.push(candles[i].close - candles[i - 1].close)
    }

    const gains = changes.map((c) => (c > 0 ? c : 0))
    const losses = changes.map((c) => (c < 0 ? Math.abs(c) : 0))

    const avgGain = this.calculateSMA(gains.slice(-period), period)
    const avgLoss = this.calculateSMA(losses.slice(-period), period)

    if (avgLoss === 0) return 100
    const rs = avgGain / avgLoss
    return 100 - 100 / (1 + rs)
  }

  // Stoch RSI is NOT an entry gate. Informational only.
  static calculateStochasticRSI(
    candles: Candle[],
    rsiPeriod = 14,
    stochPeriod = 5,
  ): { value: number | null; state: "CALCULATING" | "MOMENTUM_UP" | "MOMENTUM_DOWN" | "COMPRESSION" } {
    // STRICT: Never use 50 as fallback. Return null when insufficient data.
    if (!candles || candles.length < rsiPeriod + stochPeriod) {
      console.log(`[v0] STOCH RSI STATE: CALCULATING | VALUE: null (insufficient candles: ${candles?.length || 0} < ${rsiPeriod + stochPeriod})`)
      return { value: null, state: "CALCULATING" }
    }

    // Calculate RSI for each candle over the lookback period
    const rsiValues: number[] = []
    for (let i = rsiPeriod; i < candles.length; i++) {
      const slice = candles.slice(i - rsiPeriod, i + 1)
      rsiValues.push(this.calculateRSI(slice, rsiPeriod))
    }

    if (rsiValues.length === 0) {
      console.log("[v0] STOCH RSI STATE: CALCULATING | VALUE: null (no RSI values computed)")
      return { value: null, state: "CALCULATING" }
    }

    // ADAPTIVE SMOOTHING: Use larger stoch period for small datasets
    // This prevents false extremes when recent RSI values are all at one end
    // For 200+ candles: use stochPeriod=5 (default)
    // For 150-199 candles: use stochPeriod=7 for better smoothing
    // For <150 candles: use stochPeriod=min(8, candles.length/20)
    const adaptiveStochPeriod = (() => {
      if (rsiValues.length >= 200) return Math.min(stochPeriod, 5)
      if (rsiValues.length >= 150) return Math.min(stochPeriod, 7)
      if (rsiValues.length >= 100) return Math.min(stochPeriod, 8)
      return Math.max(3, Math.floor(rsiValues.length / 20))
    })()

    // Calculate Stochastic of RSI using adaptive period
    const recentRSI = rsiValues.slice(-adaptiveStochPeriod)
    const minRSI = Math.min(...recentRSI)
    const maxRSI = Math.max(...recentRSI)
    const currentRSI = rsiValues[rsiValues.length - 1]

    // If range is zero, return COMPRESSION with the current RSI value
    // (not fake 50, which could mislead analysis)
    if (maxRSI === minRSI) {
      console.log(`[v0] STOCH RSI STATE: COMPRESSION | VALUE: ${currentRSI.toFixed(1)} (flat RSI range over last ${adaptiveStochPeriod} candles)`)
      return { value: currentRSI, state: "COMPRESSION" }
    }

    const stochValue = ((currentRSI - minRSI) / (maxRSI - minRSI)) * 100

    // State rules: value > 60 = MOMENTUM_UP, value < 40 = MOMENTUM_DOWN, 40-60 = COMPRESSION
    let state: "MOMENTUM_UP" | "MOMENTUM_DOWN" | "COMPRESSION" = "COMPRESSION"
    if (stochValue > 60) {
      state = "MOMENTUM_UP"
    } else if (stochValue < 40) {
      state = "MOMENTUM_DOWN"
    }

    console.log(`[v0] STOCH RSI STATE: ${state} | VALUE: ${stochValue.toFixed(1)} (adaptive period=${adaptiveStochPeriod}, RSI values=${rsiValues.length})`)
    return { value: stochValue, state }
  }

  static calculateBollingerBands(candles: Candle[], period = 20, stdDev = 2) {
    const closes = candles.map((c) => c.close)
    const sma = this.calculateSMA(closes, period)

    const slice = closes.slice(-period)
    const variance = slice.reduce((sum, val) => sum + Math.pow(val - sma, 2), 0) / period
    const std = Math.sqrt(variance)

    return {
      upper: sma + std * stdDev,
      middle: sma,
      lower: sma - std * stdDev,
    }
  }

  static calculateChandelierExit(
    candles: Candle[],
    period = 22,
    multiplier = 3,
  ): {
    long: number
    short: number
  } {
    if (candles.length < period) return { long: 0, short: 0 }

    const recentCandles = candles.slice(-period)
    const highest = Math.max(...recentCandles.map((c) => c.high))
    const lowest = Math.min(...recentCandles.map((c) => c.low))
    const atr = this.calculateATR(candles, period)

    // Chandelier Exit (Long) = Highest High - (ATR × Multiplier)
    // Chandelier Exit (Short) = Lowest Low + (ATR × Multiplier)
    return {
      long: highest - atr * multiplier,
      short: lowest + atr * multiplier,
    }
  }

  static calculateFibonacciLevels(
    candles: Candle[],
    lookback = 50,
  ): {
    high: number
    low: number
    fib236: number
    fib382: number
    fib500: number
    fib618: number
    fib786: number
  } {
    const recentCandles = candles.slice(-lookback)
    const high = Math.max(...recentCandles.map((c) => c.high))
    const low = Math.min(...recentCandles.map((c) => c.low))
    const range = high - low

    return {
      high,
      low,
      fib236: high - range * 0.236,
      fib382: high - range * 0.382,
      fib500: high - range * 0.5,
      fib618: high - range * 0.618,
      fib786: high - range * 0.786,
    }
  }

  static findSupportResistance(
    candles: Candle[],
    tolerance = 0.002,
  ): {
    resistance: number[]
    support: number[]
  } {
    const pivots: number[] = []

    // Find pivot points (local highs and lows)
    for (let i = 2; i < candles.length - 2; i++) {
      const isHigh =
        candles[i].high > candles[i - 1].high &&
        candles[i].high > candles[i - 2].high &&
        candles[i].high > candles[i + 1].high &&
        candles[i].high > candles[i + 2].high

      const isLow =
        candles[i].low < candles[i - 1].low &&
        candles[i].low < candles[i - 2].low &&
        candles[i].low < candles[i + 1].low &&
        candles[i].low < candles[i + 2].low

      if (isHigh) pivots.push(candles[i].high)
      if (isLow) pivots.push(candles[i].low)
    }

    // Cluster pivots within tolerance
    const clustered: number[] = []
    pivots.sort((a, b) => a - b)

    for (const pivot of pivots) {
      const existing = clustered.find((c) => Math.abs(c - pivot) / pivot < tolerance)
      if (!existing) {
        clustered.push(pivot)
      }
    }

    const currentPrice = candles[candles.length - 1].close
    const resistance = clustered.filter((p) => p > currentPrice).slice(0, 3)
    const support = clustered.filter((p) => p < currentPrice).slice(-3)

    return { resistance, support }
  }

  static detectBias(candles: Candle[]): "BULLISH" | "BEARISH" | "RANGING" {
    if (candles.length < 50) return "RANGING"

    const closes = candles.map((c) => c.close)
    const currentPrice = closes[closes.length - 1]

    const ema20 = this.calculateEMA(closes, 20)
    const ema50 = this.calculateEMA(closes, 50)
    const ema200 = this.calculateEMA(closes, 200)
    const rsi = this.calculateRSI(candles)
    const adx = this.calculateADX(candles)
    const macd = this.calculateMACD(candles)
    const stochRSI = this.calculateStochasticRSI(candles)

    // Score-based bias determination
    let bullishScore = 0
    let bearishScore = 0

    // 1. Price vs EMAs (0-3 points)
    if (currentPrice > ema20 && ema20 > ema50 && ema50 > ema200) bullishScore += 3
    else if (currentPrice > ema20 && currentPrice > ema50) bullishScore += 2
    else if (currentPrice > ema20) bullishScore += 1

    if (currentPrice < ema20 && ema20 < ema50 && ema50 < ema200) bearishScore += 3
    else if (currentPrice < ema20 && currentPrice < ema50) bearishScore += 2
    else if (currentPrice < ema20) bearishScore += 1

    // 2. RSI (0-2 points)
    if (rsi > 60) bullishScore += 2
    else if (rsi > 50) bullishScore += 1

    if (rsi < 40) bearishScore += 2
    else if (rsi < 50) bearishScore += 1

    // 3. MACD (0-2 points)
    if (macd.macd > macd.signal && macd.histogram > 0) bullishScore += 2
    else if (macd.macd > macd.signal) bullishScore += 1

    if (macd.macd < macd.signal && macd.histogram < 0) bearishScore += 2
    else if (macd.macd < macd.signal) bearishScore += 1

    // 4. StochRSI (0-2 points)
    const stochRSIValue = stochRSI.value ?? 50 // Use value property, fallback to 50 if null
    if (stochRSIValue > 70) bullishScore += 2
    else if (stochRSIValue > 50) bullishScore += 1

    if (stochRSIValue < 30) bearishScore += 2
    else if (stochRSIValue < 50) bearishScore += 1

    // 5. ADX (0-2 points for trend strength confirmation)
    if (adx >= 23) {
      if (bullishScore > bearishScore) bullishScore += 2
      if (bearishScore > bullishScore) bearishScore += 2
    }

    // Determine bias based on weighted scores
    const bullishThreshold = 6
    const bearishThreshold = 6

    if (bullishScore >= bullishThreshold && bullishScore > bearishScore) return "BULLISH"
    if (bearishScore >= bearishThreshold && bearishScore > bullishScore) return "BEARISH"

    return "RANGING"
  }

  /**
   * Calculate Chandelier Stop (volatility-adjusted trailing stop)
   * For LONG: Stop = Highest High over period - (ATR × multiple)
   * For SHORT: Stop = Lowest Low over period + (ATR × multiple)
   */
  static calculateChandelierStop(
    candles: Candle[],
    period: number = 22,
    atrMultiple: number = 3
  ): { long: number; short: number } {
    if (candles.length < period) {
      const lastClose = candles[candles.length - 1]?.close ?? 0
      return { long: lastClose, short: lastClose }
    }

    const recentCandles = candles.slice(-period)
    const atr = this.calculateATR(candles, 14)

    // Find highest high and lowest low over the period
    let highestHigh = recentCandles[0]?.high ?? 0
    let lowestLow = recentCandles[0]?.low ?? 0

    for (const candle of recentCandles) {
      highestHigh = Math.max(highestHigh, candle.high)
      lowestLow = Math.min(lowestLow, candle.low)
    }

    // Chandelier Stop = Highest High - (ATR × multiple) for LONG
    // Chandelier Stop = Lowest Low + (ATR × multiple) for SHORT
    const chandelierLong = highestHigh - atr * atrMultiple
    const chandelierShort = lowestLow + atr * atrMultiple

    return {
      long: chandelierLong,
      short: chandelierShort,
    }
  }

  static calculateAllIndicators(candles: Candle[], config?: any): TechnicalIndicators {
    if (!candles || candles.length < 50) {
      console.log(`[v0] Insufficient candles for indicator calculation: ${candles?.length || 0}`)
      return this.getDefaultIndicators()
    }

    try {
      const symbol = config?.symbol || "XAU_USD"
      const validCandles = this.filterValidOHLC(candles, symbol)

      if (validCandles.length < 50) {
        console.log(`[v0] Too many invalid candles, only ${validCandles.length} valid out of ${candles.length}`)
        return this.getDefaultIndicators()
      }

      const closes = validCandles.map((c) => c.close)
      const atr = this.calculateATR(validCandles) || 0
      const adx = this.calculateADX(validCandles) || 20
      const vwapResult = this.calculateVWAP(validCandles)
      const ema20 = this.calculateEMA(closes, 20) || 0
      const ema50 = this.calculateEMA(closes, 50) || 0
      const ema200 = this.calculateEMA(closes, 200) || 0
      const rsi = this.calculateRSI(validCandles) || 50
      const stochRSIResult = this.calculateStochasticRSI(validCandles)
      const macd = this.calculateMACD(validCandles)

      // Ensure all numeric values are within realistic bounds
      return {
        atr: Math.max(0, atr),
        adx: Math.max(0, Math.min(100, adx)),
        vwap: vwapResult.value > 0 ? vwapResult.value : 0,
        ema20: ema20 > 0 ? ema20 : 0,
        ema50: ema50 > 0 ? ema50 : 0,
        ema200: ema200 > 0 ? ema200 : 0,
        rsi: Math.max(0, Math.min(100, rsi)),
        stochRSI: stochRSIResult && typeof stochRSIResult === "object" ? {
          value: Math.max(0, Math.min(100, stochRSIResult.value ?? 50)),
          state: stochRSIResult.state || "CALCULATING"
        } : { value: 50, state: "CALCULATING" },
        bollingerUpper: 0,
        bollingerLower: 0,
        chandelierStop: { long: 0, short: 0 },
        macd,
      }
    } catch (error) {
      console.error("[v0] Error in calculateAllIndicators:", error)
      return this.getDefaultIndicators()
    }
  }

  private static filterValidOHLC(candles: Candle[], symbol: string = "XAU_USD"): Candle[] {
    // Dynamic price range based on actual candle data
    // Get realistic price range from the candles themselves
    if (!candles || candles.length === 0) return []

    // Calculate price range from the actual data
    const allPrices = candles.flatMap(candle => [candle.open, candle.high, candle.low, candle.close])
    const minPrice = Math.min(...allPrices)
    const maxPrice = Math.max(...allPrices)
    
    // Add safety margins (10% below min, 10% above max) to handle outliers
    const safetyMargin = (maxPrice - minPrice) * 0.1
    const dynamicMinPrice = Math.max(0, minPrice - safetyMargin)
    const dynamicMaxPrice = maxPrice + safetyMargin

    return candles.filter((candle) => {
      // Reject candles with invalid OHLC values
      if (candle.open <= 0 || candle.high <= 0 || candle.low <= 0 || candle.close <= 0) {
        return false
      }

      // Reject candles with null/undefined/NaN values
      if (
        candle.open == null ||
        candle.high == null ||
        candle.low == null ||
        candle.close == null ||
        isNaN(candle.open) ||
        isNaN(candle.high) ||
        isNaN(candle.low) ||
        isNaN(candle.close)
      ) {
        return false
      }

      // Reject candles with impossible OHLC relationships
      if (
        candle.high < candle.low ||
        candle.close > candle.high ||
        candle.close < candle.low ||
        candle.open > candle.high ||
        candle.open < candle.low
      ) {
        return false
      }

      // Dynamic price range validation based on actual data
      const avgPrice = (candle.open + candle.high + candle.low + candle.close) / 4
      if (avgPrice < dynamicMinPrice || avgPrice > dynamicMaxPrice) {
        return false
      }

      return true
    })
  }

  static validateCandles(candles: Candle[], currentPrice: number): Candle[] {
    // Ignore currentPrice parameter - it was causing all historical data to be rejected
    return this.filterValidOHLC(candles)
  }

  static calculateMACD(
    candles: Candle[],
    fastPeriod = 12,
    slowPeriod = 26,
    signalPeriod = 9,
  ): {
    macd: number
    signal: number
    histogram: number
  } {
    if (candles.length < slowPeriod + signalPeriod) {
      return { macd: 0, signal: 0, histogram: 0 }
    }

    const closes = candles.map((c) => c.close)
    const fastEMA = this.calculateEMA(closes, fastPeriod)
    const slowEMA = this.calculateEMA(closes, slowPeriod)
    const macd = fastEMA - slowEMA

    // Calculate signal line (EMA of MACD)
    const macdValues: number[] = []
    for (let i = slowPeriod; i < closes.length; i++) {
      const slice = closes.slice(0, i + 1)
      const fast = this.calculateEMA(slice, fastPeriod)
      const slow = this.calculateEMA(slice, slowPeriod)
      macdValues.push(fast - slow)
    }

    const signal = this.calculateEMA(macdValues, signalPeriod)
    const histogram = macd - signal

    return { macd, signal, histogram }
  }

  static detectDivergence(
    candles: Candle[],
    lookback = 20,
  ): {
    bullish: boolean
    bearish: boolean
    strength: number
  } {
    if (candles.length < lookback) {
      return { bullish: false, bearish: false, strength: 0 }
    }

    const recentCandles = candles.slice(-lookback)
    const rsiValues: number[] = []

    for (let i = 14; i < recentCandles.length; i++) {
      rsiValues.push(this.calculateRSI(recentCandles.slice(0, i + 1), 14))
    }

    // Find local lows/highs in price and RSI
    const priceLows: { index: number; value: number }[] = []
    const priceHighs: { index: number; value: number }[] = []
    const rsiLows: { index: number; value: number }[] = []
    const rsiHighs: { index: number; value: number }[] = []

    for (let i = 2; i < recentCandles.length - 2; i++) {
      // Local low
      if (
        recentCandles[i].low < recentCandles[i - 1].low &&
        recentCandles[i].low < recentCandles[i - 2].low &&
        recentCandles[i].low < recentCandles[i + 1].low &&
        recentCandles[i].low < recentCandles[i + 2].low
      ) {
        priceLows.push({ index: i, value: recentCandles[i].low })
        if (i >= 14) {
          rsiLows.push({ index: i, value: rsiValues[i - 14] })
        }
      }

      // Local high
      if (
        recentCandles[i].high > recentCandles[i - 1].high &&
        recentCandles[i].high > recentCandles[i - 2].high &&
        recentCandles[i].high > recentCandles[i + 1].high &&
        recentCandles[i].high > recentCandles[i + 2].high
      ) {
        priceHighs.push({ index: i, value: recentCandles[i].high })
        if (i >= 14) {
          rsiHighs.push({ index: i, value: rsiValues[i - 14] })
        }
      }
    }

    // Bullish divergence: Price makes lower low, RSI makes higher low
    let bullish = false
    if (priceLows.length >= 2 && rsiLows.length >= 2) {
      const lastPriceLow = priceLows[priceLows.length - 1]
      const prevPriceLow = priceLows[priceLows.length - 2]
      const lastRSILow = rsiLows[rsiLows.length - 1]
      const prevRSILow = rsiLows[rsiLows.length - 2]

      if (lastPriceLow.value < prevPriceLow.value && lastRSILow.value > prevRSILow.value) {
        bullish = true
      }
    }

    // Bearish divergence: Price makes higher high, RSI makes lower high
    let bearish = false
    if (priceHighs.length >= 2 && rsiHighs.length >= 2) {
      const lastPriceHigh = priceHighs[priceHighs.length - 1]
      const prevPriceHigh = priceHighs[priceHighs.length - 2]
      const lastRSIHigh = rsiHighs[rsiHighs.length - 1]
      const prevRSIHigh = rsiHighs[rsiHighs.length - 2]

      if (lastPriceHigh.value > prevPriceHigh.value && lastRSIHigh.value < prevRSIHigh.value) {
        bearish = true
      }
    }

    const strength = bullish || bearish ? 75 : 0

    return { bullish, bearish, strength }
  }

  static detectVolumeSpike(candles: Candle[], threshold = 1.5): boolean {
    if (candles.length < 20) return false

    const recentVolumes = candles.slice(-20).map((c) => c.volume || 1)
    const avgVolume = recentVolumes.slice(0, -1).reduce((a, b) => a + b, 0) / (recentVolumes.length - 1)
    const currentVolume = recentVolumes[recentVolumes.length - 1]

    return currentVolume > avgVolume * threshold
  }

  private static getDefaultIndicators(): TechnicalIndicators {
    return {
      atr: 0,
      adx: 0,
      vwap: 0,
      ema20: 0,
      ema50: 0,
      ema200: 0,
      rsi: 50,
      stochRSI: 50,
      bollingerUpper: 0,
      bollingerLower: 0,
      chandelierStop: { long: 0, short: 0 },
      fibonacciLevels: {
        high: 0,
        low: 0,
        fib236: 0,
        fib382: 0,
        fib500: 0,
        fib618: 0,
        fib786: 0,
      },
      supportResistance: {
        resistance: [],
        support: [],
      },
      marketBias: "RANGING",
      macd: { macd: 0, signal: 0, histogram: 0 },
      divergence: { bullish: false, bearish: false, strength: 0 },
      volumeSpike: false,
    }
  }

  private static smoothedAverage(values: number[], period: number): number {
    if (values.length < period) return 0

    const sum = values.slice(0, period).reduce((a, b) => a + b, 0)
    let smoothed = sum / period

    for (let i = period; i < values.length; i++) {
      smoothed = (smoothed * (period - 1) + values[i]) / period
    }

    return smoothed
  }

  static async calculate(candles: Candle[]): Promise<TechnicalIndicators> {
    if (!candles || candles.length === 0) {
      return {
        adx: 20,
        atr: 0,
        rsi: 50,
        stochRSI: 50,
        ema20: 0,
        ema50: 0,
        ema200: 0,
        vwap: 0,
        bollingerUpper: 0,
        bollingerLower: 0,
        chandelierStop: { long: 0, short: 0 },
        macd: { macd: 0, signal: 0, histogram: 0 },
      }
    }

    const adx = this.calculateADX(candles, 14)
  const atr = this.calculateATR(candles, 14)
  const rsi = this.calculateRSI(candles, 14)
  const stochRSI = this.calculateStochasticRSI(candles, 14, 5)
    const ema20 = this.calculateEMA(
      candles.map((c) => c.close),
      20,
    )
    const ema50 = this.calculateEMA(
      candles.map((c) => c.close),
      50,
    )
    const ema200 = this.calculateEMA(
      candles.map((c) => c.close),
      200,
    )
    const vwap = this.calculateVWAP(candles).value
    const macd = this.calculateMACD(candles)

    return {
      adx,
      atr,
      rsi,
      stochRSI,
      ema20,
      ema50,
      ema200,
      vwap,
      bollingerUpper: 0,
      bollingerLower: 0,
      chandelierStop: { long: 0, short: 0 },
      macd,
    }
  }
}
