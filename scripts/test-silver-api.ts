const OANDA_API_KEY = process.env.OANDA_API_KEY

if (!OANDA_API_KEY) {
  console.error("[v0] Error: OANDA_API_KEY environment variable not set")
  process.exit(1)
}

interface Candle {
  time: Date
  open: number
  high: number
  low: number
  close: number
  volume: number
}

const fetchOandaCandles = async (symbol: string, granularity: string, count: number): Promise<Candle[]> => {
  const baseUrl = "https://api-fxtrade.oanda.com"
  const url = `${baseUrl}/v3/instruments/${symbol}/candles?granularity=${granularity}&count=${count}&price=M`

  console.log(`[v0] Testing API for ${symbol}...`)
  console.log(`[v0] URL: ${url}`)

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${OANDA_API_KEY}`,
      "Content-Type": "application/json",
    },
  })

  console.log(`[v0] Response status: ${response.status}`)
  console.log(`[v0] Response headers:`, Object.fromEntries(response.headers.entries()))

  if (!response.ok) {
    console.error(`[v0] OANDA error: ${response.status} - ${response.statusText}`)
    const errorText = await response.text()
    console.error(`[v0] Error response:`, errorText)
    return []
  }

  const data = await response.json()
  console.log(`[v0] Response data keys:`, Object.keys(data))
  
  if (data.candles) {
    console.log(`[v0] Number of candles: ${data.candles.length}`)
    if (data.candles.length > 0) {
      console.log(`[v0] First candle:`, data.candles[0])
      console.log(`[v0] Last candle:`, data.candles[data.candles.length - 1])
      
      // Test if candles have the expected structure
      const firstCandle = data.candles[0]
      console.log(`[v0] Candle structure test:`)
      console.log(`  - time: ${firstCandle.time}`)
      console.log(`  - mid:`, firstCandle.mid)
      console.log(`  - complete: ${firstCandle.complete}`)
      console.log(`  - volume: ${firstCandle.volume}`)
      
      // Convert to our format
      const convertedCandles = data.candles
        .filter((c: any) => c.complete)
        .map((c: any) => ({
          time: new Date(c.time),
          open: Number.parseFloat(c.mid.o),
          high: Number.parseFloat(c.mid.h),
          low: Number.parseFloat(c.mid.l),
          close: Number.parseFloat(c.mid.c),
          volume: c.volume || 0,
        }))
        .reverse()
      
      console.log(`[v0] Converted candles: ${convertedCandles.length}`)
      if (convertedCandles.length > 0) {
        console.log(`[v0] First converted candle:`, convertedCandles[0])
      }
      
      return convertedCandles
    }
  } else {
    console.log(`[v0] No candles in response`)
    console.log(`[v0] Full response:`, JSON.stringify(data, null, 2))
  }
  
  return []
}

const testSilverAPI = async (): Promise<void> => {
  console.log("=".repeat(80))
  console.log("SILVER API TEST")
  console.log("=".repeat(80))
  
  console.log("\n[v0] Testing Gold (XAU_USD) for comparison...")
  const goldCandles = await fetchOandaCandles("XAU_USD", "H1", 10)
  console.log(`[v0] Gold candles: ${goldCandles.length}`)
  
  console.log("\n[v0] Testing Silver (XAG_USD)...")
  const silverCandles = await fetchOandaCandles("XAG_USD", "H1", 10)
  console.log(`[v0] Silver candles: ${silverCandles.length}`)
  
  if (silverCandles.length === 0) {
    console.log("\n[v0] ❌ SILVER API ISSUE DETECTED!")
    console.log("[v0] Possible causes:")
    console.log("  1. XAG_USD not available in your OANDA account")
    console.log("  2. Different symbol format (e.g., XAG/USD, XAG_USD, XAG)")
    console.log("  3. Account permissions issue")
    console.log("  4. API rate limiting")
    
    // Try alternative symbol formats
    console.log("\n[v0] Testing alternative symbol formats...")
    
    const alternativeSymbols = ["XAG/USD", "XAG", "XAG_USD"]
    for (const symbol of alternativeSymbols) {
      if (symbol === "XAG_USD") continue // Already tested
      console.log(`\n[v0] Testing ${symbol}...`)
      const altCandles = await fetchOandaCandles(symbol, "H1", 5)
      console.log(`[v0] ${symbol} candles: ${altCandles.length}`)
    }
  } else {
    console.log("\n[v0] ✅ Silver API is working correctly!")
    console.log(`[v0] Got ${silverCandles.length} candles`)
  }
  
  console.log("\n" + "=".repeat(80))
}

testSilverAPI().catch(console.error)