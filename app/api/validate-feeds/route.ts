import { NextResponse } from "next/server"
import { DataFetcher } from "@/lib/data-fetcher"
import { TRADING_SYMBOLS } from "@/lib/symbol-config"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Validation endpoint for price feeds
 * Tests all three symbols across all 6 timeframes
 * Checks for null data, NaN ADX, and data completeness before enabling live alerts
 */
export async function GET(request: Request) {
  try {
    const results: any = {
      validatedAt: new Date().toISOString(),
      symbols: {},
      systemReady: false,
      issues: [],
    }

    // Test all three trading symbols
    for (const symbol of TRADING_SYMBOLS) {
      try {
        console.log(`[VALIDATE_FEEDS] Testing ${symbol}...`)
        
        const data = await DataFetcher.getLatestPrice(symbol)
        
        // Validate all 6 timeframes exist
        const timeframes = {
          daily: data.dailyCandles?.length || 0,
          h8: data.h8Candles?.length || 0,
          h4: data.h4Candles?.length || 0,
          h1: data.h1Candles?.length || 0,
          m15: data.m15Candles?.length || 0,
          m5: data.m5Candles?.length || 0,
        }

        // Check for null prices and NaN ADX
        const dailyCandles = data.dailyCandles || []
        const h4Candles = data.h4Candles || []
        const h1Candles = data.h1Candles || []

        const issues: string[] = []
        let hasNullData = false
        let hasNaNADX = false

        // Check for null close prices
        for (const tf of [dailyCandles, h4Candles, h1Candles]) {
          for (const candle of tf.slice(-20)) {
            if (!candle || candle.close === null || candle.close === undefined) {
              hasNullData = true
            }
            if (isNaN(candle.adx || 0)) {
              hasNaNADX = true
            }
          }
        }

        if (hasNullData) issues.push("Null price data detected in recent candles")
        if (hasNaNADX) issues.push("NaN ADX detected - synthetic fallback may be in use")

        // Check all timeframes have minimum data
        const minCandles: Record<string, number> = { daily: 50, h8: 100, h4: 100, h1: 100, m15: 100, m5: 100 }
        for (const [tf, required] of Object.entries(minCandles)) {
          if (timeframes[tf as keyof typeof timeframes] < required) {
            issues.push(`${tf}: only ${timeframes[tf as keyof typeof timeframes]} candles (need ${required})`)
          }
        }

        results.symbols[symbol] = {
          status: issues.length === 0 ? "✅ READY" : "❌ ISSUES",
          timeframes: timeframes,
          allTimeframesPresent: Object.values(timeframes).every(c => c > 0),
          latestPrice: data.closePrice?.toFixed(2),
          hasNullData,
          hasNaNADX,
          issues,
          source: data.source || "unknown",
        }

        console.log(`[VALIDATE_FEEDS] ${symbol}: ${issues.length === 0 ? "✅ READY" : "❌ ISSUES"} | Issues: ${issues.join(", ") || "None"}`)
      } catch (error) {
        results.symbols[symbol] = {
          status: "❌ ERROR",
          error: error instanceof Error ? error.message : String(error),
          issues: ["Failed to fetch price data"],
        }
        results.issues.push(`${symbol} failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    // System ready if all symbols ready
    const allReady = Object.values(results.symbols).every((s: any) => s.status === "✅ READY")
    results.systemReady = allReady

    if (!allReady) {
      results.issues.push("Not all symbols are ready for live trading - see details above")
      results.recommendation = "Review failed symbols before enabling live alerts on US100/US500"
    } else {
      results.recommendation = "All feeds validated - safe to enable live alerts on all three symbols"
    }

    return NextResponse.json(results)
  } catch (error) {
    console.error("[VALIDATE_FEEDS] Critical error:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
        validatedAt: new Date().toISOString(),
        systemReady: false,
      },
      { status: 500 }
    )
  }
}
