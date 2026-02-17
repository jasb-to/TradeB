import type { Signal, ActiveTrade, Candle } from "@/types/trading"

/**
 * Exit Signal Manager - 3-Tier Dynamic Exit Engine
 * 
 * Tier 1 - Structural Failure (Hard Exit)
 * Tier 2 - Momentum Failure (Soft Exit / Reduce Risk)
 * Tier 3 - Volatility Regime Shift
 */
export class ExitSignalManager {
  /**
   * Check if trade should be exited
   * Returns EXIT signal with tier information
   */
  static checkForExit(trade: ActiveTrade, currentPrice: number, indicators: any): Signal | null {
    // Check SL/TP first (hard exits)
    const hardExit = this.checkHardExits(trade, currentPrice)
    if (hardExit) return hardExit

    // Check structural failure
    const structuralExit = this.checkStructuralFailure(trade, currentPrice, indicators)
    if (structuralExit) return structuralExit

    // Check momentum failure
    const momentumExit = this.checkMomentumFailure(trade, currentPrice, indicators)
    if (momentumExit) return momentumExit

    // Check volatility regime shift
    const volatilityExit = this.checkVolatilityShift(trade, currentPrice, indicators)
    if (volatilityExit) return volatilityExit

    return null
  }

  /**
   * Check for hard exits (SL/TP hits)
   */
  private static checkHardExits(trade: ActiveTrade, currentPrice: number): Signal | null {
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
        strategy: "EXIT_SIGNAL_MANAGER",
        structuralTier: "SL_HIT",
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
        strategy: "EXIT_SIGNAL_MANAGER",
        structuralTier: "SL_HIT",
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
        strategy: "EXIT_SIGNAL_MANAGER",
        structuralTier: "TP2_HIT",
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
        strategy: "EXIT_SIGNAL_MANAGER",
        structuralTier: "TP2_HIT",
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
        strategy: "EXIT_SIGNAL_MANAGER",
        structuralTier: "TP1_HIT",
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
        strategy: "EXIT_SIGNAL_MANAGER",
        structuralTier: "TP1_HIT",
      }
    }

    return null
  }

  /**
   * Check for structural failure (Tier 1)
   * Long: 4H close below 50 EMA AND below prior swing low
   * Short: 4H close above 50 EMA AND above prior swing high
   */
  private static checkStructuralFailure(trade: ActiveTrade, currentPrice: number, indicators: any): Signal | null {
    if (!indicators || !indicators["4h"]) return null

    const fourHourData = indicators["4h"]
    const current4hClose = fourHourData[fourHourData.length - 1]?.close || 0
    const ema50_4h = fourHourData[fourHourData.length - 1]?.ema50 || 0
    const priorSwingLow = this.getPriorSwingLow(fourHourData)
    const priorSwingHigh = this.getPriorSwingHigh(fourHourData)

    if (trade.direction === "LONG") {
      if (current4hClose < ema50_4h && currentPrice < priorSwingLow) {
        return {
          type: "EXIT",
          direction: "NONE" as any,
          alertLevel: 3,
          confidence: 90,
          timestamp: Date.now(),
          reasons: [
            `STRUCTURAL FAILURE: 4H close ${current4hClose.toFixed(2)} < 50 EMA ${ema50_4h.toFixed(2)}`,
            `AND price ${currentPrice.toFixed(2)} < prior swing low ${priorSwingLow.toFixed(2)}`
          ],
          indicators: {},
          strategy: "EXIT_SIGNAL_MANAGER",
          structuralTier: "STRUCTURAL_FAILURE",
        }
      }
    } else if (trade.direction === "SHORT") {
      if (current4hClose > ema50_4h && currentPrice > priorSwingHigh) {
        return {
          type: "EXIT",
          direction: "NONE" as any,
          alertLevel: 3,
          confidence: 90,
          timestamp: Date.now(),
          reasons: [
            `STRUCTURAL FAILURE: 4H close ${current4hClose.toFixed(2)} > 50 EMA ${ema50_4h.toFixed(2)}`,
            `AND price ${currentPrice.toFixed(2)} > prior swing high ${priorSwingHigh.toFixed(2)}`
          ],
          indicators: {},
          strategy: "EXIT_SIGNAL_MANAGER",
          structuralTier: "STRUCTURAL_FAILURE",
        }
      }
    }

    return null
  }

  /**
   * Check for momentum failure (Tier 2)
   * Long: RSI(14) crosses below 45 AFTER trade was > +1R
   * Short: RSI(14) crosses above 55 AFTER trade was > +1R
   * Action: Move stop to break-even, do NOT full exit unless also structural failure
   */
  private static checkMomentumFailure(trade: ActiveTrade, currentPrice: number, indicators: any): Signal | null {
    if (!indicators || !indicators["1h"]) return null

    const oneHourData = indicators["1h"]
    const currentRSI = oneHourData.rsi || 50
    const unrealizedR = this.calculateUnrealizedR(trade, currentPrice)

    if (trade.direction === "LONG") {
      if (unrealizedR > 1.0 && currentRSI < 45) {
        return {
          type: "EXIT",
          direction: "NONE" as any,
          alertLevel: 2,
          confidence: 75,
          timestamp: Date.now(),
          reasons: [
            `MOMENTUM FAILURE: RSI(14) ${currentRSI.toFixed(1)} < 45 after trade > +1R`,
            `Unrealized R: ${unrealizedR.toFixed(2)}`
          ],
          indicators: {},
          strategy: "EXIT_SIGNAL_MANAGER",
          structuralTier: "MOMENTUM_FAILURE",
        }
      }
    } else if (trade.direction === "SHORT") {
      if (unrealizedR > 1.0 && currentRSI > 55) {
        return {
          type: "EXIT",
          direction: "NONE" as any,
          alertLevel: 2,
          confidence: 75,
          timestamp: Date.now(),
          reasons: [
            `MOMENTUM FAILURE: RSI(14) ${currentRSI.toFixed(1)} > 55 after trade > +1R`,
            `Unrealized R: ${unrealizedR.toFixed(2)}`
          ],
          indicators: {},
          strategy: "EXIT_SIGNAL_MANAGER",
          structuralTier: "MOMENTUM_FAILURE",
        }
      }
    }

    return null
  }

  /**
   * Check for volatility regime shift (Tier 3)
   * ATR < 30% of 6M median → tighten trailing stop
   * ATR > 2x median + strong opposite candle → partial exit (50%)
   */
  private static checkVolatilityShift(trade: ActiveTrade, currentPrice: number, indicators: any): Signal | null {
    if (!indicators || !indicators["1h"]) return null

    const oneHourData = indicators["1h"]
    const currentATR = oneHourData.atr || 0
    const medianATR = this.calculateMedianATR(oneHourData)
    const strongOppositeCandle = this.detectStrongOppositeCandle(trade, oneHourData)

    if (currentATR < 0.3 * medianATR) {
      return {
        type: "EXIT",
        direction: "NONE" as any,
        alertLevel: 1,
        confidence: 60,
        timestamp: Date.now(),
        reasons: [
          `VOLATILITY SHIFT: ATR ${currentATR.toFixed(4)} < 30% of 6M median ${medianATR.toFixed(4)}`,
          `Consider tightening trailing stop`
        ],
        indicators: {},
        strategy: "EXIT_SIGNAL_MANAGER",
        structuralTier: "VOLATILITY_SHIFT",
      }
    }

    if (currentATR > 2 * medianATR && strongOppositeCandle) {
      return {
        type: "EXIT",
        direction: "NONE" as any,
        alertLevel: 2,
        confidence: 70,
        timestamp: Date.now(),
        reasons: [
          `VOLATILITY SHIFT: ATR ${currentATR.toFixed(4)} > 2x median ${medianATR.toFixed(4)}`,
          `Strong opposite candle detected - consider partial exit (50%)`
        ],
        indicators: {},
        strategy: "EXIT_SIGNAL_MANAGER",
        structuralTier: "VOLATILITY_SHIFT",
      } as ExitSignal
    }

    return null
  }

  private static getPriorSwingLow(data: any[]): number {
    // Simple implementation - find lowest low in last 20 bars
    const lookback = data.slice(-20, -1)
    return Math.min(...lookback.map((c: any) => c.low))
  }

  private static getPriorSwingHigh(data: any[]): number {
    // Simple implementation - find highest high in last 20 bars
    const lookback = data.slice(-20, -1)
    return Math.max(...lookback.map((c: any) => c.high))
  }

  private static calculateUnrealizedR(trade: ActiveTrade, currentPrice: number): number {
    const entryPrice = trade.entryPrice
    const stopLoss = trade.stopLoss
    const riskAmount = Math.abs(entryPrice - stopLoss)

    if (trade.direction === "LONG") {
      return (currentPrice - entryPrice) / riskAmount
    } else {
      return (entryPrice - currentPrice) / riskAmount
    }
  }

  private static calculateMedianATR(data: any[]): number {
    // Simple median calculation for last 20 ATR values
    const atrValues = data.slice(-20).map((c: any) => c.atr).filter((v: number) => v > 0)
    if (atrValues.length === 0) return 0.01
    atrValues.sort((a: number, b: number) => a - b)
    const mid = Math.floor(atrValues.length / 2)
    return atrValues.length % 2 !== 0 ? atrValues[mid] : (atrValues[mid - 1] + atrValues[mid]) / 2
  }

  private static detectStrongOppositeCandle(trade: ActiveTrade, data: any[]): boolean {
    const currentCandle = data[data.length - 1]
    const previousCandle = data[data.length - 2]

    if (!currentCandle || !previousCandle) return false

    if (trade.direction === "LONG") {
      // Look for strong bearish candle
      return currentCandle.close < previousCandle.close && 
             currentCandle.close < currentCandle.open &&
             Math.abs(currentCandle.close - currentCandle.open) > 0.5 * currentCandle.atr
    } else {
      // Look for strong bullish candle
      return currentCandle.close > previousCandle.close && 
             currentCandle.close > currentCandle.open &&
             Math.abs(currentCandle.close - currentCandle.open) > 0.5 * currentCandle.atr
    }
  }
}