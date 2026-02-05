import type { Candle, Signal, ActiveTrade } from "@/types/trading"
import { TechnicalAnalysis } from "./indicators"
import { MarketStateMonitor } from "./market-state-monitor"

export interface ExitSignal extends Signal {
  exitReason: string
  urgency: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
  priceTarget?: number
  stopLossBreached?: boolean
  profitTaken?: number
}

export interface TradeRiskAssessment {
  tradeId: string
  currentPrice: number
  riskStatus: "SAFE" | "CAUTION" | "WARNING" | "CRITICAL"
  pnlPercent: number
  distanceToSL: number
  distanceToSLPercent: number
  distanceToTP1: number
  distanceToTP1Percent: number
  distanceToTP2: number
  distanceToTP2Percent: number
  timeInTrade: number // milliseconds
  marketAlignment: "ALIGNED" | "NEUTRAL" | "MISALIGNED"
  recommendation: string
}

export class ExitSignalManager {
  /**
   * Generate exit signal for active trade based on market conditions
   */
  static evaluateExitForTrade(
    trade: ActiveTrade,
    currentPrice: number,
    candles1h: Candle[],
    candles15m: Candle[],
    candles5m: Candle[],
  ): ExitSignal | null {
    // Check for SL breach - ALWAYS PRIORITY
    if (trade.direction === "LONG" && currentPrice <= trade.stopLoss) {
      return {
        type: "EXIT",
        direction: "EXIT" as any,
        alertLevel: 3,
        confidence: 100,
        timestamp: Date.now(),
        exitReason: `STOP LOSS BREACHED: Price ${currentPrice.toFixed(2)} <= SL ${trade.stopLoss.toFixed(2)}`,
        urgency: "CRITICAL",
        stopLossBreached: true,
        reasons: ["Stop loss level breached - immediate exit required"],
        indicators: {},
      }
    }

    if (trade.direction === "SHORT" && currentPrice >= trade.stopLoss) {
      return {
        type: "EXIT",
        direction: "EXIT" as any,
        alertLevel: 3,
        confidence: 100,
        timestamp: Date.now(),
        exitReason: `STOP LOSS BREACHED: Price ${currentPrice.toFixed(2)} >= SL ${trade.stopLoss.toFixed(2)}`,
        urgency: "CRITICAL",
        stopLossBreached: true,
        reasons: ["Stop loss level breached - immediate exit required"],
        indicators: {},
      }
    }

    // Check for TP2 hit
    if (trade.direction === "LONG" && currentPrice >= trade.takeProfit2) {
      return {
        type: "EXIT",
        direction: "EXIT" as any,
        alertLevel: 2,
        confidence: 100,
        timestamp: Date.now(),
        exitReason: `TAKE PROFIT 2 REACHED: Price ${currentPrice.toFixed(2)} >= TP2 ${trade.takeProfit2.toFixed(2)}`,
        urgency: "HIGH",
        priceTarget: trade.takeProfit2,
        profitTaken: currentPrice - trade.entryPrice,
        reasons: ["Take profit 2 target hit - exit with full profit"],
        indicators: {},
      }
    }

    if (trade.direction === "SHORT" && currentPrice <= trade.takeProfit2) {
      return {
        type: "EXIT",
        direction: "EXIT" as any,
        alertLevel: 2,
        confidence: 100,
        timestamp: Date.now(),
        exitReason: `TAKE PROFIT 2 REACHED: Price ${currentPrice.toFixed(2)} <= TP2 ${trade.takeProfit2.toFixed(2)}`,
        urgency: "HIGH",
        priceTarget: trade.takeProfit2,
        profitTaken: trade.entryPrice - currentPrice,
        reasons: ["Take profit 2 target hit - exit with full profit"],
        indicators: {},
      }
    }

    // Check for TP1 hit
    if (trade.direction === "LONG" && currentPrice >= trade.takeProfit1 && !trade.tp1Hit) {
      return {
        type: "EXIT",
        direction: "EXIT" as any,
        alertLevel: 1,
        confidence: 95,
        timestamp: Date.now(),
        exitReason: `TAKE PROFIT 1 REACHED: Price ${currentPrice.toFixed(2)} >= TP1 ${trade.takeProfit1.toFixed(2)}`,
        urgency: "MEDIUM",
        priceTarget: trade.takeProfit1,
        profitTaken: currentPrice - trade.entryPrice,
        reasons: ["Take profit 1 reached - consider partial exit or trailing"],
        indicators: {},
      }
    }

    if (trade.direction === "SHORT" && currentPrice <= trade.takeProfit1 && !trade.tp1Hit) {
      return {
        type: "EXIT",
        direction: "EXIT" as any,
        alertLevel: 1,
        confidence: 95,
        timestamp: Date.now(),
        exitReason: `TAKE PROFIT 1 REACHED: Price ${currentPrice.toFixed(2)} <= TP1 ${trade.takeProfit1.toFixed(2)}`,
        urgency: "MEDIUM",
        priceTarget: trade.takeProfit1,
        profitTaken: trade.entryPrice - currentPrice,
        reasons: ["Take profit 1 reached - consider partial exit or trailing"],
        indicators: {},
      }
    }

    // Calculate indicators for market analysis
    const indicators1h = TechnicalAnalysis.calculateAllIndicators(candles1h)
    const indicators15m = TechnicalAnalysis.calculateAllIndicators(candles15m)
    const indicators5m = TechnicalAnalysis.calculateAllIndicators(candles5m)

    // Analyze market state
    const marketState1h = MarketStateMonitor.analyzeMarketState(candles1h, indicators1h)
    const marketState5m = MarketStateMonitor.analyzeMarketState(candles5m, indicators5m)

    // Check for trend reversal that's strong enough to close profitable trades
    if (trade.direction === "LONG" && currentPrice > trade.entryPrice) {
      const profitPercent = ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100

      // Strong reversal to SHORT: close profitable LONG
      if (
        marketState1h.bias === "BEARISH" &&
        marketState1h.momentum.includes("STRONG") &&
        marketState1h.signals.trendConfirmed &&
        profitPercent >= 0.5 // At least 0.5% profit
      ) {
        return {
          type: "EXIT",
          direction: "EXIT" as any,
          alertLevel: 2,
          confidence: 85,
          timestamp: Date.now(),
          exitReason: `TREND REVERSAL: Market bias shifted to BEARISH with strong momentum`,
          urgency: "HIGH",
          profitTaken: profitPercent,
          reasons: [
            `Strong reversal signal detected (bias=${marketState1h.bias}, momentum=${marketState1h.momentum})`,
            `Trend strength: ADX=${marketState1h.indicators.adx.toFixed(1)}, RSI=${marketState1h.indicators.rsi.toFixed(1)}`,
            `Current profit: ${profitPercent.toFixed(2)}% - Exit before reversal completes`,
          ],
          indicators: { ...indicators1h },
        }
      }
    }

    if (trade.direction === "SHORT" && currentPrice < trade.entryPrice) {
      const profitPercent = ((trade.entryPrice - currentPrice) / trade.entryPrice) * 100

      // Strong reversal to LONG: close profitable SHORT
      if (
        marketState1h.bias === "BULLISH" &&
        marketState1h.momentum.includes("STRONG") &&
        marketState1h.signals.trendConfirmed &&
        profitPercent >= 0.5
      ) {
        return {
          type: "EXIT",
          direction: "EXIT" as any,
          alertLevel: 2,
          confidence: 85,
          timestamp: Date.now(),
          exitReason: `TREND REVERSAL: Market bias shifted to BULLISH with strong momentum`,
          urgency: "HIGH",
          profitTaken: profitPercent,
          reasons: [
            `Strong reversal signal detected (bias=${marketState1h.bias}, momentum=${marketState1h.momentum})`,
            `Trend strength: ADX=${marketState1h.indicators.adx.toFixed(1)}, RSI=${marketState1h.indicators.rsi.toFixed(1)}`,
            `Current profit: ${profitPercent.toFixed(2)}% - Exit before reversal completes`,
          ],
          indicators: { ...indicators1h },
        }
      }
    }

    // Check for momentum divergence (price moving against momentum)
    if (
      marketState1h.indicators.adx >= 20 &&
      ((trade.direction === "LONG" && marketState1h.bias === "BEARISH") ||
        (trade.direction === "SHORT" && marketState1h.bias === "BULLISH"))
    ) {
      const divergenceStrength = indicators1h.divergence?.strength || 0
      if (divergenceStrength > 50) {
        const pnl = trade.direction === "LONG" ? currentPrice - trade.entryPrice : trade.entryPrice - currentPrice
        if (pnl > 0) {
          return {
            type: "EXIT",
            direction: "EXIT" as any,
            alertLevel: 2,
            confidence: 75,
            timestamp: Date.now(),
            exitReason: `DIVERGENCE WARNING: Price diverging from momentum - exit before move reverses`,
            urgency: "MEDIUM",
            profitTaken: (pnl / trade.entryPrice) * 100,
            reasons: [
              `Divergence detected: ${trade.direction} trade but momentum is ${marketState1h.bias}`,
              `Divergence strength: ${divergenceStrength.toFixed(0)}%`,
              `Recommendation: Take partial profits and reduce risk`,
            ],
            indicators: { ...indicators1h },
          }
        }
      }
    }

    // Check for volatility collapse (trade becomes too risky)
    if (marketState1h.volatility === "LOW" && marketState1h.riskLevel === "HIGH") {
      const riskPercent = ((currentPrice - (trade.direction === "LONG" ? trade.stopLoss : trade.entryPrice)) /
        trade.entryPrice) * 100
      if (riskPercent > 3) {
        return {
          type: "EXIT",
          direction: "EXIT" as any,
          alertLevel: 1,
          confidence: 70,
          timestamp: Date.now(),
          exitReason: `VOLATILITY COLLAPSE: Market volatility too low - exit to manage risk`,
          urgency: "MEDIUM",
          reasons: [
            `Volatility: ${marketState1h.volatility} (ATR=${marketState1h.indicators.atr.toFixed(2)})`,
            `Risk level: ${marketState1h.riskLevel}`,
            `Current market risk: ${riskPercent.toFixed(2)}% of entry`,
          ],
          indicators: { ...indicators1h },
        }
      }
    }

    // No exit signal
    return null
  }

