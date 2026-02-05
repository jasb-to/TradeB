import type { Candle, TechnicalIndicators } from "@/types/trading"

export interface DataQualityReport {
  symbol: string
  timestamp: number
  candleQuality: {
    totalCandles: number
    validCandles: number
    invalidCandles: number
    minPrice: number
    maxPrice: number
    gaps: number
    qualityScore: number // 0-100
  }
  indicatorQuality: {
    allPresent: boolean
    allNonZero: boolean
    allRealistic: boolean
    issues: string[]
    qualityScore: number // 0-100
  }
  synchronizationQuality: {
    oandaCacheAge: number // ms
    signalCacheAge: number // ms
    indicatorFreshness: "FRESH" | "ACCEPTABLE" | "STALE"
    qualityScore: number // 0-100
  }
  overallScore: number // 0-100
  recommendations: string[]
}

export class DataQualityMonitor {
  /**
   * Validate candle data integrity and detect malformed data
   */
  static validateCandleData(candles: Candle[], symbol: string): {
    valid: boolean
    invalidCount: number
    issues: string[]
  } {
    const issues: string[] = []
    let invalidCount = 0

    // Symbol-specific price ranges (realistic bounds)
    const priceRanges: Record<string, [number, number]> = {
      XAU_USD: [1500, 3000], // Gold typically $1500-$3000
      XAG_USD: [15, 40], // Silver typically $15-$40
    }

    const [minValid, maxValid] = priceRanges[symbol] || [0, 100000]

    for (let i = 0; i < candles.length; i++) {
      const candle = candles[i]

      // Check for NaN or negative values
      if (!candle.open || !candle.high || !candle.low || !candle.close) {
        issues.push(`Candle ${i}: Missing OHLC data`)
        invalidCount++
        continue
      }

      // Check OHLC logic
      if (candle.high < candle.low) {
        issues.push(`Candle ${i}: High < Low`)
        invalidCount++
        continue
      }

      if (candle.close < candle.low || candle.close > candle.high) {
        issues.push(`Candle ${i}: Close outside high-low range`)
        invalidCount++
        continue
      }

      if (candle.open < candle.low || candle.open > candle.high) {
        issues.push(`Candle ${i}: Open outside high-low range`)
        invalidCount++
        continue
      }

      // Check price is within realistic range
      if (candle.low < minValid || candle.high > maxValid) {
        issues.push(`Candle ${i}: Price outside realistic range [${minValid}, ${maxValid}]`)
        invalidCount++
        continue
      }

      // Check for unrealistic single-candle moves (>10%)
      if (i > 0) {
        const prevClose = candles[i - 1].close
        const gapPercent = Math.abs((candle.open - prevClose) / prevClose) * 100
        if (gapPercent > 5) {
          // Gap of >5% is suspicious but not invalid - flag it
          issues.push(`Candle ${i}: Gap of ${gapPercent.toFixed(1)}% from previous close`)
        }
      }
    }

    return {
      valid: invalidCount === 0,
      invalidCount,
      issues,
    }
  }

  /**
   * Verify indicator values are realistic and non-placeholder
   */
  static verifyIndicatorValues(indicators: TechnicalIndicators, symbol: string): {
    allValid: boolean
    issues: string[]
  } {
    const issues: string[] = []

    // ADX: 0-100 range, should be > 0 if we have data
    if (indicators.adx < 0 || indicators.adx > 100) {
      issues.push(`ADX out of range: ${indicators.adx}`)
    }
    if (indicators.adx === 0) {
      issues.push("ADX is zero (possible placeholder)")
    }

    // ATR: Should be > 0 for tradeable assets, and reasonable for symbol
    if (indicators.atr < 0) {
      issues.push(`ATR negative: ${indicators.atr}`)
    }
    if (indicators.atr === 0) {
      issues.push("ATR is zero (possible placeholder)")
    }

    // Symbol-specific ATR bounds
    const minAtr: Record<string, number> = { XAU_USD: 2.0, XAG_USD: 0.2 }
    const maxAtr: Record<string, number> = { XAU_USD: 100.0, XAG_USD: 5.0 }
    const min = minAtr[symbol] || 0.1
    const max = maxAtr[symbol] || 1000

    if (indicators.atr > max) {
      issues.push(`ATR unrealistically high: ${indicators.atr} (max: ${max})`)
    }

    // RSI: 0-100 range, should typically be between 20-80
    if (indicators.rsi < 0 || indicators.rsi > 100) {
      issues.push(`RSI out of range: ${indicators.rsi}`)
    }
    if (indicators.rsi === 50) {
      issues.push("RSI is exactly 50 (neutral default - may be stale data)")
    }

    // StochRSI: 0-100 range
    if (indicators.stochRSI < 0 || indicators.stochRSI > 100) {
      issues.push(`StochRSI out of range: ${indicators.stochRSI}`)
    }
    if (indicators.stochRSI === 50) {
      issues.push("StochRSI is exactly 50 (neutral default - may indicate insufficient data)")
    }

    // VWAP: Should be positive and close to current price
    if (indicators.vwap <= 0) {
      issues.push("VWAP is zero or negative (placeholder)")
    }

    // EMA checks
    if (indicators.ema20 === 0 && indicators.ema50 === 0 && indicators.ema200 === 0) {
      issues.push("All EMAs are zero (insufficient candle history)")
    }

    // MACD check
    if (indicators.macd && indicators.macd.macd === 0 && indicators.macd.signal === 0) {
      issues.push("MACD is zero (insufficient data)")
    }

    return {
      allValid: issues.length === 0,
      issues,
    }
  }

