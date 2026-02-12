import { DataFetcher } from "../lib/data-fetcher"
import { TradingStrategies } from "../lib/strategies"
import { DEFAULT_TRADING_CONFIG } from "../lib/default-config"

interface BacktestResult {
  symbol: string
  signals: number
  wins: number
  losses: number
  winRate: number
  profitFactor: number
  totalPnL: number
  avgWinPips: number
  avgLossPips: number
  maxConsecutiveWins: number
  maxConsecutiveLosses: number
}

async function backtestGBPJPY(): Promise<BacktestResult> {
  const symbol = "GBP_JPY"
  const fetcher = new DataFetcher(symbol)
  const strategies = new TradingStrategies(DEFAULT_TRADING_CONFIG)

  console.log(`[BACKTEST] Starting 6-month GBP/JPY backtest...`)
  console.log(`[BACKTEST] Symbol: ${symbol}`)
  console.log(`[BACKTEST] B-Tier Gate: 5.0-5.99`)
  console.log(`[BACKTEST] Evaluating with current strategy rules`)

  try {
    // Fetch 6 months of daily candles (approximately 130 candles)
    const dataDaily = await fetcher.fetchCandles("1d", 130)
    const data8h = await fetcher.fetchCandles("8h", 200)
    const data4h = await fetcher.fetchCandles("4h", 200)
    const data1h = await fetcher.fetchCandles("1h", 200)

    if (!dataDaily.candles?.length) {
      throw new Error("No candle data returned for GBP/JPY")
    }

    console.log(`[BACKTEST] Data loaded: ${dataDaily.candles.length} daily candles`)

    let signals = 0
    let wins = 0
    let losses = 0
    let totalPnL = 0
    let consecutiveWins = 0
    let consecutiveLosses = 0
    let maxConsecutiveWins = 0
    let maxConsecutiveLosses = 0

    // Simulate trading signal evaluation every day
    for (let i = 0; i < dataDaily.candles.length - 1; i++) {
      const signal = await strategies.evaluateSignals(
        dataDaily.candles.slice(0, i + 1),
        data8h.candles.slice(0, Math.floor(i * 0.25) + 1),
        data4h.candles.slice(0, Math.floor(i * 0.5) + 1),
        data1h.candles.slice(0, Math.floor(i * 2) + 1),
        data1h.candles.slice(0, Math.floor(i * 2) + 1),
        data1h.candles.slice(0, Math.floor(i * 2) + 1)
      )

      const score = (signal as any).score || 0
      const tier = (signal as any).tier || "NO_TRADE"

      // Check if this is a B-tier signal (5.0-5.99) 
      if (score >= 5.0 && score < 6.0 && tier === "B") {
        signals++

        // Simulate trade outcome based on next candle
        const nextCandle = dataDaily.candles[i + 1]
        const currentClose = dataDaily.candles[i].mid.c
        const nextClose = nextCandle.mid.c

        // Simple P&L calculation in pips (1 pip for forex = 0.0001)
        const pipsMove = Math.abs((nextClose - currentClose) / 0.0001)
        const pnl = (signal as any).direction === "BUY" 
          ? (nextClose - currentClose) * 10000
          : (currentClose - nextClose) * 10000

        if (pnl > 0) {
          wins++
          consecutiveWins++
          consecutiveLosses = 0
          maxConsecutiveWins = Math.max(maxConsecutiveWins, consecutiveWins)
        } else {
          losses++
          consecutiveLosses++
          consecutiveWins = 0
          maxConsecutiveLosses = Math.max(maxConsecutiveLosses, consecutiveLosses)
        }

        totalPnL += pnl

        console.log(
          `[BACKTEST] Signal #${signals}: ${(signal as any).direction} @ ${currentClose.toFixed(5)}, ` +
          `Next: ${nextClose.toFixed(5)}, P&L: ${pnl.toFixed(2)} pips, Tier: ${tier} (Score: ${score.toFixed(2)})`
        )
      }
    }

    const winRate = signals > 0 ? (wins / signals) * 100 : 0
    const totalWins = Math.abs(totalPnL * (wins / (wins + losses || 1)))
    const totalLosses = Math.abs(totalPnL * (losses / (wins + losses || 1)))
    const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? 999 : 0

    const result: BacktestResult = {
      symbol,
      signals,
      wins,
      losses,
      winRate,
      profitFactor,
      totalPnL,
      avgWinPips: wins > 0 ? totalWins / wins : 0,
      avgLossPips: losses > 0 ? totalLosses / losses : 0,
      maxConsecutiveWins,
      maxConsecutiveLosses,
    }

    return result
  } catch (error) {
    console.error("[BACKTEST] Error:", error)
    throw error
  }
}

// Main execution
backtestGBPJPY()
  .then((result) => {
    console.log("\n========== BACKTEST RESULTS ==========")
    console.log(`Symbol: ${result.symbol}`)
    console.log(`Total Signals: ${result.signals}`)
    console.log(`Wins: ${result.wins}`)
    console.log(`Losses: ${result.losses}`)
    console.log(`Win Rate: ${result.winRate.toFixed(2)}%`)
    console.log(`Profit Factor: ${result.profitFactor.toFixed(2)}`)
    console.log(`Total P&L: ${result.totalPnL.toFixed(2)} pips`)
    console.log(`Avg Win: ${result.avgWinPips.toFixed(2)} pips`)
    console.log(`Avg Loss: ${result.avgLossPips.toFixed(2)} pips`)
    console.log(`Max Consecutive Wins: ${result.maxConsecutiveWins}`)
    console.log(`Max Consecutive Losses: ${result.maxConsecutiveLosses}`)
    console.log("=====================================\n")
  })
  .catch((error) => {
    console.error("Backtest failed:", error)
    process.exit(1)
  })
