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
    const cacheKey = `${this.symbol}-${timeframe}-${limit}`

    // Check cache first
    const cached = moduleState.oandaCache.data.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < OANDA_CACHE_TTL) {
      return { candles: cached.candles, source: "oanda" }
    }

    // Try OANDA first if credentials are available
    if (this.hasOandaCredentials()) {
      try {
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
      } catch (error) {
        console.warn(`[v0] OANDA fetch failed: ${error}. Falling back to synthetic data.`)
      }
    }

    // Fallback to synthetic data for testing
    console.log(`[v0] Using synthetic data for ${this.symbol} (${timeframe})`)
    const syntheticCandles = this.generateSyntheticCandles(timeframe, limit)
    
    moduleState.oandaCache.data.set(cacheKey, { candles: syntheticCandles, timestamp: Date.now() })
    
    // Update real-time price with synthetic data
    const latest = syntheticCandles[syntheticCandles.length - 1]
    moduleState.realTimePriceCache = {
      price: latest.close,
      timestamp: Date.now(),
      source: "synthetic",
    }

    return { candles: syntheticCandles, source: "synthetic" }
  }

  getCurrentPrice(): number | null {
    return moduleState.realTimePriceCache?.price ?? null
  }

  private generateSyntheticCandles(timeframe: string, limit: number): Candle[] {
    const now = Date.now()
    const timeframeMs = this.getTimeframeMs(timeframe)
    
    // Base price for different symbols - updated to match current market prices
    const basePrices: Record<string, number> = {
      "XAU_USD": 4850,  // Updated to match current market price
      "XAG_USD": 30,
      "XPT_USD": 950,
    }
    
    const basePrice = basePrices[this.symbol] || 1000
    const candles: Candle[] = []
    
    let currentPrice = basePrice
    
    for (let i = limit - 1; i >= 0; i--) {
      const timestamp = now - (i * timeframeMs)
      const volatility = this.getVolatilityForSymbol(this.symbol, timeframe)
      
      // Generate random price movement
      const change = (Math.random() - 0.5) * volatility * 2
      currentPrice += change
      
      // Ensure price doesn't go negative
      currentPrice = Math.max(currentPrice, basePrice * 0.5)
      
      // Generate candle with some wicks
      const open = currentPrice - (Math.random() - 0.5) * volatility
      const close = currentPrice + (Math.random() - 0.5) * volatility
      const high = Math.max(open, close) + Math.random() * volatility
      const low = Math.min(open, close) - Math.random() * volatility
      const volume = Math.floor(Math.random() * 100) + 1
      
      candles.push({
        timestamp,
        open,
        high,
        low,
        close,
        volume,
      })
    }
    
    console.log(`[v0] Generated ${candles.length} synthetic candles for ${this.symbol}`)
    return candles
  }
  
  private getTimeframeMs(timeframe: string): number {
    const map: Record<string, number> = {
      "5m": 5 * 60 * 1000,
      "15m": 15 * 60 * 1000,
      "1h": 60 * 60 * 1000,
      "4h": 4 * 60 * 60 * 1000,
      "8h": 8 * 60 * 60 * 1000,
      "1d": 24 * 60 * 60 * 1000,
    }
    return map[timeframe] || 60 * 60 * 1000
  }
  
  private getVolatilityForSymbol(symbol: string, timeframe: string): number {
    // Different volatility profiles for different symbols and timeframes
    const volatilityProfiles: Record<string, Record<string, number>> = {
      "XAU_USD": {
        "5m": 0.5,
        "15m": 1.0,
        "1h": 2.0,
        "4h": 4.0,
        "8h": 6.0,
        "1d": 15.0,
      },
      "XAG_USD": {
        "5m": 0.05,
        "15m": 0.1,
        "1h": 0.2,
        "4h": 0.4,
        "8h": 0.6,
        "1d": 1.5,
      },
      "XPT_USD": {
        "5m": 0.3,
        "15m": 0.6,
        "1h": 1.2,
        "4h": 2.4,
        "8h": 3.6,
        "1d": 9.0,
      },
    }
    
    return volatilityProfiles[symbol]?.[timeframe] || 1.0
  }

  getDataSourceStatus(): { source: DataSource; status: string } {
    if (this.hasOandaCredentials()) {
      return {
        source: "oanda",
        status: `Connected to OANDA ${detectedOandaServer} server`,
      }
    } else {
      return {
        source: "synthetic",
        status: "Using synthetic data for testing (no OANDA credentials)",
      }
    }
  }
}
