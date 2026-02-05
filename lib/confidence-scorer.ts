export interface ConfidenceScores {
  strategy: number // 0-10: weighted MTF + ADX + ATR alignment
  backend: number // 0-10: API data quality + indicator calculations
  frontend: number // 0-10: MTF badge rendering + indicators display
  alerts: number // 0-10: Telegram delivery success
  overall: number // 0-10: combined score
}

export class ConfidenceScorer {
  /**
   * Score strategy tier and confidence
   */
  static scoreStrategy(
    alignmentScore: number,
    adx: number,
    atr: number,
    symbol: string,
  ): { score: number; tier: "A+" | "A" | "NONE" } {
    let score = 0

    // Weighted alignment (max 4 points)
    score += Math.min(alignmentScore / 2, 4)

    // ADX confidence (max 3 points)
    if (adx >= 25) score += 3
    else if (adx >= 20) score += 2
    else if (adx >= 18) score += 1

    // ATR volatility (max 3 points)
    const minAtr = symbol === "XAU_USD" ? 2.5 : 0.35
    if (atr >= minAtr * 1.5) score += 3
    else if (atr >= minAtr) score += 2
    else if (atr >= minAtr * 0.7) score += 1

    // Determine tier
    let tier: "A+" | "A" | "NONE" = "NONE"
    if (symbol === "XAU_USD") {
      if (alignmentScore >= 8 && adx >= 25) tier = "A+"
      else if (alignmentScore >= 6 && adx >= 20) tier = "A"
    } else if (symbol === "XAG_USD") {
      if (alignmentScore >= 6 && adx >= 20) tier = "A"
    }

    return {
      score: Math.min(score, 10),
      tier,
    }
  }

  /**
   * Score backend data quality
   */
  static scoreBackend(candleCount: number, indicatorsCalculated: boolean, apiLatency: number): number {
    let score = 10

    // Candle count (should be 200+)
    if (candleCount < 100) score -= 3
    else if (candleCount < 150) score -= 1

    // Indicators
    if (!indicatorsCalculated) score -= 5

    // API latency (should be < 2000ms)
    if (apiLatency > 5000) score -= 3
    else if (apiLatency > 2000) score -= 1

    return Math.max(score, 0)
  }

  /**
   * Score frontend rendering
   */
  static scoreFrontend(mtfBadgesRendered: boolean, indicatorsDisplayed: boolean, errorsLogged: number): number {
    let score = 10

    if (!mtfBadgesRendered) score -= 3
    if (!indicatorsDisplayed) score -= 3
    score -= Math.min(errorsLogged * 2, 4)

    return Math.max(score, 0)
  }

  /**
   * Score alert delivery
   */
  static scoreAlerts(successCount: number, failureCount: number): number {
    const total = successCount + failureCount
    if (total === 0) return 5 // Unknown

    const successRate = successCount / total
    return Math.round(successRate * 10)
  }

  /**
   * Calculate overall confidence
   */
  static calculateOverall(scores: ConfidenceScores): number {
    return Math.round((scores.strategy + scores.backend + scores.frontend + scores.alerts) / 4)
  }
}
