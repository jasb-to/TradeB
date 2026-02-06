#!/usr/bin/env ts-node

/**
 * Comprehensive Backtest Script for Gold (XAU) and Silver (XAG)
 * Tests A+, A, and B trade tiers using current strategies
 */

import type { Candle, Signal } from "@/types/trading"
import { DataFetcher } from "@/lib/data-fetcher"
import { TradingStrategies } from "@/lib/strategies"
import { SilverStrategy } from "@/lib/silver-strategy"
import { TechnicalAnalysis } from "@/lib/indicators"
import { DEFAULT_TRADING_CONFIG } from "@/lib/default-config"

interface Trade {
  id: string
  symbol: string
  entryTime: Date
  exitTime: Date | null
  direction: "LONG" | "SHORT"
  entryPrice: number
  exitPrice: number | null
  size: number
  pnl: number | null
  reason: string
  tier: "A+" | "A" | "B"
  confidence: number
  setupQuality: string
}

interface BacktestResult {
  symbol: string
  tier: "A+" | "A" | "B"
  startingBalance: number
  finalBalance: number
  totalTrades: number
  winningTrades: number
  losingTrades: number
  winRate: number
  maxDrawdown: number
  maxDrawdownPercent: number
  totalPnL: number
  returnPercent: number
  trades: Trade[]
  avgHoldingTime: number
  bestTrade: number
  worstTrade: number
}

class ComprehensiveBacktest {
  private dataFetcher: DataFetcher
  private symbol: string
  private startingBalance: number

  constructor(symbol: string, startingBalance: number = 10000) {
    this.symbol = symbol
    this.dataFetcher = new DataFetcher(symbol)
    this.startingBalance = startingBalance
  }

  async run(): Promise<BacktestResult[]> {
    console.log(`\n🚀 Starting Comprehensive Backtest for ${this.symbol}`)
    console.log(`📊 Starting Balance: £${this.startingBalance.toLocaleString()}`)
    
    // Fetch historical data for all timeframes
    const [dailyCandles, h4Candles, h1Candles, m15Candles, m5Candles] = await Promise.all([
      this.dataFetcher.fetchCandles("1d", 90),
      this.dataFetcher.fetchCandles("4h", 200),
      this.dataFetcher.fetchCandles("1h", 500),
      this.dataFetcher.fetchCandles("15m", 1000),
      this.dataFetcher.fetchCandles("5m", 1000),
    ])

    console.log(`📈 Data loaded: Daily=${dailyCandles.candles.length}, 4H=${h4Candles.candles.length}, 1H=${h1Candles.candles.length}, 15M=${m15Candles.candles.length}, 5M=${m5Candles.candles.length}`)

    // Test all three tiers
    const results: BacktestResult[] = []
    
    for (const tier of ["A+", "A", "B"] as const) {
      console.log(`\n🎯 Testing ${tier} Tier Strategy...`)
      const result = await this.runTierBacktest(tier, dailyCandles.candles, h4Candles.candles, h1Candles.candles, m15Candles.candles, m5Candles.candles)
      results.push(result)
    }

    this.printSummary(results)
    return results
  }

