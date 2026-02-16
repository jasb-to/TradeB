/**
 * BALANCED_BREAKOUT Strategy Engine
 * 
 * Separate evaluation path from STRICT mode.
 * Designed for 1-2 swing trades per week, 1-2 day holds.
 * CACHE BUST v3.1: Force Turbopack recompile - all indicators now use calculateAllIndicators only
 * 
 * Timeframe Stack:
 *   Bias: Daily (weighted, NOT blocking)
 *   Trend confirmation: 4H (required)
 *   Execution: 1H
 * 
 * Key difference from STRICT:
 *   - No HTF polarity blocking
 *   - No daily alignment blocking  
 *   - Only 4H trend is a hard gate
 *   - Daily adds score weight only
 *   - Breakout-based entries (20-bar high/low)
 *   - Partial TP model (50% at 1.5R, trail remainder)
 */

import type { Candle, Signal, TechnicalIndicators, TradingConfig } from "../types/trading"
import { TechnicalAnalysis } from "./indicators"

export type StrategyMode = "STRICT" | "BALANCED"

export class BalancedBreakoutStrategy {
  private config: TradingConfig
  private dataSource = "OANDA"

  constructor(config: TradingConfig) {
    this.config = config
  }

  setDataSource(source: string) {
    this.dataSource = source
  }

