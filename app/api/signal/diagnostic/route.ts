import { TradingStrategies } from "@/lib/strategies"
import { SignalCache } from "@/lib/signal-cache"
import { DEFAULT_TRADING_CONFIG } from "@/lib/default-config"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const symbol = searchParams.get("symbol") || "XAU_USD"

  const diagnostics: string[] = []
  diagnostics.push(`\n🔥 SIGNAL DIAGNOSTIC ROUTE - Symbol: ${symbol}`)

  try {
    const strategies = new TradingStrategies(DEFAULT_TRADING_CONFIG)
    
    // Step 1: Get market data
    diagnostics.push(`\n[STEP 1] Loading market data...`)

    const dataDaily = await (await fetch(
      `https://api-fxpractice.oanda.com/v3/instruments/XAU_USD/candles?count=100&granularity=D&price=MBA`,
      {
        headers: {
          Authorization: `Bearer ${process.env.OANDA_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    )).json()

    const data1h = await (await fetch(
      `https://api-fxpractice.oanda.com/v3/instruments/XAU_USD/candles?count=200&granularity=H1&price=MBA`,
      {
        headers: {
          Authorization: `Bearer ${process.env.OANDA_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    )).json()

    // Safe defaults for missing candles
    const dailyCandles = dataDaily?.candles || []
    const hourlyCandles = data1h?.candles || []

    diagnostics.push(`✓ Loaded ${dailyCandles?.length ?? 0} daily candles`)
    diagnostics.push(`✓ Loaded ${hourlyCandles?.length ?? 0} 1h candles`)

    // Guard: Skip evaluation if candles are missing
    if (!dailyCandles.length || !hourlyCandles.length) {
      diagnostics.push(`\n❌ ERROR: Not enough market data to evaluate signals`)
      diagnostics.push(`Daily candles: ${dailyCandles.length} | 1H candles: ${hourlyCandles.length}`)
      return new Response(JSON.stringify(diagnostics, null, 2), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    // Step 2: Evaluate signals
    diagnostics.push(`\n[STEP 2] Evaluating signals...`)
    const rawSignal = await strategies.evaluateSignals(
      dailyCandles,
      dailyCandles, // mock 8h
      dailyCandles, // mock 4h
      hourlyCandles,
      hourlyCandles, // mock 15m
      hourlyCandles // mock 5m
    )

    diagnostics.push(`Raw signal object keys: ${Object.keys(rawSignal).join(", ")}`)
    diagnostics.push(`Raw signal.type: ${rawSignal.type}`)
    diagnostics.push(`Raw signal.direction: ${rawSignal.direction}`)
    diagnostics.push(`Raw signal.structuralTier: ${(rawSignal as any).structuralTier}`)
    diagnostics.push(`Raw signal.reasons[0]: ${rawSignal.reasons?.[0] || "N/A"}`)

    // Step 3: Build entry decision
    diagnostics.push(`\n[STEP 3] Building entry decision...`)
    const entryDecision = strategies.buildEntryDecision(rawSignal)

    diagnostics.push(`Entry decision returned:`)
    diagnostics.push(`  - tier: ${entryDecision.tier}`)
    diagnostics.push(`  - approved: ${entryDecision.approved}`)
    diagnostics.push(`  - score: ${entryDecision.score}`)

    // Step 4: Enhance signal
    diagnostics.push(`\n[STEP 4] Enhancing signal...`)
    const enhancedSignal = {
      ...rawSignal,
      entryDecision,
    }

    diagnostics.push(`Enhanced signal.structuralTier: ${(enhancedSignal as any).structuralTier}`)
    diagnostics.push(`Enhanced signal.entryDecision.tier: ${enhancedSignal.entryDecision.tier}`)

    // Step 5: Alert flow
    diagnostics.push(`\n[STEP 5] Alert flow diagnostics...`)
    const fingerprint = [
      enhancedSignal.direction,
      enhancedSignal.entryDecision.tier,
      Math.round((enhancedSignal as any).entryPrice || 0),
    ].join("|")

    diagnostics.push(`Alert fingerprint: ${fingerprint}`)

    // Check alert conditions
    let alertCheck = null
    try {
      alertCheck = SignalCache.canAlertSetup(rawSignal, symbol, fingerprint)
      diagnostics.push(`Alert check result: ${JSON.stringify(alertCheck)}`)
    } catch (err) {
      diagnostics.push(`Alert check error: ${err}`)
    }

    // Step 6: Summary
    diagnostics.push(`\n[SUMMARY]`)
    diagnostics.push(`Signal Type: ${rawSignal.type}`)
    diagnostics.push(`Structural Tier (raw): ${(rawSignal as any).structuralTier}`)
    diagnostics.push(`Entry Decision Tier: ${entryDecision.tier}`)
    diagnostics.push(`Enhanced Signal Tier: ${(enhancedSignal as any).structuralTier}`)
    diagnostics.push(`Alert Would Fire: ${alertCheck?.allowed ? "YES" : "NO"}`)

    if (rawSignal.type === "ENTRY" && entryDecision.tier === "NO_TRADE") {
      diagnostics.push(`\n⚠️ WARNING: Signal is ENTRY but tier is NO_TRADE!`)
    }

    if (!rawSignal.reasons?.some((r) => r.includes("TIER B"))) {
      diagnostics.push(`\n✓ No B tier detected in reasons`)
    } else {
      diagnostics.push(`\n✓ B tier DETECTED in reasons`)
    }

    diagnostics.push(`\n🔥 DIAGNOSTIC COMPLETE\n`)

    return new Response(JSON.stringify(diagnostics, null, 2), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  } catch (error) {
    diagnostics.push(`\nERROR: ${error}`)
    return new Response(JSON.stringify(diagnostics, null, 2), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
}
