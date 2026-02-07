import { NextResponse } from "next/server"
import { DataFetcher } from "@/lib/data-fetcher"
import { TradingStrategies } from "@/lib/strategies"
import { DEFAULT_TRADING_CONFIG } from "@/lib/default-config"
import { MarketHours } from "@/lib/market-hours"
import { SignalCache } from "@/lib/signal-cache"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

let lastValidSignals: { [key: string]: any } = {
  XAU_USD: null,
  XAG_USD: null,
}
let lastValidTimestamps: { [key: string]: string | null } = {
  XAU_USD: null,
  XAG_USD: null,
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const symbol = (searchParams.get("symbol") || "XAU_USD") as "XAU_USD" | "XAG_USD"

    const marketStatus = MarketHours.getMarketStatus()

    const dataFetcher = new DataFetcher(symbol)
    const strategies = new TradingStrategies(DEFAULT_TRADING_CONFIG)

    strategies.setDataSource("oanda")

    let dataDaily, data8h, data4h, data1h, data15m, data5m

    try {
      dataDaily = await dataFetcher.fetchCandles("1d", 100)
      data8h = await dataFetcher.fetchCandles("8h", 150)
      data4h = await dataFetcher.fetchCandles("4h", 200)
      data1h = await dataFetcher.fetchCandles("1h", 200)

      const [result15m, result5m] = await Promise.allSettled([
        dataFetcher.fetchCandles("15m", 200),
        dataFetcher.fetchCandles("5m", 200),
      ])

      data15m = result15m.status === "fulfilled" ? result15m.value : { candles: [], source: "oanda" as const }
      data5m = result5m.status === "fulfilled" ? result5m.value : { candles: [], source: "oanda" as const }

      console.log(
        `[v0] Data loaded: Daily=${dataDaily.candles.length}, 4H=${data4h.candles.length}, 1H=${data1h.candles.length}, 15M=${data15m.candles.length}, 5M=${data5m.candles.length} (source: OANDA)`,
      )
    } catch (fetchError) {
      console.error("Error fetching candle data:", fetchError)
      return NextResponse.json(
        {
          success: false,
          error: "Failed to fetch market data. Please check OANDA API configuration.",
          details: fetchError instanceof Error ? fetchError.message : "Unknown fetch error",
        },
        { status: 500 },
      )
    }

    const lastDailyCandle = dataDaily.candles?.[dataDaily.candles.length - 1]
    const last1hCandle = data1h.candles?.[data1h.candles.length - 1]

    // Build MTF bias from latest candle directions
    const mtfBias = {
      daily: (lastDailyCandle?.close
        ? lastDailyCandle.close > (dataDaily.candles?.[dataDaily.candles.length - 2]?.close || 0)
          ? "LONG"
          : "SHORT"
        : "NEUTRAL") as "LONG" | "SHORT" | "NEUTRAL",
      "8h": (data8h.candles?.length
        ? data8h.candles[data8h.candles.length - 1].close > (data8h.candles[data8h.candles.length - 2]?.close || 0)
          ? "LONG"
          : "SHORT"
        : "NEUTRAL") as "LONG" | "SHORT" | "NEUTRAL",
      "4h": (data4h.candles?.length
        ? data4h.candles[data4h.candles.length - 1].close > (data4h.candles[data4h.candles.length - 2]?.close || 0)
          ? "LONG"
          : "SHORT"
        : "NEUTRAL") as "LONG" | "SHORT" | "NEUTRAL",
      "1h": (last1hCandle?.close
        ? last1hCandle.close > (data1h.candles?.[data1h.candles.length - 2]?.close || 0)
          ? "LONG"
          : "SHORT"
        : "NEUTRAL") as "LONG" | "SHORT" | "NEUTRAL",
      "15m": (data15m.candles?.length
        ? data15m.candles[data15m.candles.length - 1].close > (data15m.candles[data15m.candles.length - 2]?.close || 0)
          ? "LONG"
          : "SHORT"
        : "NEUTRAL") as "LONG" | "SHORT" | "NEUTRAL",
      "5m": (data5m.candles?.length
        ? data5m.candles[data5m.candles.length - 1].close > (data5m.candles[data5m.candles.length - 2]?.close || 0)
          ? "LONG"
          : "SHORT"
        : "NEUTRAL") as "LONG" | "SHORT" | "NEUTRAL",
    }

    if (!marketStatus.isOpen) {
      if (lastValidSignals[symbol] && lastValidTimestamps[symbol]) {
        // Ensure cached signal has entryDecision when market is closed
        if (!lastValidSignals[symbol].entryDecision) {
          const strategies = new TradingStrategies(DEFAULT_TRADING_CONFIG)
          lastValidSignals[symbol].entryDecision = strategies.buildEntryDecision(lastValidSignals[symbol])
        }
        return NextResponse.json({
          success: true,
          signal: lastValidSignals[symbol],
          timestamp: lastValidTimestamps[symbol],
          marketClosed: true,
          marketStatus: marketStatus.message,
          mtfBias: mtfBias,
        })
      }

      return NextResponse.json(
        {
          success: false,
          error: marketStatus.message,
          marketClosed: true,
          nextOpen: marketStatus.nextOpen,
        },
        { status: 503 },
      )
    }

    const cached = SignalCache.get(symbol)
    if (cached) {
      // Ensure cached signal has entryDecision when returned
      if (!cached.entryDecision) {
        const strategies = new TradingStrategies(DEFAULT_TRADING_CONFIG)
        cached.entryDecision = strategies.buildEntryDecision(cached)
      }
      return NextResponse.json({
        success: true,
        signal: cached,
        timestamp: new Date(SignalCache.getTimestamp(symbol)).toISOString(),
        marketClosed: false,
        cached: true,
        mtfBias: mtfBias,
      })
    }

    if (!dataDaily?.candles?.length || !data1h?.candles?.length) {
      return NextResponse.json(
        {
          success: false,
          error: "Insufficient market data available",
        },
        { status: 503 },
      )
    }

    const signal = await strategies.evaluateSignals(
      dataDaily.candles,
      data8h.candles,
      data4h.candles,
      data1h.candles,
      data15m.candles,
      data5m.candles,
    )

    // Calculate ATR-based trade setup for LONG/SHORT signals
    const atr = signal.indicators?.atr || 1.0
    const entryPrice = last1hCandle?.close || 0
    const stopLoss = signal.direction === "LONG" ? entryPrice - atr * 1.5 : entryPrice + atr * 1.5
    const takeProfit1 = signal.direction === "LONG" ? entryPrice + atr * 1.5 : entryPrice - atr * 1.5
    const takeProfit2 = signal.direction === "LONG" ? entryPrice + atr * 2.5 : entryPrice - atr * 2.5

    // Enhance signal with last candle data and trade setup for client display
    const enhancedSignal = {
      ...signal,
      indicators: signal.indicators, // CRITICAL: Include full indicators object
      mtfBias,
      entryPrice: signal.direction ? entryPrice : undefined,
      stopLoss: signal.direction ? stopLoss : undefined,
      takeProfit1: signal.direction ? takeProfit1 : undefined,
      takeProfit2: signal.direction ? takeProfit2 : undefined,
      riskReward: signal.direction ? Number(((takeProfit2 - entryPrice) / Math.abs(entryPrice - stopLoss)).toFixed(2)) : undefined,
      lastCandle: last1hCandle
        ? {
            close: last1hCandle.close,
            atr: signal.indicators?.atr,
            adx: signal.indicators?.adx,
            stochRSI: signal.indicators?.stochRSI,
            vwap: signal.indicators?.vwap,
            timestamp: last1hCandle.timestamp,
          }
        : undefined,
    }

    // Build entry decision (canonical source of truth for entry criteria)
    const entryDecision = strategies.buildEntryDecision(enhancedSignal)
    enhancedSignal.entryDecision = entryDecision

    // DEBUG: Log what's being sent to client
    console.log("[v0] API Response - stochRSI Debug:", {
      stochRSI_raw: signal.indicators?.stochRSI,
      stochRSI_in_enhanced: enhancedSignal.indicators?.stochRSI,
      adx: enhancedSignal.indicators?.adx,
      atr: enhancedSignal.indicators?.atr,
      indicators_exists: !!enhancedSignal.indicators,
    })

    SignalCache.set(enhancedSignal, symbol)

    lastValidSignals[symbol] = enhancedSignal
    lastValidTimestamps[symbol] = new Date().toISOString()

    return NextResponse.json({
      success: true,
      signal: enhancedSignal,
      timestamp: lastValidTimestamps[symbol],
      marketClosed: false,
      dataSource: "oanda",
    })
  } catch (error) {
    console.error("Error in signal/current route:", error)

    return NextResponse.json(
      {
        success: false,
        error: "Internal server error while generating signal",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