  public async evaluateSignals(
    dataDaily: Candle[],
    data4h: Candle[],
    data1h: Candle[],
  ): Promise<Signal> {
    console.log("ENGINE_ACTIVE: BALANCED - v3.2 CLEAN BUILD")
    console.log("BALANCED_VERSION: calculateAllIndicators GUARANTEED ACTIVE - NO_CALL_TO_calculateAll")

    // Calculate indicators for the three timeframes we use
    const indDaily = this.calculateIndicators(dataDaily, "daily")
    const ind4h = this.calculateIndicators(data4h, "4h")
    const ind1h = this.calculateIndicators(data1h, "1h")

    const currentPrice = data1h[data1h.length - 1]?.close || 0
    const adx1h = ind1h.adx || 0
    const atr1h = ind1h.atr || 0
    const vwap1h = ind1h.vwap || 0

    // ── STEP 1: 4H TREND CONFIRMATION (HARD GATE) ──────────────────
    const ema20_4h = ind4h.ema20 || 0
    const ema50_4h = ind4h.ema50 || 0
    const trend4h = ema20_4h > ema50_4h ? "LONG" : ema20_4h < ema50_4h ? "SHORT" : "NEUTRAL"

    if (trend4h === "NEUTRAL") {
      return this.noTradeSignal(currentPrice, data1h, ind1h, "4H trend neutral (EMA20 ~ EMA50) - no directional bias")
    }

    // ── STEP 2: 1H BREAKOUT DETECTION ──────────────────────────────
    const breakoutDirection = this.detectBreakout(data1h, trend4h)

    if (!breakoutDirection) {
      return this.noTradeSignal(currentPrice, data1h, ind1h, 
        `Awaiting 1H breakout in ${trend4h} direction (4H EMA20 ${trend4h === "LONG" ? ">" : "<"} EMA50)`)
    }

    // ── STEP 3: ADX FILTER (1H >= 20) ──────────────────────────────
    if (adx1h < 20) {
      return this.noTradeSignal(currentPrice, data1h, ind1h, 
        `ADX too low: ${adx1h.toFixed(1)} < 20 (breakout detected but no momentum)`)
    }

    // ── STEP 4: ATR FILTER ─────────────────────────────────────────
    // Use existing ATR threshold - must show adequate volatility
    const atrThreshold = currentPrice > 1000 ? 5.0 : 0.15 // Gold vs GBP/JPY
    if (atr1h < atrThreshold) {
      return this.noTradeSignal(currentPrice, data1h, ind1h, 
        `ATR too low: ${atr1h.toFixed(2)} < ${atrThreshold} (insufficient volatility)`)
    }

    // ── STEP 5: VWAP CONFIRMATION ──────────────────────────────────
    const vwapOk = (breakoutDirection === "LONG" && currentPrice > vwap1h) || 
                   (breakoutDirection === "SHORT" && currentPrice < vwap1h)
    if (!vwapOk) {
      return this.noTradeSignal(currentPrice, data1h, ind1h, 
        `VWAP not supporting ${breakoutDirection}: price ${currentPrice.toFixed(2)} vs VWAP ${vwap1h.toFixed(2)}`)
    }

    // ── STEP 6: DAILY BIAS WEIGHTING (score only, NOT blocking) ───
    const dailyBias = this.determineBias(dataDaily, indDaily)
    let score = 5 // Base score for passing all hard filters
    if (dailyBias === breakoutDirection) {
      score += 1 // Daily alignment bonus
    }
    // Daily opposing does NOT block, just no bonus

    // ── STEP 7: SCORING ────────────────────────────────────────────
    // ADX strength bonus
    if (adx1h >= 30) score += 2
    else if (adx1h >= 25) score += 1.5
    else if (adx1h >= 20) score += 1

    // ATR strength bonus  
    const atrMultiple = atr1h / atrThreshold
    if (atrMultiple >= 2.0) score += 1

    // ── STEP 8: CALCULATE STOPS & TARGETS ──────────────────────────
    // Stop Loss: ATR-based (same as STRICT)
    const stopLoss = breakoutDirection === "LONG" 
      ? currentPrice - atr1h * 1.5 
      : currentPrice + atr1h * 1.5

    const riskAmount = Math.abs(currentPrice - stopLoss)

    // TP1: 1.5R (partial close 50%)
    const tp1 = breakoutDirection === "LONG"
      ? currentPrice + riskAmount * 1.5
      : currentPrice - riskAmount * 1.5

    // TP2: Trail using 1H Chandelier Stop (remaining 50%)
    const chandelierStop = TechnicalAnalysis.calculateChandelierStop(data1h, 22, 3)
    const tp2 = breakoutDirection === "LONG" ? chandelierStop.long : chandelierStop.short
    
    // Use the better of chandelier or 3R as TP2
    const tp2_3r = breakoutDirection === "LONG"
      ? currentPrice + riskAmount * 3.0
      : currentPrice - riskAmount * 3.0
    const finalTP2 = breakoutDirection === "LONG" 
      ? Math.max(tp2, tp2_3r) 
      : Math.min(tp2, tp2_3r)

    const riskReward = riskAmount > 0 ? Math.abs(finalTP2 - currentPrice) / riskAmount : 0

    // Determine tier
    const tier = score >= 8 ? "A+" : score >= 6.5 ? "A" : "B"

    console.log(`[BALANCED] ENTRY: ${breakoutDirection} ${tier} @ ${currentPrice.toFixed(2)} | Score ${score}/9 | ADX ${adx1h.toFixed(1)} | Daily ${dailyBias} | 4H ${trend4h}`)

    return {
      type: "ENTRY",
      direction: breakoutDirection,
      alertLevel: tier === "A+" ? 3 : tier === "A" ? 2 : 1,
      confidence: tier === "A+" ? 90 : tier === "A" ? 75 : 65,
      entryPrice: currentPrice,
      stopLoss,
      takeProfit1: tp1,
      takeProfit2: tier === "B" ? undefined : finalTP2, // B-tier: hard TP1 only
      takeProfit: tier === "B" ? tp1 : finalTP2,
      riskReward,
      htfTrend: trend4h,
      structuralTier: tier,
      strategy: "BALANCED_BREAKOUT",
      strategyMode: "BALANCED",
      reasons: [
        `4H Trend: ${trend4h} (EMA20 ${trend4h === "LONG" ? ">" : "<"} EMA50)`,
        `1H Breakout: ${breakoutDirection} (20-bar ${breakoutDirection === "LONG" ? "high" : "low"} broken)`,
        `ADX: ${adx1h.toFixed(1)} (momentum confirmed)`,
        `VWAP: Price ${vwapOk ? "confirmed" : "rejected"}`,
        `Daily bias: ${dailyBias} (${dailyBias === breakoutDirection ? "+1 score" : "no bonus, not blocking"})`,
        `Score: ${score}/9 | Tier: ${tier}`,
        tier === "B" 
          ? `Exit: Hard TP1 at 1.5R (${tp1.toFixed(2)})` 
          : `Exit: 50% at 1.5R (${tp1.toFixed(2)}), trail remaining via Chandelier`,
        `R:R ${riskReward.toFixed(2)}:1 | SL: ${stopLoss.toFixed(2)}`,
      ],
      indicators: {
        adx: adx1h,
        rsi: ind1h.rsi || 50,
        stochRSI: ind1h.stochRSI || 50,
        atr: atr1h,
        vwap: vwap1h,
        ema20: ind1h.ema20 || 0,
        ema50: ind1h.ema50 || 0,
        ema200: ind1h.ema200 || 0,
      },
      lastCandle: {
        close: currentPrice,
        timestamp: data1h[data1h.length - 1]?.timestamp || Date.now(),
      },
      mtfBias: {
        daily: dailyBias,
        "4h": trend4h,
        "1h": this.determineBias(data1h, ind1h),
      } as any,
      timestamp: Date.now(),
    }
  }

