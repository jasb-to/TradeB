import { NextResponse } from "next/server"
import { SynchronizationMonitor } from "@/lib/synchronization-monitor"
import { DataQualityMonitor } from "@/lib/data-quality-monitor"
import { DataFetcher } from "@/lib/data-fetcher"
import { TechnicalAnalysis } from "@/lib/indicators"
import { SignalCache } from "@/lib/signal-cache"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * DIAGNOSTIC ENDPOINT: /api/diagnostics
 *
 * Returns comprehensive system health report including:
 * - Data synchronization status
 * - Indicator calculation freshness
 * - Cache ages and validity
 * - Real-time indicator values
 * - Recommendations for any issues
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const symbol = (searchParams.get("symbol") || "XAU_USD") as "XAU_USD" | "XAG_USD"

    const diagnosticStartTime = Date.now()

    // Record diagnostic start
    SynchronizationMonitor.recordCheckpoint(symbol, "DIAGNOSTIC_START", "initiated", 0)

    const dataFetcher = new DataFetcher(symbol)

    // Fetch all timeframes
    const fetchStartTime = Date.now()
    const [data1h, data4h, dataDaily] = await Promise.all([
      dataFetcher.fetchCandles("1h", 200),
      dataFetcher.fetchCandles("4h", 200),
      dataFetcher.fetchCandles("1d", 100),
    ])
    const fetchDuration = Date.now() - fetchStartTime

    SynchronizationMonitor.recordCheckpoint(symbol, "OANDA_FETCH", `${data1h.candles.length}/${data4h.candles.length}/${dataDaily.candles.length}`, fetchDuration)

    // Calculate indicators
    const calcStartTime = Date.now()
    const indicators1h = TechnicalAnalysis.calculateAllIndicators(data1h.candles, { symbol })
    const indicators4h = TechnicalAnalysis.calculateAllIndicators(data4h.candles, { symbol })
    const indicatorsDaily = TechnicalAnalysis.calculateAllIndicators(dataDaily.candles, { symbol })
    const calcDuration = Date.now() - calcStartTime

    SynchronizationMonitor.recordCheckpoint(symbol, "INDICATOR_CALC", `ADX:${indicators1h.adx?.toFixed(1)} RSI:${indicators1h.rsi?.toFixed(1)}`, calcDuration)

    // Generate quality reports
    const signalCacheAge = Date.now() - SignalCache.getTimestamp(symbol)

    const quality1h = DataQualityMonitor.generateQualityReport(
      data1h.candles,
      indicators1h,
      symbol,
      fetchDuration,
      signalCacheAge,
    )

    const quality4h = DataQualityMonitor.generateQualityReport(
      data4h.candles,
      indicators4h,
      symbol,
      fetchDuration,
      signalCacheAge,
    )

    const qualityDaily = DataQualityMonitor.generateQualityReport(
      dataDaily.candles,
      indicatorsDaily,
      symbol,
      fetchDuration,
      signalCacheAge,
    )

    // Get sync report
    const syncReport = SynchronizationMonitor.generateSyncReport(symbol)

    // Calculate latencies
    const candleToIndicatorLatency = SynchronizationMonitor.getLatencyBetweenCheckpoints(
      symbol,
      "OANDA_FETCH",
      "INDICATOR_CALC",
    )

    const totalDuration = Date.now() - diagnosticStartTime

    SynchronizationMonitor.recordCheckpoint(symbol, "DIAGNOSTIC_COMPLETE", `health:${syncReport.overallHealth}`, totalDuration)

    // Build diagnostic response
    const diagnostic = {
      success: true,
      symbol,
      timestamp: new Date().toISOString(),
      executionTime: `${totalDuration}ms`,
      systemHealth: {
        overallHealth: syncReport.overallHealth,
        synchronization: syncReport.overallHealth,
        recommendations: syncReport.recommendations,
        bottlenecks: syncReport.bottlenecks,
      },
      dataQuality: {
        "1h": {
          overallScore: quality1h.overallScore,
          candleQuality: quality1h.candleQuality.qualityScore,
          indicatorQuality: quality1h.indicatorQuality.qualityScore,
          syncQuality: quality1h.synchronizationQuality.qualityScore,
          issues: quality1h.indicatorQuality.issues,
        },
        "4h": {
          overallScore: quality4h.overallScore,
          candleQuality: quality4h.candleQuality.qualityScore,
          indicatorQuality: quality4h.indicatorQuality.qualityScore,
          syncQuality: quality4h.synchronizationQuality.qualityScore,
          issues: quality4h.indicatorQuality.issues,
        },
        daily: {
          overallScore: qualityDaily.overallScore,
          candleQuality: qualityDaily.candleQuality.qualityScore,
          indicatorQuality: qualityDaily.indicatorQuality.qualityScore,
          syncQuality: qualityDaily.synchronizationQuality.qualityScore,
          issues: qualityDaily.indicatorQuality.issues,
        },
      },
      indicators: {
        "1h": {
          adx: indicators1h.adx,
          atr: indicators1h.atr,
          rsi: indicators1h.rsi,
          stochRSI: indicators1h.stochRSI,
          vwap: indicators1h.vwap,
          ema20: indicators1h.ema20,
          ema50: indicators1h.ema50,
          ema200: indicators1h.ema200,
        },
        "4h": {
          adx: indicators4h.adx,
          atr: indicators4h.atr,
          rsi: indicators4h.rsi,
          stochRSI: indicators4h.stochRSI,
          vwap: indicators4h.vwap,
          ema20: indicators4h.ema20,
          ema50: indicators4h.ema50,
          ema200: indicators4h.ema200,
        },
        daily: {
          adx: indicatorsDaily.adx,
          atr: indicatorsDaily.atr,
          rsi: indicatorsDaily.rsi,
          stochRSI: indicatorsDaily.stochRSI,
          vwap: indicatorsDaily.vwap,
          ema20: indicatorsDaily.ema20,
          ema50: indicatorsDaily.ema50,
          ema200: indicatorsDaily.ema200,
        },
      },
      latencies: {
        oandaFetchMs: fetchDuration,
        indicatorCalcMs: calcDuration,
        candleToIndicatorMs: candleToIndicatorLatency,
        totalMs: totalDuration,
      },
      dataFreshness: {
        oandaCacheAgeMs: fetchDuration,
        signalCacheAgeMs: signalCacheAge,
        indicatorFreshness: syncReport.overallHealth,
      },
      currentPrice: data1h.candles[data1h.candles.length - 1]?.close || 0,
      lastCandle1h: data1h.candles[data1h.candles.length - 1] || null,
    }

    return NextResponse.json(diagnostic)
  } catch (error) {
    console.error("[v0] Diagnostic error:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    )
  }
}
