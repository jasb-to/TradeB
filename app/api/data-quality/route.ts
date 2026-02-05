import { NextResponse } from "next/server"
import { DataFetcher } from "@/lib/data-fetcher"
import { DataQualityMonitor } from "@/lib/data-quality-monitor"
import { TechnicalAnalysis } from "@/lib/indicators"
import { SignalCache } from "@/lib/signal-cache"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const symbol = (searchParams.get("symbol") || "XAU_USD") as "XAU_USD" | "XAG_USD"

    const dataFetcher = new DataFetcher(symbol)

    // Fetch current candles
    const [data1h, data4h, dataDaily] = await Promise.all([
      dataFetcher.fetchCandles("1h", 200),
      dataFetcher.fetchCandles("4h", 200),
      dataFetcher.fetchCandles("1d", 100),
    ])

    // Calculate indicators
    const indicators1h = TechnicalAnalysis.calculateAllIndicators(data1h.candles)
    const indicators4h = TechnicalAnalysis.calculateAllIndicators(data4h.candles)
    const indicatorsDaily = TechnicalAnalysis.calculateAllIndicators(dataDaily.candles)

    // Get cache ages
    const signalCacheAge = Date.now() - SignalCache.getTimestamp(symbol)

    // Generate quality reports
    const report1h = DataQualityMonitor.generateQualityReport(
      data1h.candles,
      indicators1h,
      symbol,
      0, // OANDA cache is fresh
      signalCacheAge,
    )

    const report4h = DataQualityMonitor.generateQualityReport(
      data4h.candles,
      indicators4h,
      symbol,
      0,
      signalCacheAge,
    )

    const reportDaily = DataQualityMonitor.generateQualityReport(
      dataDaily.candles,
      indicatorsDaily,
      symbol,
      0,
      signalCacheAge,
    )

    return NextResponse.json({
      success: true,
      symbol,
      timestamp: new Date().toISOString(),
      dataQuality: {
        "1h": report1h,
        "4h": report4h,
        daily: reportDaily,
      },
      indicatorValues: {
        "1h": indicators1h,
        "4h": indicators4h,
        daily: indicatorsDaily,
      },
      currentPrice: data1h.candles[data1h.candles.length - 1]?.close || 0,
      overallHealthScore: (report1h.overallScore + report4h.overallScore + reportDaily.overallScore) / 3,
    })
  } catch (error) {
    console.error("[v0] Data quality check error:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
