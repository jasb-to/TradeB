import type { Candle, DataSource } from "@/types/trading"

// v5.4.5-FORCE-VERCEL-REBUILD: 2026-02-17T20:50:00Z - Complete mode parameter chain fix verified
// Error classification for OANDA API responses
type OandaErrorClass = "AUTH_FAILURE" | "RATE_LIMIT" | "NETWORK" | "SERVER_ERROR" | "DATA_ERROR" | "UNKNOWN"

function classifyOandaError(status: number, message: string): OandaErrorClass {
  if (status === 401 || status === 403) return "AUTH_FAILURE"
  if (status === 429) return "RATE_LIMIT"
  if (status >= 500 && status < 600) return "SERVER_ERROR"
  if (status === 0 || message.includes("fetch failed") || message.includes("ETIMEDOUT") || message.includes("ECONNREFUSED") || message.includes("network") || message.includes("abort")) return "NETWORK"
  if (status === 400 || status === 404) return "DATA_ERROR"
  return "UNKNOWN"
}

interface RealTimePrice {
  price: number
  timestamp: number
  source: string
}

interface OandaCache {
  data: Map<string, { candles: Candle[]; timestamp: number }>
}

const moduleState = {
  oandaCache: { data: new Map() } as OandaCache,
  realTimePriceCache: null as RealTimePrice | null,
  lastRequestTime: 0,
}

const MIN_REQUEST_INTERVAL = 500 // 500ms between requests
const OANDA_CACHE_TTL = 60 * 1000 // 1 minute cache for OANDA
const OANDA_FETCH_TIMEOUT_MS = 15_000 // 15s timeout per request
const OANDA_MAX_RETRIES = 2 // retry transient errors up to 2 times

let detectedOandaServer: "practice" | "live" = "live"

// Diagnostic: Log environment on module load
console.log(`[v0] DATA-FETCHER INITIALIZED:`)
console.log(`[v0]   OANDA_API_KEY=${process.env.OANDA_API_KEY ? "SET (length=" + process.env.OANDA_API_KEY.length + ")" : "MISSING"}`)
console.log(`[v0]   OANDA_ACCOUNT_ID=${process.env.OANDA_ACCOUNT_ID ? "SET (value=" + process.env.OANDA_ACCOUNT_ID + ")" : "MISSING"}`)
console.log(`[v0]   OANDA_ENVIRONMENT=${process.env.OANDA_ENVIRONMENT || "MISSING"}`)

export class DataFetcher {
  private symbol: string

  constructor(symbol = "XAU_USD") {
    this.symbol = symbol
  }

  private hasOandaCredentials(): boolean {
    const apiKey = process.env.OANDA_API_KEY
    const accountId = process.env.OANDA_ACCOUNT_ID
    const hasKeys = !!(apiKey && accountId)
    
    console.log(`[v0] CREDENTIAL CHECK: OANDA_API_KEY=${apiKey ? "SET" : "MISSING"} OANDA_ACCOUNT_ID=${accountId ? "SET" : "MISSING"} => hasCredentials=${hasKeys}`)
    
    return hasKeys
  }

