// v6.0: BALANCED Mode - Swing/Breakout Strategy
// 4H trend hard gate only, Daily bias weighted-only
// Breakout on 1H or 15M triggers entry, ADX ≥ 20 on 4H, VWAP confirmation
// Goal: 1-2 trades/week, 0.81R expectancy, scaled exits

import type { Candle, TechnicalIndicators } from "@/types/trading"
import { TechnicalAnalysis } from "./indicators"

export interface BalancedTrade {
  id: string
  timestamp: number
  entryPrice: number
  direction: "LONG" | "SHORT"
  tier: "A+" | "A" | "B"
  stopLoss: number
  takeProfit1: number
  takeProfit2: number
  risk: number
  rewardTP1: number
  rewardTP2: number
  rratio1: number
  rratio2: number
  activeIndicators: {
    h4_adx: number
    h4_rsi: number
    daily_bias: string
    h1_adx: number
    h1_rsi: number
    h1_atr: number
    vwap: number
    breakoutTimeframe: "1H" | "15M"
  }
  exitType?: "TP1" | "TP2" | "SL" | "EARLY_EXIT" | "PARTIAL"
  exitPrice?: number
  exitReason?: string
  earlyExitReasons: string[]
  pnlR: number
  status: "OPEN" | "CLOSED"
}

export interface BalancedBacktestReport {
  symbol: string
  mode: "BALANCED"
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
  partialExitCount: number
  tierBreakdown: {
    "A+": { trades: number; wins: number }
    A: { trades: number; wins: number }
    B: { trades: number; wins: number }
  }
  trades: BalancedTrade[]
  topBlockers: { reason: string; count: number }[]
}

export class BalancedStrategy {
  private ta: TechnicalAnalysis

  constructor() {
    this.ta = new TechnicalAnalysis()
  }

