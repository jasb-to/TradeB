import { NextResponse } from "next/server"
import { BTradeTracker } from "@/lib/b-trade-tracker"

const TRADING_SYMBOLS = ["XAU", "XAG"]

export async function GET() {
  try {
    const symbols = TRADING_SYMBOLS.map((symbol) => {
      const stats = BTradeTracker.getStats(symbol)
      const recent = BTradeTracker.getRecent(symbol, 5)

      return {
        symbol,
        stats: {
          count24h: stats.count24h,
          totalRecorded: stats.totalRecorded,
          directionalBias: stats.directionalBias,
          upgradedToA: stats.upgradedToA,
          upgradedToAPlus: stats.upgradedToAPlus,
          mostCommonBlocker: stats.mostCommonBlocker,
          avgIndicatorGap: {
            adx: stats.avgIndicatorGap.adx.toFixed(2),
            rsi: stats.avgIndicatorGap.rsi.toFixed(2),
            atr: stats.avgIndicatorGap.atr.toFixed(2),
          },
        },
        recentBSetups: recent.map((r) => ({
          timestamp: new Date(r.timestamp).toISOString(),
          direction: r.direction,
          classification: r.classification,
          blockersCount: r.blockersCount,
          primaryBlocker: r.mostCommonBlocker,
          indicatorGaps: {
            adx: r.indicatorGaps.adxGap.toFixed(2),
            rsi: r.indicatorGaps.rsiGap.toFixed(2),
            atr: r.indicatorGaps.atrGap.toFixed(2),
          },
          upgraded: r.upgradeTime ? `Yes (${r.upgradeReason})` : "No",
        })),
      }
    })

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      disclaimer:
        "B-SETUPS ARE DIAGNOSTIC ONLY. NOT trade signals. Used to track early structure recognition.",
      symbols,
    })
  } catch (error) {
    console.error("[v0] B-TRADE API ERROR:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
