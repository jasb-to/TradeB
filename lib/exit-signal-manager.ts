import type { Signal, ActiveTrade, Candle } from "@/types/trading"

/**
 * Exit Signal Manager - SIMPLIFIED v2
 * 
 * ONLY handles HARD EXITS:
 * - Stop Loss hit
 * - Take Profit 1 hit
 * - Take Profit 2 hit
 * 
 * ALL technical exit logic removed (8/21 EMA, divergence, trend reversals, etc.)
 * Use EarlyReversalWarningSystem instead for advisory warnings.
 */
export class ExitSignalManager {
  /**
   * Check if trade should be exited (SL/TP only)
   * Returns EXIT signal only for hard stops/targets
   */
  static checkForExit(trade: ActiveTrade, currentPrice: number): Signal | null {
    // Check SL breach - ALWAYS TOP PRIORITY
    if (trade.direction === "LONG" && currentPrice <= trade.stopLoss) {
      return {
        type: "EXIT",
        direction: "NONE" as any,
        alertLevel: 3,
        confidence: 100,
        timestamp: Date.now(),
        reasons: [`STOP LOSS BREACHED: Price ${currentPrice.toFixed(2)} ≤ SL ${trade.stopLoss.toFixed(2)}`],
        indicators: {},
      }
    }

    if (trade.direction === "SHORT" && currentPrice >= trade.stopLoss) {
      return {
        type: "EXIT",
        direction: "NONE" as any,
        alertLevel: 3,
        confidence: 100,
        timestamp: Date.now(),
        reasons: [`STOP LOSS BREACHED: Price ${currentPrice.toFixed(2)} ≥ SL ${trade.stopLoss.toFixed(2)}`],
        indicators: {},
      }
    }

    // Check TP2 hit - HIGHEST PRIORITY PROFIT TARGET
    if (trade.direction === "LONG" && currentPrice >= trade.takeProfit2) {
      return {
        type: "EXIT",
        direction: "NONE" as any,
        alertLevel: 2,
        confidence: 100,
        timestamp: Date.now(),
        reasons: [`TAKE PROFIT 2 REACHED: Price ${currentPrice.toFixed(2)} ≥ TP2 ${trade.takeProfit2.toFixed(2)}`],
        indicators: {},
      }
    }

    if (trade.direction === "SHORT" && currentPrice <= trade.takeProfit2) {
      return {
        type: "EXIT",
        direction: "NONE" as any,
        alertLevel: 2,
        confidence: 100,
        timestamp: Date.now(),
        reasons: [`TAKE PROFIT 2 REACHED: Price ${currentPrice.toFixed(2)} ≤ TP2 ${trade.takeProfit2.toFixed(2)}`],
        indicators: {},
      }
    }

    // Check TP1 hit - MEDIUM PRIORITY (partial exit)
    if (trade.direction === "LONG" && currentPrice >= trade.takeProfit1 && !trade.tp1Hit) {
      return {
        type: "EXIT",
        direction: "NONE" as any,
        alertLevel: 1,
        confidence: 95,
        timestamp: Date.now(),
        reasons: [`TAKE PROFIT 1 REACHED: Price ${currentPrice.toFixed(2)} ≥ TP1 ${trade.takeProfit1.toFixed(2)}`],
        indicators: {},
      }
    }

    if (trade.direction === "SHORT" && currentPrice <= trade.takeProfit1 && !trade.tp1Hit) {
      return {
        type: "EXIT",
        direction: "NONE" as any,
        alertLevel: 1,
        confidence: 95,
        timestamp: Date.now(),
        reasons: [`TAKE PROFIT 1 REACHED: Price ${currentPrice.toFixed(2)} ≤ TP1 ${trade.takeProfit1.toFixed(2)}`],
        indicators: {},
      }
    }

    // No hard exit triggered
    return null
  }
}