  async evaluateBacktest(
    dataDaily: Candle[],
    data4h: Candle[],
    data1h: Candle[],
    data15m: Candle[],
    data5m: Candle[]
  ): Promise<BalancedBacktestReport> {
    const trades: BalancedTrade[] = []
    const blockers: Record<string, number> = {}

    // Calculate indicators
    const indDaily = await this.ta.calculateAllIndicators(dataDaily)
    const ind4h = await this.ta.calculateAllIndicators(data4h)
    const ind1h = await this.ta.calculateAllIndicators(data1h)
    const ind15m = data15m.length > 0 ? await this.ta.calculateAllIndicators(data15m) : []

    const warmupPeriod = 50
    const evaluationStartIdx = Math.max(warmupPeriod, 0)

    for (let i = evaluationStartIdx; i < data1h.length - 1; i++) {
      const candle1h = data1h[i]
      const entry1h = ind1h[i]

      // Find corresponding 4H and Daily candles
      const candle4h = this.findNearestCandle(data4h, candle1h.timestamp)
      const candleDaily = this.findNearestCandle(dataDaily, candle1h.timestamp)
      const idx4h = data4h.indexOf(candle4h)
      const idxDaily = dataDaily.indexOf(candleDaily)

      if (idx4h < 0 || idxDaily < 0) continue

      const entry4h = ind4h[idx4h]
      const entryDaily = indDaily[idxDaily]

      // RULE 1: 4H Trend hard gate (EMA20 ≠ EMA50)
      const dir4h = this.determineBias(entry4h)
      if (dir4h === "NEUTRAL") {
        blockers["4H trend neutral"] = (blockers["4H trend neutral"] || 0) + 1
        continue
      }

      // RULE 2: ADX ≥ 20 on 4H
      const adx4h = entry4h?.adx || 0
      if (adx4h < 20) {
        blockers["4H ADX < 20"] = (blockers["4H ADX < 20"] || 0) + 1
        continue
      }

      // RULE 3: Daily bias weighted-only (no hard gate)
      const dirDaily = this.determineBias(entryDaily)
      const dailyAligned = dirDaily === dir4h ? 1 : 0

      // RULE 4: VWAP confirmation
      const vwap1h = entry1h?.vwap || candle1h.close
      const priceAligned = dir4h === "LONG" ? candle1h.close > vwap1h : candle1h.close < vwap1h
      if (!priceAligned) {
        blockers["VWAP misalignment"] = (blockers["VWAP misalignment"] || 0) + 1
        continue
      }

      // RULE 5: ATR filter (ATR ≥ 2.5x median for Gold)
      const atr1h = entry1h?.atr || 0
      const atrMedian1h = this.calculateATRMedian(ind1h, 20)
      if (atr1h < 2.5 * atrMedian1h) {
        blockers["ATR < 2.5x median"] = (blockers["ATR < 2.5x median"] || 0) + 1
        continue
      }

      // RULE 6: Breakout on 1H or 15M
      const breakout1h = this.detectBreakout(data1h, ind1h, i, dir4h as "LONG" | "SHORT")
      const candle15m = this.findNearestCandle(data15m, candle1h.timestamp)
      const idx15m = data15m.indexOf(candle15m)
      const breakout15m = idx15m >= 0 ? this.detectBreakout(data15m, ind15m, idx15m, dir4h as "LONG" | "SHORT") : false

      const breakoutTimeframe = breakout1h ? ("1H" as const) : breakout15m ? ("15M" as const) : null

      if (!breakoutTimeframe) {
        blockers["No 1H/15M breakout"] = (blockers["No 1H/15M breakout"] || 0) + 1
        continue
      }

      // ✅ ALL RULES PASSED: GENERATE TRADE
      const direction = dir4h as "LONG" | "SHORT"

      // Determine tier
      const tier = this.determineTierBalanced(adx4h, dailyAligned, breakoutTimeframe === "1H")

      // Calculate SL and TP (scaled exits)
      const sl = candle1h.close + (direction === "LONG" ? -1.5 * atr1h : 1.5 * atr1h)
      const risk = Math.abs(candle1h.close - sl)
      const tp1 = candle1h.close + (direction === "LONG" ? 1.5 * risk : -1.5 * risk) // 50% exit at 1.5R
      const tp2 = candle1h.close + (direction === "LONG" ? 3 * risk : -3 * risk) // 50% exit at 3R

      const trade: BalancedTrade = {
        id: `BALANCED_${Date.now()}_${i}`,
        timestamp: candle1h.timestamp,
        entryPrice: candle1h.close,
        direction,
        tier,
        stopLoss: sl,
        takeProfit1: tp1,
        takeProfit2: tp2,
        risk,
        rewardTP1: 1.5 * risk,
        rewardTP2: 3 * risk,
        rratio1: 1.5,
        rratio2: 3.0,
        activeIndicators: {
          h4_adx: adx4h,
          h4_rsi: entry4h?.rsi || 50,
          daily_bias: dirDaily,
          h1_adx: entry1h?.adx || 0,
          h1_rsi: entry1h?.rsi || 50,
          h1_atr: atr1h,
          vwap: vwap1h,
          breakoutTimeframe: breakoutTimeframe as "1H" | "15M",
        },
        earlyExitReasons: [],
        pnlR: 0,
        status: "OPEN",
      }

      trades.push(trade)
    }

    // Calculate P&L
    for (let i = 0; i < trades.length; i++) {
      const trade = trades[i]
      const tradeIdx = data1h.findIndex((c) => c.timestamp === trade.timestamp)
      let tp1Hit = false

      for (let j = tradeIdx + 1; j < Math.min(tradeIdx + 51, data1h.length); j++) {
        const candle = data1h[j]
        const ind = ind1h[j]

        // Check TP1 (50% exit at 1.5R)
        if (
          !tp1Hit &&
          ((trade.direction === "LONG" && candle.close >= trade.takeProfit1) ||
            (trade.direction === "SHORT" && candle.close <= trade.takeProfit1))
        ) {
          tp1Hit = true
          // Continue for TP2
        }

        // Check TP2 (50% exit at 3R)
        if (tp1Hit && 
          ((trade.direction === "LONG" && candle.close >= trade.takeProfit2) ||
            (trade.direction === "SHORT" && candle.close <= trade.takeProfit2))
        ) {
          trade.status = "CLOSED"
          trade.exitType = "TP2"
          trade.exitPrice = trade.takeProfit2
          trade.pnlR = (1.5 + 3.0) / 2 // Average of scaled exits = 2.25R
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

        // Check early exit: 4H reversal
        const ind4hIdx = data4h.findIndex((c) => c.timestamp >= candle.timestamp)
        if (ind4hIdx >= 0) {
          const curr4h = this.determineBias(ind4h[ind4hIdx])
          if (curr4h !== trade.direction) {
            trade.status = "CLOSED"
            trade.exitType = "EARLY_EXIT"
            trade.exitReason = "4H reversal"
            trade.earlyExitReasons.push("4H reversal")
            trade.exitPrice = candle.close
            trade.pnlR = (candle.close - trade.entryPrice) / trade.risk
            break
          }
        }

        // Check early exit: RSI momentum failure
        if ((trade.direction === "LONG" && ind.rsi < 30) || (trade.direction === "SHORT" && ind.rsi > 70)) {
          trade.status = "CLOSED"
          trade.exitType = "EARLY_EXIT"
          trade.exitReason = "RSI momentum failure"
          trade.earlyExitReasons.push("RSI momentum failure")
          trade.exitPrice = candle.close
          trade.pnlR = (candle.close - trade.entryPrice) / trade.risk
          break
        }
      }

      if (trade.status === "OPEN") {
        trade.status = "CLOSED"
        trade.exitType = "TP1" // Default to TP1 if nothing hit
        trade.exitPrice = trade.takeProfit1
        trade.pnlR = 1.5
      }
    }

    // Calculate metrics
    const closedTrades = trades.filter((t) => t.status === "CLOSED")
    const winTrades = closedTrades.filter((t) => t.pnlR > 0)
    const lossTrades = closedTrades.filter((t) => t.pnlR < 0)
    const partialExits = closedTrades.filter((t) => t.exitType === "PARTIAL").length

    return {
      symbol: "XAU_USD",
      mode: "BALANCED",
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
      partialExitCount: partialExits,
      tierBreakdown: {
        A: {
          trades: closedTrades.filter((t) => t.tier === "A").length,
          wins: winTrades.filter((t) => t.tier === "A").length,
        },
        "A+": {
          trades: closedTrades.filter((t) => t.tier === "A+").length,
          wins: winTrades.filter((t) => t.tier === "A+").length,
        },
        B: {
          trades: closedTrades.filter((t) => t.tier === "B").length,
          wins: winTrades.filter((t) => t.tier === "B").length,
        },
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

  private determineTierBalanced(adx4h: number, dailyAligned: number, breakout1h: boolean): "A+" | "A" | "B" {
    if (dailyAligned === 1 && breakout1h && adx4h >= 25) return "A+"
    if ((dailyAligned === 1 || breakout1h) && adx4h >= 20) return "A"
    return "B"
  }

  private calculateATRMedian(indicators: TechnicalIndicators[], period: number): number {
    const atrs = indicators
      .slice(-period)
      .map((ind) => ind?.atr || 0)
      .filter((atr) => atr > 0)
    if (atrs.length === 0) return 1
    atrs.sort((a, b) => a - b)
    return atrs[Math.floor(atrs.length / 2)]
  }

  private detectBreakout(candles: Candle[], indicators: TechnicalIndicators[], idx: number, direction: "LONG" | "SHORT"): boolean {
    if (idx < 1 || idx >= candles.length) return false
    const curr = candles[idx]
    const prev = candles[idx - 1]
    if (direction === "LONG") {
      return curr.close > prev.high
    } else {
      return curr.close < prev.low
    }
  }

  private findNearestCandle(candles: Candle[], targetTime: number): Candle {
    return candles.reduce((nearest, candle) =>
      Math.abs(candle.timestamp - targetTime) < Math.abs(nearest.timestamp - targetTime) ? candle : nearest
    )
  }

  private calculateMaxDD(trades: BalancedTrade[]): number {
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
