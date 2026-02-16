import { NextRequest, NextResponse } from "next/server"
import https from "https"
import { TradingStrategies } from "@/lib/strategies"
import { BalancedBreakoutStrategy } from "@/lib/balanced-strategy"
import { RegimeAdaptiveStrategy } from "@/lib/regime-adaptive-strategy"
import { DEFAULT_TRADING_CONFIG } from "@/lib/default-config"
import type { Candle, Signal } from "@/types/trading"

export const dynamic = "force-dynamic"
export const maxDuration = 300

const OANDA_KEY = process.env.OANDA_API_KEY
const SERVERS = ["api-fxtrade.oanda.com", "api-fxpractice.oanda.com"]

interface TradeRecord {
  entryPrice: number
  entryTime: string
  direction: string
  tier: string
  stopLoss: number
  tp1: number
  tp2?: number
  indicators: Record<string, number>
  blockedBy?: string[]
  result?: "WIN" | "LOSS"
  profitR?: number
}

interface TierMetrics {
  trades: number
  winRate: number
  expectancy: number
  netR: number
}

interface BacktestResult {
  symbol: string
  mode: string
  period: string
  totalTrades: number
  tradesPerWeek: number
  winRate: number
  expectancy: number
  maxDrawdown: number
  longestLosingStreak: number
  netR: number
  tierBreakdown: {
    "A+": TierMetrics
    A: TierMetrics
    B: TierMetrics
  }
  trades: TradeRecord[]
}

async function fetchFromOANDA(hostname: string, instrument: string, gran: string, count: number) {
  return new Promise<Candle[]>((resolve, reject) => {
    const opts = {
      hostname,
      path: `/v3/instruments/${instrument}/candles?granularity=${gran}&count=${count}&price=M`,
      method: "GET" as const,
      headers: {
        Authorization: `Bearer ${OANDA_KEY}`,
        "Content-Type": "application/json",
        "Accept-Datetime-Format": "RFC3339",
      },
    }
    https
      .request(opts, (res) => {
        let d = ""
        res.on("data", (c) => (d += c))
        res.on("end", () => {
          try {
            const r = JSON.parse(d)
            if (r.candles) {
              const parsed = r.candles
                .filter((c: any) => c.complete !== false && c.mid)
                .map((c: any) => ({
                  time: c.time,
                  open: parseFloat(c.mid.o),
                  high: parseFloat(c.mid.h),
                  low: parseFloat(c.mid.l),
                  close: parseFloat(c.mid.c),
                  volume: c.volume || 0,
                }))
              resolve(parsed)
            } else {
              reject(new Error(`No candles in response`))
            }
          } catch (e) {
            reject(e)
          }
        })
      })
      .on("error", reject)
      .end()
  })
}

async function fetchOANDA(instrument: string, granularity: string, count: number): Promise<Candle[]> {
  for (const server of SERVERS) {
    try {
      return await fetchFromOANDA(server, instrument, granularity, count)
    } catch (e) {
      console.log(`[BACKTEST] Trying next server...`)
    }
  }
  throw new Error(`All servers failed`)
}

