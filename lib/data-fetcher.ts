import type { Candle, DataSource } from "@/types/trading"

interface CircuitBreakerState {
  failures: number
  lastFailure: number
  isOpen: boolean
  nextRetry: number
}

interface RealTimePrice {
  price: number
  timestamp: number
  source: string
}

interface DailyCache {
  data: Candle[]
  timestamp: number
  lastCandleTimestamp: number
  fullHistoryLoaded: boolean
}

interface OandaCache {
  data: Map<string, { candles: Candle[]; timestamp: number }>
}

const moduleState = {
  oandaCache: { data: new Map() } as OandaCache,
  realTimePriceCache: null as RealTimePrice | null,
  lastRequestTime: 0,
}

const SYNTHESIZED_CACHE_TTL = 5 * 60 * 1000
const FULL_HISTORY_CACHE_TTL = 24 * 60 * 60 * 1000
const INCREMENTAL_UPDATE_INTERVAL = 5 * 60 * 1000
const MIN_REQUEST_INTERVAL = 500 // 500ms between requests
const CIRCUIT_BREAKER_THRESHOLD = 5
const CIRCUIT_BREAKER_RESET_MS = 60 * 1000
const OANDA_CACHE_TTL = 60 * 1000 // 1 minute cache for OANDA

let detectedOandaServer: "practice" | "live" = "live"

export class DataFetcher {
  private symbol: string

  constructor(symbol = "XAU_USD") {
    this.symbol = symbol
  }

  private hasOandaCredentials(): boolean {
    return !!(process.env.OANDA_API_KEY && process.env.OANDA_ACCOUNT_ID)
  }

  private getOandaBaseUrl(forceServer?: "practice" | "live"): string {
    if (forceServer) {
      return forceServer === "live" ? "https://api-fxtrade.oanda.com" : "https://api-fxpractice.oanda.com"
    }

    return detectedOandaServer === "live" ? "https://api-fxtrade.oanda.com" : "https://api-fxpractice.oanda.com"
  }

  private getOandaGranularity(timeframe: string): string {
    const map: Record<string, string> = {
      "5m": "M5",
      "15m": "M15",
      "1h": "H1",
      "4h": "H4",
      "8h": "H8",
      "1d": "D",
    }
    return map[timeframe] || "H1"
  }

  private async fetchFromOanda(timeframe: "5m" | "15m" | "1h" | "4h" | "8h" | "1d", limit: number): Promise<Candle[]> {
    const apiKey = process.env.OANDA_API_KEY
    if (!apiKey) {
      throw new Error("OANDA_API_KEY not configured")
    }

    const granularity = this.getOandaGranularity(timeframe)
    const instrument = this.symbol
    const count = Math.min(limit, 5000)

    // Try with detected server first
    try {
      return await this.tryOandaFetch(detectedOandaServer, instrument, granularity, count, apiKey)
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)

      // If auth error, try the other server
      if (msg.includes("401") || msg.includes("authorization")) {
        const otherServer = detectedOandaServer === "live" ? "practice" : "live"
        console.log(`[v0] Trying OANDA ${otherServer} server...`)

        try {
          const candles = await this.tryOandaFetch(otherServer, instrument, granularity, count, apiKey)
          detectedOandaServer = otherServer
          console.log(`[v0] OANDA ${otherServer} server working!`)
          return candles
        } catch (secondError) {
          throw new Error("OANDA authentication failed on both servers. Check your API key.")
        }
      }

      throw error
    }
  }

  private async tryOandaFetch(
    server: "practice" | "live",
    instrument: string,
    granularity: string,
    count: number,
    apiKey: string,
  ): Promise<Candle[]> {
    const baseUrl = this.getOandaBaseUrl(server)
    const url = `${baseUrl}/v3/instruments/${instrument}/candles?granularity=${granularity}&count=${count}&price=M`

    // Rate limiting
    const now = Date.now()
    const timeSinceLastRequest = now - moduleState.lastRequestTime
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
      await new Promise((resolve) => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest))
    }
    moduleState.lastRequestTime = Date.now()

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Accept-Datetime-Format": "RFC3339",
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`OANDA API error ${response.status}: ${errorText}`)
    }

    const data = await response.json()
    return this.parseOandaCandles(data)
  }

  private parseOandaCandles(data: any): Candle[] {
    if (!data.candles || data.candles.length === 0) {
      throw new Error("No candles returned from OANDA")
    }

    const candles: Candle[] = data.candles
      .filter((c: any) => c.complete || data.candles.indexOf(c) === data.candles.length - 1)
      .map((c: any) => ({
        timestamp: new Date(c.time).getTime(),
        open: Number.parseFloat(c.mid.o),
        high: Number.parseFloat(c.mid.h),
        low: Number.parseFloat(c.mid.l),
        close: Number.parseFloat(c.mid.c),
        volume: c.volume || 0,
      }))

    console.log(`[v0] Loaded ${candles.length} candles from OANDA (${detectedOandaServer})`)
    return candles
  }

  async fetchCandles(
    timeframe: "5m" | "15m" | "1h" | "4h" | "8h" | "1d",
    limit = 100,
  ): Promise<{ candles: Candle[]; source: DataSource }> {
    if (!this.hasOandaCredentials()) {
      throw new Error("OANDA credentials not configured. Add OANDA_API_KEY and OANDA_ACCOUNT_ID.")
    }

    const cacheKey = `${this.symbol}-${timeframe}-${limit}`

    // Check cache
    const cached = moduleState.oandaCache.data.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < OANDA_CACHE_TTL) {
      return { candles: cached.candles, source: "oanda" }
    }

    // Fetch from OANDA
    const candles = await this.fetchFromOanda(timeframe, limit)

    if (candles.length > 0) {
      moduleState.oandaCache.data.set(cacheKey, { candles, timestamp: Date.now() })

      // Update real-time price
      const latest = candles[candles.length - 1]
      moduleState.realTimePriceCache = {
        price: latest.close,
        timestamp: Date.now(),
        source: "oanda",
      }
    }

    return { candles, source: "oanda" }
  }

  getCurrentPrice(): number | null {
    return moduleState.realTimePriceCache?.price ?? null
  }

  getDataSourceStatus(): { source: DataSource; status: string } {
    return {
      source: "oanda",
      status: `Connected to OANDA ${detectedOandaServer} server`,
    }
  }
}
