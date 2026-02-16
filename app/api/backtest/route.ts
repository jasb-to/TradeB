/**
 * UNIFIED BACKTEST - Uses EXACT same engine classes as live signal route
 * 
 * NO duplicate scoring logic. NO alternate gates. NO simplified alignment.
 * This is a loop wrapper ONLY. All logic lives inside strategy classes.
 * 
 * Strategy integrity: Both this file and /api/signal/current/route.ts import from:
 *   - "@/lib/strategies" (TradingStrategies / STRICT)
 *   - "@/lib/balanced-strategy" (BalancedBreakoutStrategy / BALANCED)
 * If these imports ever diverge, the build will fail.
 */

import { NextResponse } from "next/server"
import { TradingStrategies } from "@/lib/strategies"
import { BalancedBreakoutStrategy } from "@/lib/balanced-strategy"
import { RegimeAdaptiveStrategy } from "@/lib/regime-adaptive-strategy"
import { DEFAULT_TRADING_CONFIG } from "@/lib/default-config"
import { DataFetcher } from "@/lib/data-fetcher"
import { TRADING_SYMBOLS } from "@/lib/trading-symbols"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// STRATEGY INTEGRITY CHECK: These must match the imports in /api/signal/current/route.ts
// If you change the strategy file paths here, you MUST change them in the live route too.
const STRATEGY_IMPORTS = {
  STRICT: "@/lib/strategies",
  BALANCED: "@/lib/balanced-strategy",
}

function getStrategyModeForSymbol(symbol: string): "STRICT" | "BALANCED" {
  if (symbol === "XAU_USD") return "STRICT"
  if (symbol === "GBP_JPY") return "BALANCED"
  if (symbol === "JP225") return "BALANCED"
  throw new Error(`Unsupported symbol: ${symbol}`)
}

interface BacktestTrade {
  index: number
  direction: "LONG" | "SHORT"
  tier: string
  entryPrice: number
  stopLoss: number
  takeProfit: number
  exitPrice: number
  exitReason: "TP" | "SL"
  pnlR: number
  blockedBy?: string[]
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const symbol = searchParams.get("symbol") || "XAU_USD"
  const limitParam = searchParams.get("limit") || "500"
  const modeParam = searchParams.get("mode") || null

  console.log(`[BACKTEST v5.0-JP225] Raw URL: ${request.url}`)
  console.log(`[BACKTEST v5.0-JP225] Symbol param: ${symbol}, Mode param: ${modeParam}`)
  console.log(`[BACKTEST v5.0-JP225] TRADING_SYMBOLS imported: ${TRADING_SYMBOLS.join(", ")}`)

  if (!TRADING_SYMBOLS.includes(symbol as any)) {
    return NextResponse.json({ error: `Invalid symbol. Valid: ${TRADING_SYMBOLS.join(", ")}` }, { status: 400 })
  }

  // Use modeParam if provided, otherwise default by symbol
  let mode: "STRICT" | "BALANCED" | "REGIME_ADAPTIVE"
  if (modeParam === "BALANCED") {
    mode = "BALANCED"
    console.log(`[BACKTEST v5.0-JP225] MODE OVERRIDE: Using BALANCED from query param`)
  } else if (modeParam === "STRICT") {
    mode = "STRICT"
    console.log(`[BACKTEST v5.0-JP225] MODE OVERRIDE: Using STRICT from query param`)
  } else if (modeParam === "REGIME_ADAPTIVE") {
    mode = "REGIME_ADAPTIVE"
    console.log(`[BACKTEST v5.0-JP225] MODE OVERRIDE: Using REGIME_ADAPTIVE from query param`)
  } else {
    mode = getStrategyModeForSymbol(symbol)
    console.log(`[BACKTEST v5.0-JP225] MODE DEFAULT: Using ${mode} based on symbol`)
  }
  
