import { type Candle, type Signal, DEFAULT_TRADING_CONFIG } from "@/types/trading"
import { TradingStrategies } from "./strategies"
import { BalancedBreakoutStrategy } from "./balanced-strategy"
import { TechnicalAnalysis, type TechnicalIndicators } from "./indicators"

/**
 * REGIME_ADAPTIVE: Detects market regime (Trend/Sideways) and routes to optimal strategy
 * - Bullish/Bearish Trend (ADX >= 25 + slope up/down) → STRICT for discipline
 * - Sideways/Choppy → BALANCED for breakout trades
 */
export class RegimeAdaptiveStrategy {
  private strictEngine: TradingStrategies
  private balancedEngine: BalancedBreakoutStrategy
  private config: typeof DEFAULT_TRADING_CONFIG

  constructor(config: typeof DEFAULT_TRADING_CONFIG = DEFAULT_TRADING_CONFIG) {
    this.config = config
    this.strictEngine = new TradingStrategies(config)
    this.balancedEngine = new BalancedBreakoutStrategy(config)
  }

  public async evaluateSignals(
    dataDaily: Candle[],
    data8h: Candle[],
    data4h: Candle[],
    data1h: Candle[],
    data15m: Candle[],
    data5m: Candle[],
  ): Promise<Signal> {
    console.log("ENGINE_ACTIVE: REGIME_ADAPTIVE")

    // Detect regime from daily + 4H
    const regime = this.detectRegime(dataDaily, data4h)
    console.log(`[REGIME_ADAPTIVE] Detected regime: ${regime}`)

    // Route to appropriate engine based on regime
    if (regime === "BULLISH_TREND" || regime === "BEARISH_TREND") {
      // Strong trend → use STRICT for aligned, disciplined entries
      return await this.strictEngine.evaluateSignals(dataDaily, data8h, data4h, data1h, data15m, data5m)
    } else if (regime === "SIDEWAYS") {
      // Choppy/ranging → use BALANCED for breakout trades
      return await this.balancedEngine.evaluateSignals(dataDaily, data4h, data1h)
    }

    // Fallback to BALANCED if regime is ambiguous
    return await this.balancedEngine.evaluateSignals(dataDaily, data4h, data1h)
  }

  private detectRegime(dataDaily: Candle[], data4h: Candle[]): "BULLISH_TREND" | "BEARISH_TREND" | "SIDEWAYS" {
    // Use Daily candles as primary regime indicator
    const indDaily = TechnicalAnalysis.calculateAllIndicators(dataDaily)
    const ind4h = TechnicalAnalysis.calculateAllIndicators(data4h)

    const adxDaily = indDaily.adx || 0
    const adx4h = ind4h.adx || 0

    // Require ADX >= 25 on BOTH daily and 4H for trend confirmation
    const isTrending = adxDaily >= 25 && adx4h >= 25

    if (!isTrending) return "SIDEWAYS"

    // Determine trend direction using EMA slope
    const dailySlope = this.calculateEMASlope(dataDaily, indDaily)
    const h4Slope = this.calculateEMASlope(data4h, ind4h)

    // Strong bullish if both timeframes show positive slope
    if (dailySlope > 0.5 && h4Slope > 0.5) return "BULLISH_TREND"

    // Strong bearish if both timeframes show negative slope
    if (dailySlope < -0.5 && h4Slope < -0.5) return "BEARISH_TREND"

    // Mixed signals → sideways
    return "SIDEWAYS"
  }

  private calculateEMASlope(candles: Candle[], indicators: TechnicalIndicators): number {
    if (!candles.length || candles.length < 2) return 0
    const ema20 = indicators.ema20 || 0
    const ema50 = indicators.ema50 || 0
    // Positive slope: EMA20 > EMA50 (bullish) ; Negative: EMA20 < EMA50 (bearish)
    return ema20 - ema50
  }

  public setDataSource(source: string): void {
    this.strictEngine.setDataSource(source)
    this.balancedEngine.setDataSource(source)
  }
}
