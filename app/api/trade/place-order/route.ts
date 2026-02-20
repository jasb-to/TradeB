import { NextRequest, NextResponse } from "next/server"

interface TradeOrderRequest {
  instrument: string
  direction: "BUY" | "SELL"
  units: number
  entryPrice: number
  stopLoss: number
  takeProfit: number
  tier: string
  score: number
}

export async function POST(request: NextRequest) {
  try {
    const body: TradeOrderRequest = await request.json()
    
    const { instrument, direction, units, stopLoss, takeProfit, tier, score } = body
    
    if (!instrument || !direction || !units || !stopLoss || !takeProfit) {
      return NextResponse.json(
        { error: "Missing required fields: instrument, direction, units, stopLoss, takeProfit" },
        { status: 400 }
      )
    }

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
        comment: `Tier ${tier} (Score ${score.toFixed(1)}/9) - v11.0.0-ARCHITECTURAL-RESET`,
        tag: `TIER_${tier}`,
      },
    }

    console.log(`[v0] OANDA Order Format:`, JSON.stringify(order, null, 2))

    // In production, send to OANDA v20 API:
    // const response = await fetch(
    //   `https://api-fxpractice.oanda.com/v3/accounts/${OANDA_ACCOUNT_ID}/orders`,
    //   {
    //     method: "POST",
    //     headers: {
    //      "Authorization": `Bearer ${OANDA_API_KEY}`,
    //       "Content-Type": "application/json",
    //     },
    //     body: JSON.stringify({ order }),
    //   }
    // )

    return NextResponse.json({
      success: true,
      orderFormat: "OANDA-native",
      order,
      message: "Order format validated. Ready for OANDA v20 API submission.",
    })
  } catch (error) {
    console.error("[v0] Trade order error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process trade order" },
      { status: 500 }
    )
  }
}