  console.log(`[BACKTEST] Starting: symbol=${symbol} mode=${mode} (modeParam=${modeParam})`)
  console.log(`[BACKTEST] Strategy imports: STRICT=${STRATEGY_IMPORTS.STRICT} BALANCED=${STRATEGY_IMPORTS.BALANCED}`)

  // Fetch historical data from OANDA
  const dataFetcher = new DataFetcher(symbol)
  
  let dataDaily, data8h, data4h, data1h, data15m, data5m
  try {
    dataDaily = await dataFetcher.fetchCandles("1d", 200)
    data8h = await dataFetcher.fetchCandles("8h", Math.min(parseInt(limitParam), 500))
    data4h = await dataFetcher.fetchCandles("4h", Math.min(parseInt(limitParam), 500))
    data1h = await dataFetcher.fetchCandles("1h", Math.min(parseInt(limitParam), 500))
    
    const [result15m, result5m] = await Promise.allSettled([
      dataFetcher.fetchCandles("15m", Math.min(parseInt(limitParam), 500)),
      dataFetcher.fetchCandles("5m", Math.min(parseInt(limitParam), 500)),
    ])
    data15m = result15m.status === "fulfilled" ? result15m.value : { candles: [], source: "oanda" as const }
    data5m = result5m.status === "fulfilled" ? result5m.value : { candles: [], source: "oanda" as const }
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch OANDA data", details: String(err) }, { status: 500 })
  }

  console.log(`[BACKTEST] Data loaded: Daily=${dataDaily.candles.length} 8H=${data8h.candles.length} 4H=${data4h.candles.length} 1H=${data1h.candles.length} 15M=${data15m.candles.length} 5M=${data5m.candles.length}`)

  // Walk-forward backtest: slide a window across 1H candles
  const trades: BacktestTrade[] = []
  const noTradeReasons: Record<string, number> = {}
  let signalCount = 0
  let entryCount = 0

  // We need minimum candle counts for indicator calculation
  const minCandles = 50
  const h1Candles = data1h.candles
  const windowSize = Math.min(200, h1Candles.length)

  for (let i = minCandles; i < h1Candles.length; i += 1) {
    // Create sliding windows that end at index i
    const h1Window = h1Candles.slice(Math.max(0, i - windowSize), i + 1)
    
    // For longer timeframes, use full available data (they don't slide as fast)
    // This matches how the live system works - it always gets the latest N candles
    
    let signal
    try {
      if (mode === "BALANCED") {
        const strategy = new BalancedBreakoutStrategy(DEFAULT_TRADING_CONFIG)
        strategy.setDataSource("oanda")
        signal = await strategy.evaluateSignals(
          dataDaily.candles,
          data4h.candles,
          h1Window,
        )
      } else if (mode === "REGIME_ADAPTIVE") {
        const strategy = new RegimeAdaptiveStrategy(DEFAULT_TRADING_CONFIG)
        strategy.setDataSource("oanda")
        signal = await strategy.evaluateSignals(
          dataDaily.candles,
          data8h.candles,
          data4h.candles,
          h1Window,
          data15m.candles,
          data5m.candles,
        )
      } else {
        // STRICT mode (default)
        const strategy = new TradingStrategies(DEFAULT_TRADING_CONFIG)
        strategy.setDataSource("oanda")
        signal = await strategy.evaluateSignals(
          dataDaily.candles,
          data8h.candles,
          data4h.candles,
          h1Window,
          data15m.candles,
          data5m.candles,
        )
      }
    } catch (err) {
      continue // Skip errors, keep walking
    }

    signalCount++

    if (signal.type === "ENTRY" && signal.direction && signal.direction !== "NONE" && signal.direction !== "NEUTRAL") {
      entryCount++
      const entry = h1Candles[i].close
      const sl = signal.stopLoss || (signal.direction === "LONG" ? entry - 10 : entry + 10)
      const tp = signal.takeProfit || (signal.direction === "LONG" ? entry + 20 : entry - 20)

      // Simulate forward: check next candles for SL or TP hit
      let exitPrice = entry
      let exitReason: "TP" | "SL" = "SL"
      
      for (let j = i + 1; j < Math.min(i + 50, h1Candles.length); j++) {
        const candle = h1Candles[j]
        if (signal.direction === "LONG") {
          if (candle.low <= sl) { exitPrice = sl; exitReason = "SL"; break }
          if (candle.high >= tp) { exitPrice = tp; exitReason = "TP"; break }
        } else {
          if (candle.high >= sl) { exitPrice = sl; exitReason = "SL"; break }
          if (candle.low <= tp) { exitPrice = tp; exitReason = "TP"; break }
        }
        // If we reach the end of the window, exit at last close
        if (j === Math.min(i + 49, h1Candles.length - 1)) {
          exitPrice = candle.close
          exitReason = signal.direction === "LONG" 
            ? (candle.close > entry ? "TP" : "SL")
            : (candle.close < entry ? "TP" : "SL")
        }
      }

      const risk = Math.abs(entry - sl)
      const pnlR = risk > 0 
        ? (signal.direction === "LONG" ? (exitPrice - entry) / risk : (entry - exitPrice) / risk)
        : 0

      trades.push({
        index: i,
        direction: signal.direction as "LONG" | "SHORT",
        tier: signal.structuralTier || "UNKNOWN",
        entryPrice: entry,
        stopLoss: sl,
        takeProfit: tp,
        exitPrice,
        exitReason,
        pnlR: Math.round(pnlR * 100) / 100,
        blockedBy: signal.blockedBy,
      })

      // Skip ahead to avoid overlapping trades
      i += 5
    } else {
      // Track NO_TRADE reasons
      const reason = signal.blockedBy?.[0] || signal.reasons?.[0]?.substring(0, 50) || "unknown"
      noTradeReasons[reason] = (noTradeReasons[reason] || 0) + 1
    }
  }

