import { NextResponse } from "next/server"
import { getLastSignalDebug } from "@/lib/strategies"

export async function GET() {
  try {
    const debugInfo = getLastSignalDebug()

    const dataSourceExplanation = {
      source: "OANDA Live Data",
      howItWorks: [
        "All timeframes are REAL data from OANDA API",
        "5M, 15M, 1H, 4H, 8H, Daily candles fetched live",
        "Real-time breakout detection across all timeframes",
      ],
      whatItDetects: [
        "Real-time 5M/15M breakouts and retests",
        "1H/4H trend direction and momentum",
        "Daily support/resistance levels",
        "Multi-timeframe alignment for high-probability entries",
      ],
      recommendation: "System detects real breakouts - trade signals directly.",
    }

    let summary = ""
    if (debugInfo) {
      const { mtfBias, marketRegime, chopScore, price } = debugInfo
      const longCount = Object.values(mtfBias || {}).filter((b) => b === "LONG").length
      const shortCount = Object.values(mtfBias || {}).filter((b) => b === "SHORT").length

      summary = `Price: $${price?.toFixed(2) || "N/A"} | Regime: ${marketRegime} | Chop: ${chopScore}/100 | Bias: ${longCount} LONG / ${shortCount} SHORT`

      if (chopScore >= 50) {
        summary += " | Status: CHOPPY - No trades recommended"
      } else if (longCount >= 4) {
        summary += " | Status: BULLISH ALIGNMENT - Looking for LONG entries"
      } else if (shortCount >= 4) {
        summary += " | Status: BEARISH ALIGNMENT - Looking for SHORT entries"
      } else {
        summary += " | Status: MIXED - Waiting for alignment"
      }
    }

    return NextResponse.json({
      success: true,
      summary,
      lastSignalCheck: debugInfo,
      dataSource: "oanda",
      dataSourceInfo: dataSourceExplanation,
      tradingGuidance: {
        bestFor: "All timeframe trades - from 5M scalps to Daily swings",
        howToUse: [
          "1. Wait for 4+ timeframes to align LONG or SHORT",
          "2. System detects real breakouts on all timeframes",
          "3. A+ setups (5/6 TF + ADX >= 23) target 2R",
          "4. Standard setups (4/6 TF) use scaled exits at 1R and 1.5R",
        ],
      },
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
