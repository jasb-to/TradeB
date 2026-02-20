import { NextRequest, NextResponse } from "next/server"
import { DataFetcher } from "@/lib/data-fetcher"
import { StrictStrategyV7 } from "@/lib/strict-strategy-v7"

interface TradeOrderRequest {
  instrument: string
  direction: "BUY" | "SELL"
  units: number
  entryPrice: number
  stopLoss: number
  takeProfit: number
  tier: string // Client tier - NOT TRUSTED
  score: number // Client score - NOT TRUSTED
}

export async function POST(request: NextRequest) {
  try {
    const body: TradeOrderRequest = await request.json()
    
    const { instrument, direction, units, stopLoss, takeProfit } = body
    
    if (!instrument || !direction || !units || !stopLoss || !takeProfit) {
      return NextResponse.json(
        { error: "Missing required fields: instrument, direction, units, stopLoss, takeProfit" },
        { status: 400 }
      )
    }

    // ╔════════════════════════════════════════════════════════════════════╗
    // ║ CRITICAL SECURITY: Recalculate tier server-side                   ║
    // ║ Never trust client-provided tier - always revalidate              ║
    // ╚════════════════════════════════════════════════════════════════════╝
    
    // Fetch fresh candles and recalculate signal
    const fetcher = new DataFetcher(instrument)
    const [daily, h4, h1, m15, m5] = await Promise.all([
      fetcher.fetchCandles("D", 100),
      fetcher.fetchCandles("4H", 200),
      fetcher.fetchCandles("1H", 200),
      fetcher.fetchCandles("15M", 200),
      fetcher.fetchCandles("5M", 200),
    ])

    // Recalculate signal using StrictStrategyV7
    const strategy = new StrictStrategyV7()
    const signal = strategy.evaluate({
      candles: { daily: daily.candles, h4: h4.candles, h1: h1.candles, m15: m15.candles, m5: m5.candles },
      symbol: instrument,
    })

    // Extract server-calculated tier from signal
    const serverTier = (signal as any)?.tier || "NO_TRADE"
    const serverScore = (signal as any)?.score || 0

    // SECURITY CHECK: Verify tier before execution
    if (serverTier === "NO_TRADE") {
      return NextResponse.json(
        {
          error: "TRADE_REJECTED",
          reason: "Server recalculation determined NO_TRADE tier",
          clientTier: body.tier,
          serverTier: serverTier,
          serverScore: serverScore,
          details: "Signal does not meet minimum entry criteria"
        },
        { status: 403 }
      )
    }

    // Server-calculated tier takes precedence
    const executionTier = serverTier
    const executionScore = serverScore

    // Build OANDA-compatible order format
    const order = {
      instrument,
      units: direction === "BUY" ? Math.abs(units) : -Math.abs(units),
      type: "MARKET",
      positionFill: "DEFAULT",
      stopLossOnFill: {
        price: stopLoss.toFixed(2),
      },
      takeProfitOnFill: {
        price: takeProfit.toFixed(2),
      },
      clientExtensions: {
        comment: `Tier ${executionTier} (Score ${executionScore.toFixed(1)}/9) - Server-Validated - v11.0.0-ARCHITECTURAL-RESET`,
        tag: `TIER_${executionTier}`,
      },
    }

    console.log(`[v0] TRADE EXECUTION: instrument=${instrument} tier=${executionTier} score=${executionScore} (client claimed: ${body.tier}/${body.score})`)
    console.log(`[v0] OANDA Order Format:`, JSON.stringify(order, null, 2))

    // In production, send to OANDA v20 API:
    // const response = await fetch(
    //   `https://api-fxlive.oanda.com/v3/accounts/${OANDA_ACCOUNT_ID}/orders`,
    //   {
    //     method: "POST",
    //     headers: {
    //       "Authorization": `Bearer ${OANDA_API_KEY}`,
    //       "Content-Type": "application/json",
    //     },
    //     body: JSON.stringify({ order }),
    //   }
    // )

    return NextResponse.json({
      success: true,
      orderFormat: "OANDA-native",
      validationStatus: "SERVER_RECALCULATED",
      clientTier: body.tier,
      serverTier: executionTier,
      serverScore: executionScore,
      tierValidated: body.tier === executionTier ? "MATCH" : "DISCREPANCY_RESOLVED_SERVER_WINS",
      order,
      message: "Order format validated and server-tier confirmed. Ready for OANDA v20 API submission.",
    })
  } catch (error) {
    console.error("[v0] Trade order error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process trade order" },
      { status: 500 }
    )
  }
}
