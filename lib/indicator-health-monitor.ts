/**
 * Indicator Health Monitor
 * 
 * Real-time validation and monitoring of indicator calculations
 * Used to diagnose synchronization issues between data feeds and indicators
 */

interface IndicatorHealth {
  timestamp: string
  indicators: {
    adx: { value: number; expected: boolean; message: string }
    atr: { value: number; expected: boolean; message: string }
    rsi: { value: number; expected: boolean; message: string }
    stochRSI: { state: string; value: number | null; expected: boolean; message: string }
    vwap: { value: number; expected: boolean; message: string }
  }
  entryDecision: {
    tier: string
    score: number
    criteria: number
    expected: boolean
    message: string
  }
  dataQuality: {
    dailyCandles: number
    hourlyCandles: number
    expected: boolean
    message: string
  }
  overall: {
    healthy: boolean
    criticalIssues: string[]
    warnings: string[]
  }
}

export class IndicatorHealthMonitor {
  private static readonly MIN_DAILY_CANDLES = 50
  private static readonly MIN_HOURLY_CANDLES = 50
  private static readonly MIN_STOCH_RSI_CANDLES = 17

  static diagnoseIndicatorHealth(signal: any): IndicatorHealth {
    const timestamp = new Date().toISOString()
    const criticalIssues: string[] = []
    const warnings: string[] = []

    // Check ADX
    const adx = signal?.indicators?.adx || 0
    const adxHealthy = adx > 0 && adx <= 100
    if (!adxHealthy) {
      criticalIssues.push(`ADX value out of range: ${adx}`)
    }

    // Check ATR
    const atr = signal?.indicators?.atr || 0
    const atrHealthy = atr >= 0 && atr < 1000 // Reasonable bounds
    if (!atrHealthy) {
      criticalIssues.push(`ATR value out of range: ${atr}`)
    }

    // Check RSI
    const rsi = signal?.indicators?.rsi || 50
    const rsiHealthy = rsi >= 0 && rsi <= 100
    if (!rsiHealthy) {
      criticalIssues.push(`RSI value out of range: ${rsi}`)
    }

    // Check Stochastic RSI
    const stochRSI = signal?.indicators?.stochRSI
    let stochHealthy = true
    let stochState = "UNKNOWN"
    let stochValue: number | null = null

    if (typeof stochRSI === "object" && stochRSI !== null) {
      stochState = stochRSI.state || "UNKNOWN"
      stochValue = stochRSI.value || null
      
      const validStates = ["CALCULATING", "MOMENTUM_UP", "MOMENTUM_DOWN", "COMPRESSION"]
      if (!validStates.includes(stochState)) {
        criticalIssues.push(`Invalid StochRSI state: ${stochState}`)
        stochHealthy = false
      }
    } else {
      warnings.push(`StochRSI is not a structured object: ${typeof stochRSI}`)
      stochHealthy = false
    }

    // Check VWAP
    const vwap = signal?.indicators?.vwap || 0
    const currentPrice = signal?.lastCandle?.close || 0
    
    let vwapHealthy = true
    let vwapMessage = "OK"
    
    if (vwap === 0 && currentPrice > 0) {
      warnings.push(`VWAP is 0 but current price is ${currentPrice}`)
      vwapHealthy = false
      vwapMessage = "No daily VWAP calculated (using fallback)"
    } else if (vwap > 0 && currentPrice === 0) {
      criticalIssues.push(`VWAP exists (${vwap}) but current price is 0`)
      vwapHealthy = false
      vwapMessage = "Data integrity issue"
    } else if (vwap > 0 && currentPrice > 0) {
      vwapMessage = `$${vwap.toFixed(2)} (current: $${currentPrice.toFixed(2)})`
    }

    // Check Entry Decision
    const entryDecision = signal?.entryDecision
    let entryHealthy = true
    let entryMessage = "OK"

    if (!entryDecision) {
      criticalIssues.push("No entry decision present")
      entryHealthy = false
      entryMessage = "Missing entirely"
    } else {
      const criteria = entryDecision.criteria || []
      if (criteria.length !== 7) {
        criticalIssues.push(`Expected 7 criteria, got ${criteria.length}`)
        entryHealthy = false
      }

      const tier = entryDecision.tier
      const score = entryDecision.score
      
      // Validate tier/score consistency
      if (
        (tier === "A+" && score < 7) ||
        (tier === "A" && (score < 6 || score >= 7)) ||
        (tier === "B" && (score < 4.5 || score >= 6)) ||
        (tier === "NO_TRADE" && score >= 4.5)
      ) {
        warnings.push(`Tier/score mismatch: ${tier} with score ${score}`)
      }

      entryMessage = `${tier} | Score: ${score.toFixed(1)}/9 | Criteria: ${criteria.length}`
    }

    // Check Data Quality
    const dailyCandles = signal?.indicators ? "has indicators" : "no indicators"
    const hourlyCandles = signal?.lastCandle ? "has last candle" : "no last candle"
    
    const dataQualityHealthy = !!signal?.indicators && !!signal?.lastCandle
    const dataQualityMessage = dataQualityHealthy 
      ? "Daily + Hourly data present" 
      : "Missing data sources"

    if (!dataQualityHealthy) {
      criticalIssues.push(dataQualityMessage)
    }

    // Overall assessment
    const overall = {
      healthy: criticalIssues.length === 0,
      criticalIssues,
      warnings,
    }

    return {
      timestamp,
      indicators: {
        adx: {
          value: adx,
          expected: adxHealthy,
          message: adxHealthy ? `${adx.toFixed(1)}` : `OUT OF RANGE`,
        },
        atr: {
          value: atr,
          expected: atrHealthy,
          message: atrHealthy ? `${atr.toFixed(2)}` : `OUT OF RANGE`,
        },
        rsi: {
          value: rsi,
          expected: rsiHealthy,
          message: rsiHealthy ? `${rsi.toFixed(1)}` : `OUT OF RANGE`,
        },
        stochRSI: {
          state: stochState,
          value: stochValue,
          expected: stochHealthy,
          message: stochHealthy ? `${stochState}` : `INVALID STATE`,
        },
        vwap: {
          value: vwap,
          expected: vwapHealthy,
          message: vwapMessage,
        },
      },
      entryDecision: {
        tier: entryDecision?.tier || "UNKNOWN",
        score: entryDecision?.score || 0,
        criteria: entryDecision?.criteria?.length || 0,
        expected: entryHealthy,
        message: entryMessage,
      },
      dataQuality: {
        dailyCandles: dailyCandles as any,
        hourlyCandles: hourlyCandles as any,
        expected: dataQualityHealthy,
        message: dataQualityMessage,
      },
      overall,
    }
  }