  /**
   * Generate comprehensive data quality report
   */
  static generateQualityReport(
    candles: Candle[],
    indicators: TechnicalIndicators,
    symbol: string,
    oandaCacheAgeMs: number,
    signalCacheAgeMs: number,
  ): DataQualityReport {
    const timestamp = Date.now()

    // Assess candle quality
    const candleValidation = this.validateCandleData(candles, symbol)
    const validCandles = candles.length - candleValidation.invalidCount
    const candleQualityScore = candles.length > 0 ? (validCandles / candles.length) * 100 : 0

    // Count price gaps
    let gaps = 0
    for (let i = 1; i < candles.length; i++) {
      const gapPercent = Math.abs((candles[i].open - candles[i - 1].close) / candles[i - 1].close) * 100
      if (gapPercent > 2) gaps++
    }

    // Assess indicator quality
    const indicatorValidation = this.verifyIndicatorValues(indicators, symbol)
    const indicatorQualityScore = indicatorValidation.issues.length === 0 ? 100 : 75

    // Assess synchronization
    const isFresh = oandaCacheAgeMs < 60000 // < 1 minute
    const isAcceptable = oandaCacheAgeMs < 300000 // < 5 minutes
    const freshness = isFresh ? "FRESH" : isAcceptable ? "ACCEPTABLE" : "STALE"
    const syncQualityScore = isFresh ? 100 : isAcceptable ? 80 : 40

    // Overall score (weighted average)
    const overallScore = (candleQualityScore * 0.4 + indicatorQualityScore * 0.35 + syncQualityScore * 0.25) / 100

    // Recommendations
    const recommendations: string[] = []
    if (candles.length < 50) {
      recommendations.push("⚠️ Insufficient candle history - wait for more data")
    }
    if (candleQualityScore < 95) {
      recommendations.push(`⚠️ Candle quality issues detected: ${candleValidation.issues.join(", ")}`)
    }
    if (indicatorValidation.issues.length > 0) {
      recommendations.push(`⚠️ Indicator issues: ${indicatorValidation.issues.join(", ")}`)
    }
    if (!isFresh) {
      recommendations.push(`⚠️ Data is ${oandaCacheAgeMs / 1000}s old - refresh soon`)
    }
    if (overallScore >= 90) {
      recommendations.push("✅ Data quality excellent - safe for trading")
    } else if (overallScore >= 70) {
      recommendations.push("✓ Data quality acceptable - proceed with caution")
    } else {
      recommendations.push("❌ Data quality poor - wait for better conditions")
    }

    return {
      symbol,
      timestamp,
      candleQuality: {
        totalCandles: candles.length,
        validCandles,
        invalidCandles: candleValidation.invalidCount,
        minPrice: candles.length > 0 ? Math.min(...candles.map((c) => c.low)) : 0,
        maxPrice: candles.length > 0 ? Math.max(...candles.map((c) => c.high)) : 0,
        gaps,
        qualityScore: candleQualityScore,
      },
      indicatorQuality: {
        allPresent: !indicatorValidation.issues.some((i) => i.includes("zero")),
        allNonZero: Object.values(indicators).every((v) => v && v !== 0),
        allRealistic: indicatorValidation.issues.length === 0,
        issues: indicatorValidation.issues,
        qualityScore: indicatorQualityScore,
      },
      synchronizationQuality: {
        oandaCacheAge: oandaCacheAgeMs,
        signalCacheAge: signalCacheAgeMs,
        indicatorFreshness: freshness,
        qualityScore: syncQualityScore,
      },
      overallScore: Math.round(overallScore * 100) / 100,
      recommendations,
    }
  }
}
