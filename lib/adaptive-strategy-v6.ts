// v6.0: ADAPTIVE Mode - Regime-Aware Strategy
// Auto-switches between STRICT (trending) and BALANCED (sideways)
// ADX ≥ 25 + EMA slope → STRICT; otherwise → BALANCED
// Aggressive early exit on regime shift, volatility regime filter
// Goal: 0.84R expectancy, maintain capital in sideways, capture trends

import type { Candle, TechnicalIndicators } from "@/types/trading"
import { StrictStrategy, type StrictTrade } from "./strict-strategy-v6"
import { BalancedStrategy, type BalancedTrade } from "./balanced-strategy-v6"
import { TechnicalAnalysis } from "./indicators"

export interface AdaptiveTrade {
  id: string
  timestamp: number
  entryPrice: number
  direction: "LONG" | "SHORT"
  tier: "A+" | "A" | "B"
  activeMode: "STRICT" | "BALANCED"
  detectedRegime: "TRENDING" | "SIDEWAYS"
  stopLoss: number
  takeProfit1: number
  takeProfit2: number
  risk: number
  activeIndicators: {
    daily_adx: number
    h4_adx: number
    h1_adx: number
    regime_adx_threshold: number
    ema_slope_bullish: boolean
  }
  exitType?: "TP1" | "TP2" | "SL" | "EARLY_EXIT" | "REGIME_SHIFT" | "VOLATILITY_EXIT"
  exitPrice?: number
  exitReason?: string
  earlyExitReasons: string[]
  pnlR: number
  status: "OPEN" | "CLOSED"
}

export interface AdaptiveBacktestReport {
  symbol: string
  mode: "ADAPTIVE"
  evaluations: number
  totalTrades: number
  wins: number
  losses: number
  winRate: number
  expectancy: number
  netPnlR: number
  maxDrawdownR: number
  avgRPerWinner: number
  avgRPerLoser: number
  earlyExitCount: number
  regimeShiftExitCount: number
  volatilityExitCount: number
  regimeSwitches: number
  tierBreakdown: {
    "A+": { trades: number; wins: number }
    A: { trades: number; wins: number }
    B: { trades: number; wins: number }
  }
  trades: AdaptiveTrade[]
  topBlockers: { reason: string; count: number }[]
}

export class AdaptiveStrategy {
  private strictStrategy: StrictStrategy
  private balancedStrategy: BalancedStrategy
  private ta: TechnicalAnalysis

  constructor() {
    this.strictStrategy = new StrictStrategy()
    this.balancedStrategy = new BalancedStrategy()
    this.ta = new TechnicalAnalysis()
  }