  private async runTierBacktest(
    tier: "A+" | "A" | "B",
    dailyCandles: Candle[],
    h4Candles: Candle[],
    h1Candles: Candle[],
    m15Candles: Candle[],
    m5Candles: Candle[]
  ): Promise<BacktestResult> {
    let balance = this.startingBalance
    const startingBalance = balance
    let maxBalance = balance
    let maxDrawdown = 0

    const trades: Trade[] = []
    let currentTrade: Trade | null = null

    // Risk per trade based on tier
    const riskPercent = tier === "A+" ? 0.01 : tier === "A" ? 0.02 : 0.03 // 1%, 2%, 3%

    // Start backtest from a reasonable point (after warmup)
    const startIndex = 100

    for (let i = startIndex; i < m15Candles.length; i++) {
      const currentCandle = m15Candles[i]
      const currentTime = currentCandle.timestamp

      // Find corresponding indices for other timeframes
      const dailyIndex = this.findCandleIndex(dailyCandles, currentTime)
      const h4Index = this.findCandleIndex(h4Candles, currentTime)
      const h1Index = this.findCandleIndex(h1Candles, currentTime)
      const m5Index = this.findCandleIndex(m5Candles, currentTime)

      if (dailyIndex < 0 || h4Index < 0 || h1Index < 0 || m5Index < 0) continue

      // If in a trade, check for exit
      if (currentTrade) {
        const shouldExit = this.checkExit(currentCandle, currentTrade)
        if (shouldExit.shouldExit) {
          const exitPrice = currentCandle.close
          const pnl = this.calculatePnL(currentTrade, exitPrice)
          
          currentTrade.exitTime = new Date(currentTime)
          currentTrade.exitPrice = exitPrice
          currentTrade.pnl = pnl
          currentTrade.reason = shouldExit.reason

          balance += pnl
          trades.push({ ...currentTrade })

          // Track max drawdown
          if (balance > maxBalance) maxBalance = balance
          const drawdown = maxBalance - balance
          if (drawdown > maxDrawdown) maxDrawdown = drawdown

          currentTrade = null
        }
      }

      // If not in a trade, check for entry
      if (!currentTrade) {
        const signal = await this.evaluateSignal(
          tier,
          dailyCandles.slice(0, dailyIndex + 1),
          h4Candles.slice(0, h4Index + 1),
          h1Candles.slice(0, h1Index + 1),
          m15Candles.slice(0, i + 1),
          m5Candles.slice(0, m5Index + 1)
        )

        if (signal && signal.type === "ENTRY" && this.shouldTakeTrade(tier, signal)) {
          const entryPrice = signal.entryPrice || currentCandle.close
          const size = this.calculatePositionSize(balance, riskPercent, signal)

          currentTrade = {
            id: `${this.symbol}_${tier}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            symbol: this.symbol,
            entryTime: new Date(currentTime),
            exitTime: null,
            direction: signal.direction as "LONG" | "SHORT",
            entryPrice,
            exitPrice: null,
            size,
            pnl: null,
            reason: signal.reasons?.join(", ") || "Strategy signal",
            tier,
            confidence: signal.confidence || 0,
            setupQuality: signal.setupQuality || "STANDARD",
          }

          console.log(`✅ ${tier} Entry: ${signal.direction} @ ${entryPrice.toFixed(2)} | Confidence: ${signal.confidence}% | Quality: ${signal.setupQuality}`)
        }
      }
    }

    // Close any open trade at end
    if (currentTrade) {
      const lastCandle = m15Candles[m15Candles.length - 1]
      const exitPrice = lastCandle.close
      const pnl = this.calculatePnL(currentTrade, exitPrice)
      
      currentTrade.exitTime = new Date(lastCandle.timestamp)
      currentTrade.exitPrice = exitPrice
      currentTrade.pnl = pnl
      currentTrade.reason = "End of backtest"

      balance += pnl
      trades.push({ ...currentTrade })
    }

    // Calculate statistics
    const winningTrades = trades.filter(t => (t.pnl || 0) > 0).length
    const losingTrades = trades.filter(t => (t.pnl || 0) < 0).length
    const totalPnL = balance - startingBalance
    const avgHoldingTime = trades.length > 0 
      ? trades.reduce((sum, t) => sum + ((t.exitTime?.getTime() || Date.now()) - t.entryTime.getTime()), 0) / trades.length / (1000 * 60 * 60) // hours
      : 0
    const bestTrade = trades.length > 0 ? Math.max(...trades.map(t => t.pnl || 0)) : 0
    const worstTrade = trades.length > 0 ? Math.min(...trades.map(t => t.pnl || 0)) : 0

    return {
      symbol: this.symbol,
      tier,
      startingBalance,
      finalBalance: balance,
      totalTrades: trades.length,
      winningTrades,
      losingTrades,
      winRate: trades.length > 0 ? (winningTrades / trades.length) * 100 : 0,
      maxDrawdown,
      maxDrawdownPercent: maxBalance > 0 ? (maxDrawdown / maxBalance) * 100 : 0,
      totalPnL,
      returnPercent: (totalPnL / startingBalance) * 100,
      trades,
      avgHoldingTime,
      bestTrade,
      worstTrade,
    }
  }

  private async evaluateSignal(
    tier: "A+" | "A" | "B",
    dailyCandles: Candle[],
    h4Candles: Candle[],
    h1Candles: Candle[],
    m15Candles: Candle[],
    m5Candles: Candle[]
  ): Promise<Signal | null> {
    try {
      const strategies = new TradingStrategies(DEFAULT_TRADING_CONFIG)
      
      if (this.symbol === "XAU_USD") {
        // Use TradingStrategies for Gold
        const signal = await strategies.evaluateSignals(
          dailyCandles,
          [], // data8h - not used in backtest
          h4Candles,
          h1Candles,
          m15Candles,
          m5Candles
        )
        return signal
      } else if (this.symbol === "XAG_USD") {
        // Use Silver strategy
        const result = SilverStrategy.evaluateSilverSignal(
          dailyCandles,
          h4Candles,
          h1Candles,
          m15Candles,
          m5Candles
        )
        return result.signal
      }
    } catch (error) {
      console.warn(`⚠️ Signal evaluation failed for ${this.symbol}:`, error)
    }
    return null
  }

  private shouldTakeTrade(tier: "A+" | "A" | "B", signal: Signal): boolean {
    if (signal.type !== "ENTRY") return false

    // Tier-specific filters
    switch (tier) {
      case "A+":
        return signal.confidence >= 85 && signal.setupQuality === "A+"
      case "A":
        return signal.confidence >= 70 && (signal.setupQuality === "A+" || signal.setupQuality === "A")
      case "B":
        return signal.confidence >= 50 && signal.alertLevel >= 2
    }
  }

  private calculatePositionSize(balance: number, riskPercent: number, signal: Signal): number {
    // Simplified position sizing
    const riskAmount = balance * riskPercent
    const atr = signal.indicators?.atr || 10 // Default ATR
    const stopDistance = atr * 1.5 // 1.5 ATR stop
    const pipValue = this.symbol === "XAU_USD" ? 0.1 : 0.01 // Simplified
    const size = riskAmount / (stopDistance * pipValue)
    return Math.max(size, 0.01) // Minimum size
  }

  private calculatePnL(trade: Trade, exitPrice: number): number {
    const priceDiff = trade.direction === "LONG" 
      ? exitPrice - trade.entryPrice 
      : trade.entryPrice - exitPrice
    
    // Simplified PnL calculation
    const pipValue = this.symbol === "XAU_USD" ? 0.1 : 0.01
    return priceDiff * trade.size * pipValue
  }

  private checkExit(currentCandle: Candle, trade: Trade): { shouldExit: boolean; reason: string } {
    const price = currentCandle.close
    const entryPrice = trade.entryPrice

    // Calculate ATR for dynamic stops
    const atr = this.calculateATR([currentCandle], 14) || 10

    if (trade.direction === "LONG") {
      // Stop loss: 2 ATR below entry
      const stopLoss = entryPrice - atr * 2
      if (price < stopLoss) {
        return { shouldExit: true, reason: "Stop loss hit" }
      }

      // Take profit: 3 ATR above entry (1.5 R:R)
      const takeProfit = entryPrice + atr * 3
      if (price > takeProfit) {
        return { shouldExit: true, reason: "Take profit hit" }
      }

      // Trailing stop after 2 ATR profit
      if (price > entryPrice + atr * 2) {
        const trailingStop = price - atr * 1.5
        if (currentCandle.low < trailingStop) {
          return { shouldExit: true, reason: "Trailing stop hit" }
        }
      }
    } else {
      // SHORT logic
      const stopLoss = entryPrice + atr * 2
      if (price > stopLoss) {
        return { shouldExit: true, reason: "Stop loss hit" }
      }

      const takeProfit = entryPrice - atr * 3
      if (price < takeProfit) {
        return { shouldExit: true, reason: "Take profit hit" }
      }

      if (price < entryPrice - atr * 2) {
        const trailingStop = price + atr * 1.5
        if (currentCandle.high > trailingStop) {
          return { shouldExit: true, reason: "Trailing stop hit" }
        }
      }
    }

    return { shouldExit: false, reason: "" }
  }

  private calculateATR(candles: Candle[], period: number): number {
    if (candles.length < period + 1) return 0

    const trueRanges = []
    for (let i = 1; i < candles.length; i++) {
      const high = candles[i].high
      const low = candles[i].low
      const prevClose = candles[i - 1].close
      const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose))
      trueRanges.push(tr)
    }

    return trueRanges.reduce((a, b) => a + b, 0) / trueRanges.length
  }

  private findCandleIndex(candles: Candle[], targetTime: number): number {
    for (let i = 0; i < candles.length; i++) {
      if (candles[i].timestamp >= targetTime) {
        return Math.max(0, i - 1)
      }
    }
    return -1
  }

  private printSummary(results: BacktestResult[]): void {
    console.log("\n" + "=".repeat(80))
    console.log(`📊 COMPREHENSIVE BACKTEST RESULTS - ${this.symbol}`)
    console.log("=".repeat(80))
    
    console.log("\n📈 TIER COMPARISON:")
    console.log("-".repeat(80))
    console.log("Tier    | Trades | Win Rate | Return % | Max DD % | Best Trade | Worst Trade")
    console.log("-".repeat(80))
    
    results.forEach(result => {
      const winRateStr = result.totalTrades > 0 ? `${result.winRate.toFixed(1)}%` : "0.0%"
      const returnStr = `${result.returnPercent.toFixed(1)}%`
      const ddStr = `${result.maxDrawdownPercent.toFixed(1)}%`
      const bestStr = `£${result.bestTrade.toFixed(0)}`
      const worstStr = `£${result.worstTrade.toFixed(0)}`
      
      console.log(
        `${result.tier.padEnd(7)} | ${String(result.totalTrades).padEnd(6)} | ${winRateStr.padEnd(8)} | ${returnStr.padEnd(8)} | ${ddStr.padEnd(8)} | ${bestStr.padEnd(10)} | ${worstStr}`
      )
    })

    console.log("-".repeat(80))
    
    // Best performing tier
    const bestTier = results.reduce((prev, current) => 
      prev.returnPercent > current.returnPercent ? prev : current
    )
    
    console.log(`\n🏆 BEST PERFORMING TIER: ${bestTier.tier} (${bestTier.returnPercent.toFixed(1)}% return)`)
    console.log(`💰 HIGHEST WIN RATE: ${results.reduce((prev, current) => 
      prev.winRate > current.winRate ? prev : current
    ).tier} (${results.reduce((prev, current) => 
      prev.winRate > current.winRate ? prev : current
    ).winRate.toFixed(1)}%)`)
    console.log(`🛡️ LOWEST DRAWDOWN: ${results.reduce((prev, current) => 
      prev.maxDrawdownPercent < current.maxDrawdownPercent ? prev : current
    ).tier} (${results.reduce((prev, current) => 
      prev.maxDrawdownPercent < current.maxDrawdownPercent ? prev : current
    ).maxDrawdownPercent.toFixed(1)}%)`)

    // Detailed results for each tier
    results.forEach(result => {
      console.log(`\n${result.tier} TIER DETAILED RESULTS:`)
      console.log("-".repeat(40))
      console.log(`Total Trades: ${result.totalTrades}`)
      console.log(`Winning: ${result.winningTrades} | Losing: ${result.losingTrades}`)
      console.log(`Win Rate: ${result.winRate.toFixed(1)}%`)
      console.log(`Avg Holding Time: ${result.avgHoldingTime.toFixed(1)} hours`)
      console.log(`Best Trade: £${result.bestTrade.toFixed(2)}`)
      console.log(`Worst Trade: £${result.worstTrade.toFixed(2)}`)
    })
  }
}

// Run backtests for both symbols
async function runComprehensiveBacktest(): Promise<void> {
  console.log("🚀 COMPREHENSIVE GOLD & SILVER BACKTEST")
  console.log("Testing A+, A, and B trade tiers")
  console.log("Timeframe: 3 months of historical data")
  console.log("Risk Management: Tier-specific position sizing")

  const symbols = ["XAU_USD", "XAG_USD"]
  const allResults: { symbol: string; results: BacktestResult[] }[] = []

  for (const symbol of symbols) {
    console.log(`\n${"=".repeat(60)}`)
    console.log(`🎯 TESTING ${symbol}`)
    console.log(`${"=".repeat(60)}`)
    
    const backtest = new ComprehensiveBacktest(symbol, 10000)
    const results = await backtest.run()
    allResults.push({ symbol, results })
  }

  // Final summary
  console.log(`\n${"=".repeat(100)}`)
  console.log("🏁 FINAL COMPREHENSIVE BACKTEST SUMMARY")
  console.log(`${"=".repeat(100)}`)

  allResults.forEach(({ symbol, results }) => {
    console.log(`\n${symbol} OVERALL PERFORMANCE:`)
    console.log("-".repeat(50))
    
    const totalTrades = results.reduce((sum, r) => sum + r.totalTrades, 0)
    const totalPnL = results.reduce((sum, r) => sum + r.totalPnL, 0)
    const totalReturn = (totalPnL / 10000) * 100
    
    console.log(`Total Trades: ${totalTrades}`)
    console.log(`Total P&L: £${totalPnL.toFixed(2)} (${totalReturn.toFixed(1)}%)`)
    
    const avgWinRate = results.reduce((sum, r) => sum + r.winRate, 0) / results.length
    console.log(`Average Win Rate: ${avgWinRate.toFixed(1)}%`)
  })

  console.log(`\n${"=".repeat(100)}`)
  console.log("✅ BACKTEST COMPLETE")
  console.log("Review the detailed results above to determine optimal trade tier")
  console.log(`${"=".repeat(100)}`)
}

// Run the backtest
runComprehensiveBacktest().catch(console.error)