  /**
   * Detect 1H breakout: close breaks above/below 20-bar high/low
   * Only fires in the direction of 4H trend
   */
  private detectBreakout(data1h: Candle[], trend4h: "LONG" | "SHORT"): "LONG" | "SHORT" | null {
    if (data1h.length < 21) return null

    const currentCandle = data1h[data1h.length - 1]
    const lookback = data1h.slice(-21, -1) // Previous 20 bars (excluding current)

    const high20 = Math.max(...lookback.map(c => c.high))
    const low20 = Math.min(...lookback.map(c => c.low))

    // LONG breakout: 1H close above 20-bar high, aligned with 4H bullish
    if (trend4h === "LONG" && currentCandle.close > high20) {
      console.log(`[BALANCED] Breakout LONG: Close ${currentCandle.close.toFixed(2)} > 20-bar high ${high20.toFixed(2)}`)
      return "LONG"
    }

    // SHORT breakout: 1H close below 20-bar low, aligned with 4H bearish
    if (trend4h === "SHORT" && currentCandle.close < low20) {
      console.log(`[BALANCED] Breakout SHORT: Close ${currentCandle.close.toFixed(2)} < 20-bar low ${low20.toFixed(2)}`)
      return "SHORT"
    }

    return null
  }

  private determineBias(candles: Candle[], indicators: TechnicalIndicators): "LONG" | "SHORT" | "NEUTRAL" {
    if (!candles.length) return "NEUTRAL"
    const close = candles[candles.length - 1].close
    const ema20 = indicators.ema20 || 0
    const ema50 = indicators.ema50 || 0
    const rsi = indicators.rsi || 50

    if (close > ema20 && ema20 > ema50 && rsi > 50) return "LONG"
    if (close < ema20 && ema20 < ema50 && rsi < 50) return "SHORT"
    return "NEUTRAL"
  }

  private calculateIndicators(candles: Candle[], label: string): TechnicalIndicators {
    if (!candles.length || candles.length < 14) return {} as TechnicalIndicators
    return TechnicalAnalysis.calculateAllIndicators(candles)
  }

  private noTradeSignal(price: number, data1h: Candle[], ind1h: TechnicalIndicators, reason: string, blockedBy: string[] = []): Signal {
    // Derive blockedBy from reason if not explicitly provided
    const gates = blockedBy.length > 0 ? blockedBy : [this.reasonToGateKey(reason)]
    console.log(`[BALANCED] NO_TRADE blockedBy=[${gates.join(",")}] reason=${reason}`)
    return {
      type: "NO_TRADE",
      direction: "NONE",
      alertLevel: 0,
      confidence: 0,
      strategyMode: "BALANCED",
      strategy: "BALANCED_BREAKOUT",
      structuralTier: "NO_TRADE",
      blockedBy: gates,
      lastCandle: {
        close: price,
        timestamp: data1h[data1h.length - 1]?.timestamp || Date.now(),
      },
      reasons: [reason],
      timestamp: Date.now(),
      indicators: {
        adx: ind1h.adx || 0,
        atr: ind1h.atr || 0,
        rsi: ind1h.rsi || 50,
        stochRSI: ind1h.stochRSI || 50,
        vwap: ind1h.vwap || 0,
        ema20: ind1h.ema20 || 0,
        ema50: ind1h.ema50 || 0,
        ema200: ind1h.ema200 || 0,
      },
    }
  }

  private reasonToGateKey(reason: string): string {
    if (reason.includes("4H trend neutral")) return "4h_trend"
    if (reason.includes("breakout")) return "1h_breakout"
    if (reason.includes("ADX")) return "adx_filter"
    if (reason.includes("ATR")) return "atr_filter"
    if (reason.includes("VWAP")) return "vwap_confirmation"
    return "unknown"
  }
}
