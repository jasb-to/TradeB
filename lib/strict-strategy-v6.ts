// v6.0: STRICT Mode - High Expectancy, Low Frequency Trades
// Multi-TF alignment: Daily + 4H + 1H all aligned
// ADX ≥ 25 on 4H AND Daily, VWAP confirmation, ATR filter, breakout confirmation
// Goal: 0.85R per trade, low trade frequency

import type { Candle, TechnicalIndicators } from "@/types/trading"
import { TechnicalAnalysis } from "./indicators"

export interface StrictTrade {
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
    daily_adx: number
    daily_rsi: number
    h4_adx: number
    h4_rsi: number
    h1_adx: number
    h1_rsi: number
    h1_atr: number
    vwap: number
    breakoutConfirmed: boolean
  }
  exitType?: "TP1" | "TP2" | "SL" | "EARLY_EXIT"
  exitPrice?: number
  exitReason?: string
  earlyExitReasons: string[]
  pnlR: number
  status: "OPEN" | "CLOSED"
}

export interface StrictBacktestReport {
  symbol: string
  mode: "STRICT"
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
  tierBreakdown: {
    "A+": { trades: number; wins: number }
    A: { trades: number; wins: number }
    B: { trades: number; wins: number }
  }
  trades: StrictTrade[]
  topBlockers: { reason: string; count: number }[]
}

export class StrictStrategy {
  private ta: TechnicalAnalysis

  constructor() {
    this.ta = new TechnicalAnalysis()
  }

  /**
   * Evaluate STRICT mode: Multi-TF alignment required
   * Returns list of trade opportunities with tier assignment
   */
  async evaluateBacktest(
    dataDaily: Candle[],
    data4h: Candle[],
    data1h: Candle[],
    data15m: Candle[],
    data5m: Candle[]
  ): Promise<StrictBacktestReport> {
    const trades: StrictTrade[] = []
    const blockers: Record<string, number> = {}

    // Calculate indicators for each timeframe
    const indDaily = await this.ta.calculateAllIndicators(dataDaily)
    const ind4h = await this.ta.calculateAllIndicators(data4h)
    const ind1h = await this.ta.calculateAllIndicators(data1h)
    const ind15m = data15m.length > 0 ? await this.ta.calculateAllIndicators(data15m) : []
    const ind5m = data5m.length > 0 ? await this.ta.calculateAllIndicators(data5m) : []

    const warmupPeriod = 50
    const evaluationStartIdx = Math.max(warmupPeriod, 0)

    // Align data indices using timestamps
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

      // RULE 1: ADX ≥ 25 on BOTH Daily AND 4H
      const adxDaily = entryDaily?.adx || 0
      const adx4h = entry4h?.adx || 0

      if (adxDaily < 25 || adx4h < 25) {
        blockers["ADX < 25 on Daily or 4H"] = (blockers["ADX < 25 on Daily or 4H"] || 0) + 1
        continue
      }

      // RULE 2: Multi-TF alignment (Daily + 4H + 1H all aligned)
      const dirDaily = this.determineBias(entryDaily)
      const dir4h = this.determineBias(entry4h)
      const dir1h = this.determineBias(entry1h)

      const aligned = dirDaily === dir4h && dir4h === dir1h && dirDaily !== "NEUTRAL"
      if (!aligned) {
        blockers["Multi-TF misalignment"] = (blockers["Multi-TF misalignment"] || 0) + 1
        continue
      }

      const direction = dirDaily as "LONG" | "SHORT"

      // RULE 3: VWAP confirmation
      const vwap1h = entry1h?.vwap || candle1h.close
      const priceAligned =
        direction === "LONG" ? candle1h.close > vwap1h : candle1h.close < vwap1h
      if (!priceAligned) {
        blockers["VWAP misalignment"] = (blockers["VWAP misalignment"] || 0) + 1
        continue
      }

      // RULE 4: ATR filter (ATR ≥ 2.5x 1H median)
      const atr1h = entry1h?.atr || 0
      const atrMedian1h = this.calculateATRMedian(ind1h, 20)
      if (atr1h < 2.5 * atrMedian1h) {
        blockers["ATR < 2.5x median"] = (blockers["ATR < 2.5x median"] || 0) + 1
        continue
      }

      // RULE 5: Breakout confirmation on LTF (15M or 5M)
      const breakout15m = this.detectBreakout(data15m, ind15m, direction)
      const breakout5m = this.detectBreakout(data5m, ind5m, direction)
      const breakoutConfirmed = breakout15m || breakout5m

      if (!breakoutConfirmed) {
        blockers["No LTF breakout"] = (blockers["No LTF breakout"] || 0) + 1
        continue
      }

      // ✅ ALL RULES PASSED: GENERATE TRADE

      // Determine tier
      const tier = this.determineTierStrict(
        dirDaily,
        dir4h,
        dir1h,
        adxDaily,
        adx4h,
        breakoutConfirmed
      )

      // Calculate SL and TP
      const sl = candle1h.close + (direction === "LONG" ? -1.5 * atr1h : 1.5 * atr1h)
      const risk = Math.abs(candle1h.close - sl)
      const tp1 = candle1h.close + (direction === "LONG" ? 1 * risk : -1 * risk)
      const tp2 = candle1h.close + (direction === "LONG" ? 2 * risk : -2 * risk)

      const trade: StrictTrade = {
        id: `STRICT_${Date.now()}_${i}`,
        timestamp: candle1h.timestamp,
        entryPrice: candle1h.close,
        direction,
        tier,
        stopLoss: sl,
        takeProfit1: tp1,
        takeProfit2: tp2,
        risk,
        rewardTP1: risk,
        rewardTP2: 2 * risk,
        rratio1: 1.0,
        rratio2: 2.0,
        activeIndicators: {
          daily_adx: adxDaily,
          daily_rsi: entryDaily?.rsi || 50,
          h4_adx: adx4h,
          h4_rsi: entry4h?.rsi || 50,
          h1_adx: entry1h?.adx || 0,
          h1_rsi: entry1h?.rsi || 50,
          h1_atr: atr1h,
          vwap: vwap1h,
          breakoutConfirmed,
        },
        earlyExitReasons: [],
        pnlR: 0,
        status: "OPEN",
      }

      trades.push(trade)
    }