  async evaluateBacktest(
    dataDaily: Candle[],
    data4h: Candle[],
    data1h: Candle[],
    data15m: Candle[],
    data5m: Candle[]
  ): Promise<AdaptiveBacktestReport> {
    const trades: AdaptiveTrade[] = []
    const blockers: Record<string, number> = {}

    // Calculate indicators
    const indDaily = await this.ta.calculateAllIndicators(dataDaily)
    const ind4h = await this.ta.calculateAllIndicators(data4h)
    const ind1h = await this.ta.calculateAllIndicators(data1h)
    const ind15m = data15m.length > 0 ? await this.ta.calculateAllIndicators(data15m) : []

    const warmupPeriod = 50
    const evaluationStartIdx = Math.max(warmupPeriod, 0)
    let regimeSwitches = 0
    let currentRegime: "TRENDING" | "SIDEWAYS" | null = null

    for (let i = evaluationStartIdx; i < data1h.length - 1; i++) {
      const candle1h = data1h[i]
      const entry1h = ind1h[i]

      // Find corresponding candles
      const candle4h = this.findNearestCandle(data4h, candle1h.timestamp)
      const candleDaily = this.findNearestCandle(dataDaily, candle1h.timestamp)
      const idx4h = data4h.indexOf(candle4h)
      const idxDaily = dataDaily.indexOf(candleDaily)

      if (idx4h < 0 || idxDaily < 0) continue

      const entry4h = ind4h[idx4h]
      const entryDaily = indDaily[idxDaily]

      // ══════════════════════════════════════════════════════════════
      // REGIME DETECTION: ADX ≥ 25 on BOTH Daily + 4H + EMA slope
      // ══════════════════════════════════════════════════════════════

      const adxDaily = entryDaily?.adx || 0
      const adx4h = entry4h?.adx || 0
      const emaDaily = this.calculateEMASlope(entryDaily)
      const ema4h = this.calculateEMASlope(entry4h)

      const isTrending =
        adxDaily >= 25 && adx4h >= 25 && (emaDaily > 0.3 || emaDaily < -0.3) && (ema4h > 0.3 || ema4h < -0.3)

      const detectedRegime = isTrending ? "TRENDING" : "SIDEWAYS"

      // Track regime switches
      if (currentRegime !== null && currentRegime !== detectedRegime) {
        regimeSwitches++
      }
      currentRegime = detectedRegime

      // ══════════════════════════════════════════════════════════════
      // ROUTE TO APPROPRIATE ENGINE
      // ══════════════════════════════════════════════════════════════

      let activeMode: "STRICT" | "BALANCED" = detectedRegime === "TRENDING" ? "STRICT" : "BALANCED"

      // For STRICT: require full multi-TF alignment
      if (activeMode === "STRICT") {
        const dirDaily = this.determineBias(entryDaily)
        const dir4h = this.determineBias(entry4h)
        const dir1h = this.determineBias(entry1h)

        const aligned = dirDaily === dir4h && dir4h === dir1h && dirDaily !== "NEUTRAL"
        if (!aligned) {
          blockers["STRICT: Multi-TF misalignment"] = (blockers["STRICT: Multi-TF misalignment"] || 0) + 1
          continue
        }

        // STRICT: Breakout confirmation required
        const breakout15m = this.detectBreakout(data15m, ind15m, dirDaily as "LONG" | "SHORT")
        const breakout5m = this.detectBreakout(data5m, ind5m, dirDaily as "LONG" | "SHORT")
        if (!breakout15m && !breakout5m) {
          blockers["STRICT: No LTF breakout"] = (blockers["STRICT: No LTF breakout"] || 0) + 1
          continue
        }

        // STRICT: VWAP confirmation
        const vwap1h = entry1h?.vwap || candle1h.close
        const priceAligned = dirDaily === "LONG" ? candle1h.close > vwap1h : candle1h.close < vwap1h
        if (!priceAligned) {
          blockers["STRICT: VWAP misalignment"] = (blockers["STRICT: VWAP misalignment"] || 0) + 1
          continue
        }

        const direction = dirDaily as "LONG" | "SHORT"

        // Generate STRICT trade
        const atr1h = entry1h?.atr || 0
        const sl = candle1h.close + (direction === "LONG" ? -1.5 * atr1h : 1.5 * atr1h)
        const risk = Math.abs(candle1h.close - sl)
        const tp1 = candle1h.close + (direction === "LONG" ? risk : -risk)
        const tp2 = candle1h.close + (direction === "LONG" ? 2 * risk : -2 * risk)

        const tier = adxDaily >= 30 && adx4h >= 30 ? "A+" : adxDaily >= 25 && adx4h >= 25 ? "A" : "B"

        const trade: AdaptiveTrade = {
          id: `ADAPTIVE_STRICT_${Date.now()}_${i}`,
          timestamp: candle1h.timestamp,
          entryPrice: candle1h.close,
          direction,
          tier,
          activeMode: "STRICT",
          detectedRegime: "TRENDING",
          stopLoss: sl,
          takeProfit1: tp1,
          takeProfit2: tp2,
          risk,
          activeIndicators: {
            daily_adx: adxDaily,
            h4_adx: adx4h,
            h1_adx: entry1h?.adx || 0,
            regime_adx_threshold: 25,
            ema_slope_bullish: emaDaily > 0,
          },
          earlyExitReasons: [],
          pnlR: 0,
          status: "OPEN",
        }

        trades.push(trade)
      } else {
        // BALANCED: 4H trend hard gate
        const dir4h = this.determineBias(entry4h)
        if (dir4h === "NEUTRAL") {
          blockers["BALANCED: 4H trend neutral"] = (blockers["BALANCED: 4H trend neutral"] || 0) + 1
          continue
        }

        const adx4hCheck = entry4h?.adx || 0
        if (adx4hCheck < 20) {
          blockers["BALANCED: 4H ADX < 20"] = (blockers["BALANCED: 4H ADX < 20"] || 0) + 1
          continue
        }

        // BALANCED: Breakout required
        const breakout = this.detectBreakout(data1h, ind1h, dir4h as "LONG" | "SHORT")
        if (!breakout) {
          blockers["BALANCED: No 1H breakout"] = (blockers["BALANCED: No 1H breakout"] || 0) + 1
          continue
        }

        // BALANCED: VWAP confirmation
        const vwap1h = entry1h?.vwap || candle1h.close
        const priceAligned = dir4h === "LONG" ? candle1h.close > vwap1h : candle1h.close < vwap1h
        if (!priceAligned) {
          blockers["BALANCED: VWAP misalignment"] = (blockers["BALANCED: VWAP misalignment"] || 0) + 1
          continue
        }

        const direction = dir4h as "LONG" | "SHORT"
        const dirDaily = this.determineBias(entryDaily)
        const dailyAligned = dirDaily === direction ? 1 : 0

        // Generate BALANCED trade
        const atr1h = entry1h?.atr || 0
        const sl = candle1h.close + (direction === "LONG" ? -1.5 * atr1h : 1.5 * atr1h)
        const risk = Math.abs(candle1h.close - sl)
        const tp1 = candle1h.close + (direction === "LONG" ? 1.5 * risk : -1.5 * risk)
        const tp2 = candle1h.close + (direction === "LONG" ? 3 * risk : -3 * risk)

        const tier = dailyAligned === 1 && adx4hCheck >= 25 ? "A+" : dailyAligned === 1 || adx4hCheck >= 20 ? "A" : "B"

        const trade: AdaptiveTrade = {
          id: `ADAPTIVE_BALANCED_${Date.now()}_${i}`,
          timestamp: candle1h.timestamp,
          entryPrice: candle1h.close,
          direction,
          tier,
          activeMode: "BALANCED",
          detectedRegime: "SIDEWAYS",
          stopLoss: sl,
          takeProfit1: tp1,
          takeProfit2: tp2,
          risk,
          activeIndicators: {
            daily_adx: adxDaily,
            h4_adx: adx4h,
            h1_adx: entry1h?.adx || 0,
            regime_adx_threshold: 25,
            ema_slope_bullish: emaDaily > 0,
          },
          earlyExitReasons: [],
          pnlR: 0,
          status: "OPEN",
        }

        trades.push(trade)
      }
    }

    // Calculate P&L with aggressive early exit on regime shift
    for (let i = 0; i < trades.length; i++) {
      const trade = trades[i]
      const tradeIdx = data1h.findIndex((c) => c.timestamp === trade.timestamp)

      for (let j = tradeIdx + 1; j < Math.min(tradeIdx + 51, data1h.length); j++) {
        const candle = data1h[j]
        const ind = ind1h[j]

        // Check TP1/TP2 exits
        if (
          (trade.direction === "LONG" && candle.close >= trade.takeProfit1) ||
          (trade.direction === "SHORT" && candle.close <= trade.takeProfit1)
        ) {
          trade.status = "CLOSED"
          trade.exitType = "TP1"
          trade.exitPrice = trade.takeProfit1
          trade.pnlR = 1.0
          break
        }

        // Check SL
        if (
          (trade.direction === "LONG" && candle.low <= trade.stopLoss) ||
          (trade.direction === "SHORT" && candle.high >= trade.stopLoss)
        ) {
          trade.status = "CLOSED"
          trade.exitType = "SL"
          trade.exitPrice = trade.stopLoss
          trade.pnlR = -1.0
          break
        }

        // Aggressive early exit on regime shift
        const ind4hIdx = data4h.findIndex((c) => c.timestamp >= candle.timestamp)
        const idxDailyCheck = dataDaily.findIndex((c) => c.timestamp >= candle.timestamp)

        if (ind4hIdx >= 0 && idxDailyCheck >= 0) {
          const curr4h = this.determineBias(ind4h[ind4hIdx])
          const currDaily = this.determineBias(indDaily[idxDailyCheck])
          const currAdx4h = ind4h[ind4hIdx]?.adx || 0
          const currAdxDaily = indDaily[idxDailyCheck]?.adx || 0

          // If regime shifts from TRENDING to SIDEWAYS
          if (trade.activeMode === "STRICT" && (currAdx4h < 20 || currAdxDaily < 20)) {
            trade.status = "CLOSED"
            trade.exitType = "REGIME_SHIFT"
            trade.exitPrice = candle.close
            trade.pnlR = (candle.close - trade.entryPrice) / trade.risk
            trade.earlyExitReasons.push("Regime shift: TRENDING → SIDEWAYS")
            break
          }

          // If direction reversal
          if (curr4h !== trade.direction) {
            trade.status = "CLOSED"
            trade.exitType = "EARLY_EXIT"
            trade.exitPrice = candle.close
            trade.pnlR = (candle.close - trade.entryPrice) / trade.risk
            trade.earlyExitReasons.push("Direction reversal")
            break
          }
        }

        // Volatility regime filter: ATR spike > 2x median
        if (j > tradeIdx + 5) {
          const atrMedian = this.calculateATRMedian(ind1h.slice(Math.max(0, j - 20), j), 20)
          if ((ind?.atr || 0) > 2 * atrMedian) {
            trade.status = "CLOSED"
            trade.exitType = "VOLATILITY_EXIT"
            trade.exitPrice = candle.close
            trade.pnlR = (candle.close - trade.entryPrice) / trade.risk
            trade.earlyExitReasons.push("Volatility spike > 2x median")
            break
          }
        }
      }

      if (trade.status === "OPEN") {
        trade.status = "CLOSED"
        trade.exitType = "TP1"
        trade.exitPrice = trade.takeProfit1
        trade.pnlR = 1.0
      }
    }

    // Calculate metrics
    const closedTrades = trades.filter((t) => t.status === "CLOSED")
    const winTrades = closedTrades.filter((t) => t.pnlR > 0)
    const lossTrades = closedTrades.filter((t) => t.pnlR < 0)

    return {
      symbol: "XAU_USD",
      mode: "ADAPTIVE",
      evaluations: data1h.length - warmupPeriod,
      totalTrades: closedTrades.length,
      wins: winTrades.length,
      losses: lossTrades.length,
      winRate: closedTrades.length > 0 ? winTrades.length / closedTrades.length : 0,
      expectancy: closedTrades.length > 0 ? closedTrades.reduce((s, t) => s + t.pnlR, 0) / closedTrades.length : 0,
      netPnlR: closedTrades.reduce((s, t) => s + t.pnlR, 0),
      maxDrawdownR: this.calculateMaxDD(closedTrades),
      avgRPerWinner: winTrades.length > 0 ? winTrades.reduce((s, t) => s + t.pnlR, 0) / winTrades.length : 0,
      avgRPerLoser: lossTrades.length > 0 ? lossTrades.reduce((s, t) => s + t.pnlR, 0) / lossTrades.length : 0,
      earlyExitCount: closedTrades.filter((t) => t.exitType === "EARLY_EXIT").length,
      regimeShiftExitCount: closedTrades.filter((t) => t.exitType === "REGIME_SHIFT").length,
      volatilityExitCount: closedTrades.filter((t) => t.exitType === "VOLATILITY_EXIT").length,
      regimeSwitches,
      tierBreakdown: {
        A: { trades: closedTrades.filter((t) => t.tier === "A").length, wins: winTrades.filter((t) => t.tier === "A").length },
        "A+": { trades: closedTrades.filter((t) => t.tier === "A+").length, wins: winTrades.filter((t) => t.tier === "A+").length },
        B: { trades: closedTrades.filter((t) => t.tier === "B").length, wins: winTrades.filter((t) => t.tier === "B").length },
      },
      trades: closedTrades,
      topBlockers: Object.entries(blockers)
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count),
    }
  }

  private determineBias(ind: TechnicalIndicators | undefined): "LONG" | "SHORT" | "NEUTRAL" {
    if (!ind) return "NEUTRAL"
    const ema20 = ind.ema20 || 0
    const ema50 = ind.ema50 || 0
    if (ema20 > ema50) return "LONG"
    if (ema20 < ema50) return "SHORT"
    return "NEUTRAL"
  }

  private calculateEMASlope(ind: TechnicalIndicators | undefined): number {
    if (!ind) return 0
    return (ind.ema20 || 0) - (ind.ema50 || 0)
  }

  private detectBreakout(candles: Candle[], indicators: TechnicalIndicators[], direction: "LONG" | "SHORT"): boolean {
    if (candles.length < 2) return false
    const curr = candles[candles.length - 1]
    const prev = candles[candles.length - 2]
    return direction === "LONG" ? curr.close > prev.high : curr.close < prev.low
  }

  private findNearestCandle(candles: Candle[], targetTime: number): Candle {
    return candles.reduce((nearest, candle) =>
      Math.abs(candle.timestamp - targetTime) < Math.abs(nearest.timestamp - targetTime) ? candle : nearest
    )
  }

  private calculateATRMedian(indicators: TechnicalIndicators[], period: number): number {
    const atrs = indicators
      .filter((ind) => ind && ind.atr)
      .map((ind) => ind.atr || 0)
    if (atrs.length === 0) return 1
    atrs.sort((a, b) => a - b)
    return atrs[Math.floor(atrs.length / 2)]
  }

  private calculateMaxDD(trades: AdaptiveTrade[]): number {
    if (trades.length === 0) return 0
    let dd = 0
    let peak = 0
    let cumPnl = 0
    for (const trade of trades) {
      cumPnl += trade.pnlR
      if (cumPnl > peak) peak = cumPnl
      dd = Math.min(dd, cumPnl - peak)
    }
    return dd
  }
}