  static formatHealthReport(health: IndicatorHealth): string {
    const lines = [
      `\n${"=".repeat(60)}`,
      `INDICATOR HEALTH REPORT - ${health.timestamp}`,
      `${"=".repeat(60)}\n`,
      
      `INDICATORS:`,
      `  ADX ............... ${health.indicators.adx.expected ? "✓" : "✗"} ${health.indicators.adx.message}`,
      `  ATR ............... ${health.indicators.atr.expected ? "✓" : "✗"} ${health.indicators.atr.message}`,
      `  RSI ............... ${health.indicators.rsi.expected ? "✓" : "✗"} ${health.indicators.rsi.message}`,
      `  StochRSI .......... ${health.indicators.stochRSI.expected ? "✓" : "✗"} ${health.indicators.stochRSI.message}`,
      `  VWAP .............. ${health.indicators.vwap.expected ? "✓" : "✗"} ${health.indicators.vwap.message}\n`,
      
      `ENTRY DECISION:`,
      `  Tier/Score ........ ${health.entryDecision.expected ? "✓" : "✗"} ${health.entryDecision.message}\n`,
      
      `DATA QUALITY:`,
      `  Status ............ ${health.dataQuality.expected ? "✓" : "✗"} ${health.dataQuality.message}\n`,
      
      `OVERALL:`,
      `  Status ............ ${health.overall.healthy ? "✓ HEALTHY" : "✗ ISSUES DETECTED"}`,
    ]

    if (health.overall.criticalIssues.length > 0) {
      lines.push(`  Critical Issues ... ${health.overall.criticalIssues.length}`)
      health.overall.criticalIssues.forEach(issue => {
        lines.push(`    • ${issue}`)
      })
    }

    if (health.overall.warnings.length > 0) {
      lines.push(`  Warnings .......... ${health.overall.warnings.length}`)
      health.overall.warnings.forEach(warning => {
        lines.push(`    • ${warning}`)
      })
    }

    lines.push(`${"=".repeat(60)}\n`)
    return lines.join("\n")
  }

  static validateIndicatorSynchronization(signals: any[]): {
    synchronized: boolean
    issues: string[]
    recommendations: string[]
  } {
    const issues: string[] = []
    const recommendations: string[] = []

    if (signals.length < 2) {
      return { synchronized: true, issues: [], recommendations: [] }
    }

    // Check for consistency across signals
    for (let i = 1; i < signals.length; i++) {
      const prev = signals[i - 1]
      const curr = signals[i]

      // VWAP should remain relatively stable (only updates on daily boundary)
      const vwapDiff = Math.abs((curr.indicators?.vwap || 0) - (prev.indicators?.vwap || 0))
      const vwapThreshold = (prev.indicators?.vwap || 0) * 0.01 // 1% threshold

      if (vwapDiff > vwapThreshold) {
        issues.push(`VWAP changed significantly: ${prev.indicators?.vwap} → ${curr.indicators?.vwap}`)
        recommendations.push("Verify daily candle boundary transition or data feed integrity")
      }

      // Entry Decision tier shouldn't change without clear reason
      if (prev.entryDecision?.tier !== curr.entryDecision?.tier) {
        const scoreDiff = (curr.entryDecision?.score || 0) - (prev.entryDecision?.score || 0)
        if (Math.abs(scoreDiff) > 1) {
          issues.push(`Tier changed: ${prev.entryDecision?.tier} → ${curr.entryDecision?.tier} (score delta: ${scoreDiff.toFixed(1)})`)
          recommendations.push("Review indicator changes that caused tier shift")
        }
      }
    }

    return {
      synchronized: issues.length === 0,
      issues,
      recommendations,
    }
  }
}