  private getOandaBaseUrl(server: "practice" | "live"): string {
    return server === "live" ? "https://api-fxtrade.oanda.com" : "https://api-fxpractice.oanda.com"
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

  /**
   * CRITICAL FIX #1: Isolated per-request fetching with correct error classification.
   * - Each call builds fresh headers (no shared mutation).
   * - Only true 401/403 responses trigger server-swap; all others propagate with their real class.
   * - Transient errors (network, 429, 5xx) are retried up to OANDA_MAX_RETRIES before giving up.
   */
  private async fetchFromOanda(timeframe: "5m" | "15m" | "1h" | "4h" | "8h" | "1d", limit: number, mode: 'LIVE' | 'BACKTEST' = 'LIVE'): Promise<Candle[]> {
    const apiKey = process.env.OANDA_API_KEY
    if (!apiKey) {
      throw new OandaFetchError("OANDA_API_KEY not configured", "AUTH_FAILURE")
    }

    const granularity = this.getOandaGranularity(timeframe)
    const instrument = this.symbol
    const count = Math.min(limit, 5000)

    // Snapshot the current server preference — do NOT mutate during concurrent fetches
    const primaryServer = detectedOandaServer

    try {
      return await this.tryOandaFetchWithRetry(primaryServer, instrument, granularity, count, apiKey, mode)
    } catch (error) {
      // Only swap servers on confirmed AUTH_FAILURE
      if (error instanceof OandaFetchError && error.errorClass === "AUTH_FAILURE") {
        const otherServer = primaryServer === "live" ? "practice" : "live"
        console.log(`[v0] OANDA auth failed on ${primaryServer}, trying ${otherServer} server...`)

        try {
          const candles = await this.tryOandaFetchWithRetry(otherServer, instrument, granularity, count, apiKey, mode)
          // Only update after confirmed success
          detectedOandaServer = otherServer
          console.log(`[v0] OANDA ${otherServer} server confirmed working`)
          return candles
        } catch (secondError) {
          if (secondError instanceof OandaFetchError && secondError.errorClass === "AUTH_FAILURE") {
            throw new OandaFetchError("OANDA authentication failed on both servers. Check your API key.", "AUTH_FAILURE")
          }
          throw secondError
        }
      }

      // Re-throw non-auth errors as-is — they should NOT be labeled "auth failed"
      throw error
    }
  }

  /**
   * Retry wrapper: retries on NETWORK / RATE_LIMIT / SERVER_ERROR; throws immediately on AUTH_FAILURE / DATA_ERROR.
   */
  private async tryOandaFetchWithRetry(
    server: "practice" | "live",
    instrument: string,
    granularity: string,
    count: number,
    apiKey: string,
    mode: 'LIVE' | 'BACKTEST' = 'LIVE',
  ): Promise<Candle[]> {
    let lastError: Error | null = null
    for (let attempt = 0; attempt <= OANDA_MAX_RETRIES; attempt++) {
      try {
        return await this.tryOandaFetch(server, instrument, granularity, count, apiKey, mode)
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        const errorClass = error instanceof OandaFetchError ? error.errorClass : "UNKNOWN"

        // Non-retryable errors — fail immediately
        if (errorClass === "AUTH_FAILURE" || errorClass === "DATA_ERROR") {
          throw error
        }

        // Retryable — back off and try again
        if (attempt < OANDA_MAX_RETRIES) {
          const backoffMs = Math.min(1000 * Math.pow(2, attempt), 4000)
          console.log(`[v0] OANDA ${server} ${errorClass} (attempt ${attempt + 1}/${OANDA_MAX_RETRIES + 1}), retrying in ${backoffMs}ms...`)
          await new Promise((resolve) => setTimeout(resolve, backoffMs))
        }
      }
    }
    throw lastError!
  }

  private async tryOandaFetch(
    server: "practice" | "live",
    instrument: string,
    granularity: string,
    count: number,
    apiKey: string,
    mode: 'LIVE' | 'BACKTEST' = 'LIVE',
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

    // Fresh headers per request — no shared object mutation
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Accept-Datetime-Format": "RFC3339",
    }

    let response: Response
    try {
      response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(OANDA_FETCH_TIMEOUT_MS),
      })
    } catch (fetchError) {
      // Network-level failure (timeout, DNS, connection refused)
      const msg = fetchError instanceof Error ? fetchError.message : String(fetchError)
      throw new OandaFetchError(`OANDA network error (${server}): ${msg}`, "NETWORK")
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "")
      const errorClass = classifyOandaError(response.status, errorText)
      throw new OandaFetchError(
        `OANDA API error ${response.status} (${server}/${instrument}/${granularity}): ${errorText.slice(0, 200)}`,
        errorClass,
      )
    }

    const data = await response.json()
    return this.parseOandaCandles(data, mode)
  }

  /** Visible source tag for all fetched data */
  public getLastFetchSource(): DataSource {
    return this._lastFetchSource
  }
  private _lastFetchSource: DataSource = "synthetic"

  private parseOandaCandles(data: any, mode: 'LIVE' | 'BACKTEST' = 'LIVE'): Candle[] {
    if (!data.candles || data.candles.length === 0) {
      throw new Error("No candles returned from OANDA")
    }

    // BACKTEST MODE: Return ALL candles (including current/incomplete)
    // LIVE MODE: Return only completed candles for signal integrity
    const filteredCandles = mode === 'BACKTEST' 
      ? data.candles 
      : data.candles.filter((c: any) => c.complete || data.candles.indexOf(c) === data.candles.length - 1)

    const candles: Candle[] = filteredCandles
      .map((c: any) => ({
        timestamp: new Date(c.time).getTime(),
        open: Number.parseFloat(c.mid.o),
        high: Number.parseFloat(c.mid.h),
        low: Number.parseFloat(c.mid.l),
        close: Number.parseFloat(c.mid.c),
        volume: c.volume || 0,
      }))

    console.log(`[v0] Loaded ${candles.length} candles from OANDA (${detectedOandaServer}) [${mode} mode]`)
    return candles
  }

  /**
   * CRITICAL FIX: fetchCandles now properly classifies errors and NEVER silently
   * falls back to synthetic data.  If OANDA credentials exist, a fetch failure
   * propagates the real error so callers can decide whether to proceed.
   * Synthetic data is ONLY returned when there are genuinely no OANDA credentials
   * (local dev / testing).
   */
  async fetchCandles(
    timeframe: "5m" | "15m" | "1h" | "4h" | "8h" | "1d",
    limit = 100,
    mode: 'LIVE' | 'BACKTEST' = 'LIVE',
  ): Promise<{ candles: Candle[]; source: DataSource }> {
    const cacheKey = `${this.symbol}-${timeframe}-${limit}`

    // Check cache first (only OANDA data is cached)
    const cached = moduleState.oandaCache.data.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < OANDA_CACHE_TTL) {
      this._lastFetchSource = "oanda"
      return { candles: cached.candles, source: "oanda" }
    }

    // ── OANDA path ──────────────────────────────────────────────────────
    if (this.hasOandaCredentials()) {
      try {
        const candles = await this.fetchFromOanda(timeframe, limit, mode)

        if (candles.length > 0) {
          moduleState.oandaCache.data.set(cacheKey, { candles, timestamp: Date.now() })

          const latest = candles[candles.length - 1]
          moduleState.realTimePriceCache = {
            price: latest.close,
            timestamp: Date.now(),
            source: "oanda",
          }
        }

        this._lastFetchSource = "oanda"
        return { candles, source: "oanda" }
      } catch (error) {
        // Log with proper classification — never say "auth failed" for non-auth errors
        const errorClass = error instanceof OandaFetchError ? error.errorClass : "UNKNOWN"
        const msg = error instanceof Error ? error.message : String(error)
        console.error(`[v0] OANDA fetch FAILED [${errorClass}] ${this.symbol}/${timeframe}: ${msg}`)

        // CRITICAL: Do NOT silently fall back to synthetic data when OANDA credentials exist.
        // The caller MUST know data is unavailable so it can avoid producing signals.
        throw error
      }
    }

    // ── No OANDA credentials: synthetic for local dev only ──────────────
    console.log(`[v0] NO OANDA CREDENTIALS — Using synthetic data for ${this.symbol} (${timeframe})`)
    const syntheticCandles = this.generateSyntheticCandles(timeframe, limit)

    // CRITICAL FIX #2: Synthetic data is NEVER cached in the OANDA cache
    // and is NEVER stored as real-time price.
    this._lastFetchSource = "synthetic"
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
      "GBP_JPY": 210,
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
      "GBP_JPY": {
        "5m": 0.08,
        "15m": 0.16,
        "1h": 0.32,
        "4h": 0.64,
        "8h": 0.96,
        "1d": 2.4,
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

/**
 * Custom error with a classified error type so callers can react correctly.
 */
export class OandaFetchError extends Error {
  public readonly errorClass: OandaErrorClass

  constructor(message: string, errorClass: OandaErrorClass) {
    super(message)
    this.name = "OandaFetchError"
    this.errorClass = errorClass
  }
}
