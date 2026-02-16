import { NextResponse } from "next/server"
import { TradingStrategies } from "@/lib/strategies"
import { BalancedBreakoutStrategy } from "@/lib/balanced-strategy"
import { RegimeAdaptiveStrategy } from "@/lib/regime-adaptive-strategy"
import { DEFAULT_TRADING_CONFIG } from "@/lib/default-config"
import { DataFetcher } from "@/lib/data-fetcher"
import { TRADING_SYMBOLS } from "@/lib/trading-symbols"

export const dynamic = "force-dynamic"

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

function getStrategyModeForSymbol(symbol: string): "STRICT" | "BALANCED" {
  if (symbol === "XAU_USD") return "STRICT"
  if (symbol === "JP225") return "BALANCED"
  if (symbol === "US100") return "BALANCED"
  if (symbol === "US500") return "BALANCED"
  throw new Error(`Unsupported symbol: ${symbol}`)
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const symbol = searchParams.get("symbol") || "XAU_USD"
    const limitParam = searchParams.get("limit") || "500"
    const modeParam = searchParams.get("mode") || null

    if (!TRADING_SYMBOLS.includes(symbol as any)) {
      return NextResponse.json({ error: `Invalid symbol. Valid: ${TRADING_SYMBOLS.join(", ")}` }, { status: 400 })
    }

    let mode: "STRICT" | "BALANCED" | "REGIME_ADAPTIVE"
    if (modeParam === "BALANCED") {
      mode = "BALANCED"
    } else if (modeParam === "STRICT") {
      mode = "STRICT"
    } else if (modeParam === "REGIME_ADAPTIVE") {
      mode = "REGIME_ADAPTIVE"
    } else {
      mode = getStrategyModeForSymbol(symbol)
    }

    const dataFetcher = new DataFetcher(symbol)
    
    let dataDaily, data8h, data4h, data1h, data15m, data5m
    try {
      const [
        dailyResult,
        result8h,
        result4h,
        result1h,
        result15m,
        result5m,
      ] = await Promise.allSettled([
        dataFetcher.fetchCandles("1d", Math.min(parseInt(limitParam), 500)),
        dataFetcher.fetchCandles("8h", Math.min(parseInt(limitParam), 500)),
        dataFetcher.fetchCandles("4h", Math.min(parseInt(limitParam), 500)),
        dataFetcher.fetchCandles("1h", Math.min(parseInt(limitParam), 500)),
        dataFetcher.fetchCandles("15m", Math.min(parseInt(limitParam), 500)),
        dataFetcher.fetchCandles("5m", Math.min(parseInt(limitParam), 500)),
      ])
      
      dataDaily = dailyResult.status === "fulfilled" ? dailyResult.value : { candles: [], source: "oanda" as const }
      data8h = result8h.status === "fulfilled" ? result8h.value : { candles: [], source: "oanda" as const }
      data4h = result4h.status === "fulfilled" ? result4h.value : { candles: [], source: "oanda" as const }
      data1h = result1h.status === "fulfilled" ? result1h.value : { candles: [], source: "oanda" as const }
      data15m = result15m.status === "fulfilled" ? result15m.value : { candles: [], source: "oanda" as const }
      data5m = result5m.status === "fulfilled" ? result5m.value : { candles: [], source: "oanda" as const }
    } catch (err) {
      return NextResponse.json({ error: "Failed to fetch OANDA data", details: String(err) }, { status: 500 })
    }

    const trades: BacktestTrade[] = []
    const noTradeReasons: Record<string, number> = {}
    let signalCount = 0
    let entryCount = 0

    const minCandles = 50
    const h1Candles = data1h.candles
    const windowSize = Math.min(200, h1Candles.length)

    for (let i = minCandles; i < h1Candles.length; i += 1) {
      const h1Window = h1Candles.slice(Math.max(0, i - windowSize), i + 1)
      
      let signal
      try {
        if (mode === "BALANCED") {
          const strategy = new BalancedBreakoutStrategy(DEFAULT_TRADING_CONFIG)
          strategy.setDataSource("oanda")
          signal = await strategy.evaluateSignals(dataDaily.candles, data4h.candles, h1Window)
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
        continue
      }

      signalCount++

      if (signal.type === "ENTRY" && signal.direction && signal.direction !== "NONE" && signal.direction !== "NEUTRAL") {
        entryCount++
        const entry = h1Candles[i].close
        const sl = signal.stopLoss || (signal.direction === "LONG" ? entry - 10 : entry + 10)
        const tp = signal.takeProfit || (signal.direction === "LONG" ? entry + 20 : entry - 20)

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

        i += 5
      } else {
        const reason = signal.blockedBy?.[0] || signal.reasons?.[0]?.substring(0, 50) || "unknown"
        noTradeReasons[reason] = (noTradeReasons[reason] || 0) + 1
      }
    }

    const wins = trades.filter(t => t.exitReason === "TP")
    const losses = trades.filter(t => t.exitReason === "SL")
    const totalPnlR = trades.reduce((sum, t) => sum + t.pnlR, 0)
    const winRate = trades.length > 0 ? (wins.length / trades.length * 100) : 0
    
    const tierBreakdown: Record<string, { count: number; wins: number; pnlR: number }> = {}
    for (const t of trades) {
      if (!tierBreakdown[t.tier]) tierBreakdown[t.tier] = { count: 0, wins: 0, pnlR: 0 }
      tierBreakdown[t.tier].count++
      if (t.exitReason === "TP") tierBreakdown[t.tier].wins++
      tierBreakdown[t.tier].pnlR += t.pnlR
    }

    let maxDD = 0
    let runningPnl = 0
    let peak = 0
    for (const t of trades) {
      runningPnl += t.pnlR
      peak = Math.max(peak, runningPnl)
      maxDD = Math.max(maxDD, peak - runningPnl)
    }

    const results = {
      symbol,
      mode,
      engineImport: mode === "BALANCED" ? "@/lib/balanced-strategy" : "@/lib/strategies",
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
      trades: trades.slice(-20),
    }

    return NextResponse.json(results)
  } catch (error) {
    return NextResponse.json({
      error: "Backtest failed",
      details: error instanceof Error ? error.message : String(error),
    }, { status: 500 })
  }
}