  /**
   * Assess trade risk status for monitoring
   */
  static assessTradeRisk(
    trade: ActiveTrade,
    currentPrice: number,
    marketBias: "BULLISH" | "BEARISH" | "RANGING",
  ): TradeRiskAssessment {
    const timeInTrade = Date.now() - trade.entryTime
    const pnl = trade.direction === "LONG" ? currentPrice - trade.entryPrice : trade.entryPrice - currentPrice
    const pnlPercent = (pnl / trade.entryPrice) * 100

    // Distance calculations
    const distanceToSL =
      trade.direction === "LONG" ? currentPrice - trade.stopLoss : trade.stopLoss - currentPrice
    const distanceToSLPercent = (distanceToSL / Math.abs(trade.entryPrice - trade.stopLoss)) * 100

    const distanceToTP1 =
      trade.direction === "LONG" ? trade.takeProfit1 - currentPrice : currentPrice - trade.takeProfit1
    const distanceToTP1Percent = (distanceToTP1 / Math.abs(trade.takeProfit1 - trade.entryPrice)) * 100

    const distanceToTP2 =
      trade.direction === "LONG" ? trade.takeProfit2 - currentPrice : currentPrice - trade.takeProfit2
    const distanceToTP2Percent = (distanceToTP2 / Math.abs(trade.takeProfit2 - trade.entryPrice)) * 100

    // Determine risk status
    let riskStatus: "SAFE" | "CAUTION" | "WARNING" | "CRITICAL"
    if (distanceToSLPercent <= 10) {
      riskStatus = "CRITICAL"
    } else if (distanceToSLPercent <= 25) {
      riskStatus = "WARNING"
    } else if (distanceToSLPercent <= 50) {
      riskStatus = "CAUTION"
    } else {
      riskStatus = "SAFE"
    }

    // Market alignment check
    let marketAlignment: "ALIGNED" | "NEUTRAL" | "MISALIGNED"
    if (trade.direction === "LONG" && marketBias === "BULLISH") {
      marketAlignment = "ALIGNED"
    } else if (trade.direction === "SHORT" && marketBias === "BEARISH") {
      marketAlignment = "ALIGNED"
    } else if (marketBias === "RANGING") {
      marketAlignment = "NEUTRAL"
    } else {
      marketAlignment = "MISALIGNED"
    }

    // Generate recommendation
    let recommendation = ""
    if (riskStatus === "CRITICAL") {
      recommendation = "🚨 CRITICAL: Price very close to SL - exit or tighten stop immediately"
    } else if (riskStatus === "WARNING") {
      recommendation = "⚠️ WARNING: Stop loss approaching - prepare to exit if no reversal"
    } else if (riskStatus === "CAUTION") {
      recommendation = "📊 CAUTION: Monitor closely - consider trailing stop or partial exit"
    } else if (marketAlignment === "MISALIGNED") {
      recommendation = "⚡ Market bias opposite to trade - monitor for exit signal"
    } else if (pnlPercent >= 1) {
      recommendation = "✅ Trade performing well - consider scaling out at TP1"
    } else if (pnlPercent < -0.5) {
      recommendation = "⏸️ Trade slightly negative - stay put or exit if risk/reward poor"
    } else {
      recommendation = "✅ Trade on track - continue monitoring"
    }

    return {
      tradeId: trade.id,
      currentPrice,
      riskStatus,
      pnlPercent,
      distanceToSL,
      distanceToSLPercent,
      distanceToTP1,
      distanceToTP1Percent,
      distanceToTP2,
      distanceToTP2Percent,
      timeInTrade,
      marketAlignment,
      recommendation,
    }
  }
}