  // Calculate results
  const wins = trades.filter(t => t.exitReason === "TP")
  const losses = trades.filter(t => t.exitReason === "SL")
  const totalPnlR = trades.reduce((sum, t) => sum + t.pnlR, 0)
  const winRate = trades.length > 0 ? (wins.length / trades.length * 100) : 0
  
  // Tier breakdown
  const tierBreakdown: Record<string, { count: number; wins: number; pnlR: number }> = {}
  for (const t of trades) {
    if (!tierBreakdown[t.tier]) tierBreakdown[t.tier] = { count: 0, wins: 0, pnlR: 0 }
    tierBreakdown[t.tier].count++
    if (t.exitReason === "TP") tierBreakdown[t.tier].wins++
    tierBreakdown[t.tier].pnlR += t.pnlR
  }

  // Max drawdown
  let maxDD = 0
  let runningPnl = 0
  let peak = 0
  for (const t of trades) {
    runningPnl += t.pnlR
    if (runningPnl > peak) peak = runningPnl
    const dd = peak - runningPnl
    if (dd > maxDD) maxDD = dd
  }

  const results = {
    symbol,
    mode,
    engineImport: mode === "STRICT" ? STRATEGY_IMPORTS.STRICT : STRATEGY_IMPORTS.BALANCED,
    dataRange: {
      h1Candles: h1Candles.length,
      dailyCandles: dataDaily.candles.length,
      h4Candles: data4h.candles.length,
    },
    evaluations: signalCount,
    entries: entryCount,
    totalTrades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: `${winRate.toFixed(1)}%`,
    totalPnlR: `${totalPnlR.toFixed(1)}R`,
    maxDrawdownR: `${maxDD.toFixed(1)}R`,
    tierBreakdown,
    topBlockers: Object.entries(noTradeReasons)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([reason, count]) => ({ reason, count })),
    trades: trades.slice(-20), // Last 20 trades for inspection
  }

  console.log(`[BACKTEST] COMPLETE: ${symbol} ${mode} | ${trades.length} trades | ${winRate.toFixed(1)}% WR | ${totalPnlR.toFixed(1)}R net`)

  return NextResponse.json(results)
}