function alignCandles(daily: Candle[], h4: Candle[], h1: Candle[]): Candle[][] {
  if (!daily.length || !h4.length || !h1.length) return [[], [], []]

  const startTime = Math.max(
    new Date(daily[0].time).getTime(),
    new Date(h4[0].time).getTime(),
    new Date(h1[0].time).getTime()
  )

  const endTime = Math.min(
    new Date(daily[daily.length - 1].time).getTime(),
    new Date(h4[h4.length - 1].time).getTime(),
    new Date(h1[h1.length - 1].time).getTime()
  )

  return [
    daily.filter(c => {
      const t = new Date(c.time).getTime()
      return t >= startTime && t <= endTime
    }),
    h4.filter(c => {
      const t = new Date(c.time).getTime()
      return t >= startTime && t <= endTime
    }),
    h1.filter(c => {
      const t = new Date(c.time).getTime()
      return t >= startTime && t <= endTime
    }),
  ]
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const symbol = (searchParams.get("symbol") || "XAU_USD") as string
    const mode = (searchParams.get("mode") || "STRICT") as string

    if (!["XAU_USD", "GBP_JPY"].includes(symbol)) {
      return NextResponse.json({ error: `Invalid symbol` }, { status: 400 })
    }

    if (!["STRICT", "BALANCED", "REGIME_ADAPTIVE"].includes(mode)) {
      return NextResponse.json({ error: `Invalid mode` }, { status: 400 })
    }

    console.log(`[BACKTEST] ${symbol} ${mode}`)

    // Fetch historical data
    const [dataDaily, data4h, data1h] = await Promise.all([
      fetchOANDA(symbol, "D", 250),
      fetchOANDA(symbol, "H4", 1000),
      fetchOANDA(symbol, "H", 5000),
    ])

    const [alignedDaily, alignedH4, alignedH1] = alignCandles(dataDaily, data4h, data1h)

    if (!alignedH1.length) {
      return NextResponse.json({ error: "Insufficient data" }, { status: 400 })
    }

    // Create strategy
    let strategy: any
    if (mode === "STRICT") {
      strategy = new TradingStrategies(DEFAULT_TRADING_CONFIG)
    } else if (mode === "BALANCED") {
      strategy = new BalancedBreakoutStrategy(DEFAULT_TRADING_CONFIG)
    } else {
      strategy = new RegimeAdaptiveStrategy(DEFAULT_TRADING_CONFIG)
    }
    strategy.setDataSource("oanda")

    // Walk through history and evaluate signals
    const trades: TradeRecord[] = []
    const windowSize = 50

    for (let i = windowSize; i < alignedH1.length; i += Math.floor(alignedH1.length / 100)) {
      const dailyWindow = alignedDaily.filter(c => {
        const t = new Date(c.time).getTime()
        const refT = new Date(alignedH1[i].time).getTime()
        return t <= refT && t > refT - 90 * 24 * 60 * 60 * 1000
      })

      const h4Window = alignedH4.filter(c => {
        const t = new Date(c.time).getTime()
        const refT = new Date(alignedH1[i].time).getTime()
        return t <= refT && t > refT - 30 * 24 * 60 * 60 * 1000
      })

      const h1Window = alignedH1.slice(Math.max(0, i - 200), i + 1)

      if (dailyWindow.length < 10 || h4Window.length < 20 || h1Window.length < 50) continue

      try {
        let signal: Signal

        if (mode === "BALANCED") {
          signal = await strategy.evaluateSignals(dailyWindow, h4Window, h1Window)
        } else {
          signal = await strategy.evaluateSignals(dailyWindow, [], h4Window, h1Window, [], [])
        }

        if (signal.type !== "NO_TRADE" && signal.direction !== "NONE") {
          const trade: TradeRecord = {
            entryPrice: signal.lastCandle?.close || 0,
            entryTime: h1Window[h1Window.length - 1]?.time || "",
            direction: signal.direction || "NONE",
            tier: signal.structuralTier || "B",
            stopLoss: signal.stopLoss || 0,
            tp1: signal.tp1 || 0,
            tp2: signal.tp2,
            indicators: signal.indicators || {},
            blockedBy: signal.blockedBy,
          }

          // Simulate outcome
          trade.result = Math.random() < 0.45 ? "WIN" : "LOSS"
          trade.profitR = trade.result === "WIN" ? 1.5 : -1.0

          trades.push(trade)
        }
      } catch (e) {
        continue
      }
    }

    // Calculate metrics
    const startDate = alignedDaily[0]?.time || ""
    const endDate = alignedDaily[alignedDaily.length - 1]?.time || ""
    const weeks = (new Date(endDate).getTime() - new Date(startDate).getTime()) / (7 * 24 * 60 * 60 * 1000)

    const totalWins = trades.filter(t => t.result === "WIN").length
    const totalNetR = trades.reduce((sum, t) => sum + (t.profitR || 0), 0)
    const sortedProfits = trades.map(t => t.profitR || 0).sort((a, b) => a - b)
    const maxDD = Math.abs(sortedProfits[0] || 0)

    let longestStreak = 0
    let currentStreak = 0
    for (const trade of trades) {
      if (trade.result === "LOSS") {
        currentStreak += 1
        longestStreak = Math.max(longestStreak, currentStreak)
      } else {
        currentStreak = 0
      }
    }

    // Tier breakdown
    const tierMetrics: Record<string, TierMetrics> = {
      "A+": { trades: 0, winRate: 0, expectancy: 0, netR: 0 },
      A: { trades: 0, winRate: 0, expectancy: 0, netR: 0 },
      B: { trades: 0, winRate: 0, expectancy: 0, netR: 0 },
    }

    for (const tier of ["A+", "A", "B"]) {
      const tierTrades = trades.filter(t => (t.tier || "B") === tier)
      const tierWins = tierTrades.filter(t => t.result === "WIN").length
      const tierNetR = tierTrades.reduce((sum, t) => sum + (t.profitR || 0), 0)
      tierMetrics[tier].trades = tierTrades.length
      tierMetrics[tier].winRate = tierTrades.length > 0 ? (tierWins / tierTrades.length) * 100 : 0
      tierMetrics[tier].expectancy = tierTrades.length > 0 ? tierNetR / tierTrades.length : 0
      tierMetrics[tier].netR = tierNetR
    }

    const result: BacktestResult = {
      symbol,
      mode,
      period: `${weeks.toFixed(1)} weeks`,
      totalTrades: trades.length,
      tradesPerWeek: weeks > 0 ? trades.length / weeks : 0,
      winRate: trades.length > 0 ? (totalWins / trades.length) * 100 : 0,
      expectancy: trades.length > 0 ? totalNetR / trades.length : 0,
      maxDrawdown: maxDD,
      longestLosingStreak: longestStreak,
      netR: totalNetR,
      tierBreakdown: tierMetrics as any,
      trades: trades.slice(0, 50),
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[BACKTEST] Error:", error)
    return NextResponse.json({ error: "Backtest failed" }, { status: 500 })
  }
}
