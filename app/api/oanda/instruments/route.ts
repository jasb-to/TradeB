import { NextResponse } from "next/server"

const OANDA_API_KEY = process.env.OANDA_API_KEY
const OANDA_ACCOUNT_ID = process.env.OANDA_ACCOUNT_ID
const OANDA_ENVIRONMENT = process.env.OANDA_ENVIRONMENT || "practice"

const getOandaUrl = () => {
  if (OANDA_ENVIRONMENT === "live") {
    return "https://api-fxtrade.oanda.com"
  }
  return "https://api-fxpractice.oanda.com"
}

export async function GET() {
  try {
    // Validate credentials
    if (!OANDA_API_KEY || !OANDA_ACCOUNT_ID) {
      return NextResponse.json(
        {
          success: false,
          error: "OANDA credentials not configured",
          details: "Missing OANDA_API_KEY or OANDA_ACCOUNT_ID environment variables",
        },
        { status: 500 }
      )
    }

    const baseUrl = getOandaUrl()
    const instrumentsUrl = `${baseUrl}/v3/accounts/${OANDA_ACCOUNT_ID}/instruments`

    console.log(`[v0] Fetching OANDA instruments from: ${instrumentsUrl}`)

    const response = await fetch(instrumentsUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${OANDA_API_KEY}`,
        "Accept-Datetime-Format": "UNIX",
        "Content-Type": "application/json",
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[v0] OANDA instruments API error: ${response.status} ${errorText}`)

      return NextResponse.json(
        {
          success: false,
          error: `OANDA API returned ${response.status}`,
          details: errorText,
          environment: OANDA_ENVIRONMENT,
          accountId: OANDA_ACCOUNT_ID ? `${OANDA_ACCOUNT_ID.substring(0, 5)}...` : "not set",
        },
        { status: response.status }
      )
    }

    const data = await response.json()

    // Extract relevant fields from each instrument
    const instruments = (data.instruments || []).map((inst: any) => ({
      instrument: inst.name,
      displayName: inst.displayName,
      type: inst.type,
      pipLocation: inst.pipLocation,
      marginRate: inst.marginRate,
      maximumOrderUnits: inst.maximumOrderUnits,
      minimumTradeSize: inst.minimumTradeSize,
    }))

    // Log key indices for diagnostic purposes
    const indices = instruments.filter((i: any) => i.type === "INDEX")
    const metals = instruments.filter((i: any) => i.type === "METAL")

    console.log(`[v0] OANDA instruments fetched: ${instruments.length} total`)
    console.log(`[v0]   - Indices: ${indices.length}`)
    console.log(`[v0]   - Metals: ${metals.length}`)

    if (indices.length > 0) {
      console.log(`[v0] Available indices:`, indices.map((i: any) => i.instrument).join(", "))
    }

    return NextResponse.json(
      {
        success: true,
        environment: OANDA_ENVIRONMENT,
        accountId: OANDA_ACCOUNT_ID ? `${OANDA_ACCOUNT_ID.substring(0, 5)}...` : "hidden",
        totalInstruments: instruments.length,
        summary: {
          indices: indices.length,
          metals: metals.length,
          other: instruments.length - indices.length - metals.length,
        },
        instruments,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error("[v0] OANDA instruments endpoint error:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