    // Calculate P&L for closed trades (next N candles)
    for (let i = 0; i < trades.length; i++) {
      const trade = trades[i]
      const tradeIdx = data1h.findIndex((c) => c.timestamp === trade.timestamp)

      // Look ahead 50 candles for exit
      for (let j = tradeIdx + 1; j < Math.min(tradeIdx + 51, data1h.length); j++) {
        const candle = data1h[j]
        const ind = ind1h[j]

        // Check TP1 exit
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

        // Check TP2 exit
        if (
          (trade.direction === "LONG" && candle.close >= trade.takeProfit2) ||
          (trade.direction === "SHORT" && candle.close <= trade.takeProfit2)
        ) {
          trade.status = "CLOSED"
          trade.exitType = "TP2"
          trade.exitPrice = trade.takeProfit2
          trade.pnlR = 2.0
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
            trade.earlyExitReasons.push("4H reversal detected")
            trade.exitPrice = candle.close
            trade.pnlR = (candle.close - trade.entryPrice) / trade.risk
            trade.pnlR = trade.direction === "LONG" ? trade.pnlR : -trade.pnlR
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
          trade.pnlR = trade.direction === "LONG" ? trade.pnlR : -trade.pnlR
          break
        }
      }
    }

    // Calculate report metrics
    const closedTrades = trades.filter((t) => t.status === "CLOSED")
    const winTrades = closedTrades.filter((t) => t.pnlR > 0)
    const lossTrades = closedTrades.filter((t) => t.pnlR < 0)
    const netPnlR = closedTrades.reduce((sum, t) => sum + t.pnlR, 0)
    const earlyExitCount = closedTrades.filter((t) => t.exitType === "EARLY_EXIT").length

    return {
      symbol: "XAU_USD",
      mode: "STRICT",
      evaluations: data1h.length - warmupPeriod,
      totalTrades: closedTrades.length,
      wins: winTrades.length,
      losses: lossTrades.length,
      winRate: closedTrades.length > 0 ? winTrades.length / closedTrades.length : 0,
      expectancy:
        closedTrades.length > 0
          ? closedTrades.reduce((sum, t) => sum + t.pnlR, 0) / closedTrades.length
          : 0,
      netPnlR,
      maxDrawdownR: this.calculateMaxDD(closedTrades),
      avgRPerWinner: winTrades.length > 0 ? winTrades.reduce((sum, t) => sum + t.pnlR, 0) / winTrades.length : 0,
      avgRPerLoser: lossTrades.length > 0 ? lossTrades.reduce((sum, t) => sum + t.pnlR, 0) / lossTrades.length : 0,
      earlyExitCount,
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

  private determineTierStrict(
    dirDaily: string,
    dir4h: string,
    dir1h: string,
    adxDaily: number,
    adx4h: number,
    breakout: boolean
  ): "A+" | "A" | "B" {
    if (adxDaily >= 30 && adx4h >= 30 && breakout) return "A+"
    if (adxDaily >= 25 && adx4h >= 25) return "A"
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

  private detectBreakout(candles: Candle[], indicators: TechnicalIndicators[], direction: string): boolean {
    if (candles.length < 2 || indicators.length < 2) return false
    const lastCandle = candles[candles.length - 1]
    const prevCandle = candles[candles.length - 2]

    if (direction === "LONG") {
      return lastCandle.close > prevCandle.high
    } else {
      return lastCandle.close < prevCandle.low
    }
  }

  private findNearestCandle(candles: Candle[], targetTime: number): Candle {
    return candles.reduce((nearest, candle) =>
      Math.abs(candle.timestamp - targetTime) < Math.abs(nearest.timestamp - targetTime) ? candle : nearest
    )
  }

  private calculateMaxDD(trades: StrictTrade[]): number {
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
