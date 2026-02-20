/**
 * PHASE 3: Capital Protection Layer (Lean Version)
 * Single-user capital safety without architectural changes.
 * 
 * Features:
 * 1. Candle Freshness Validation - Block stale data
 * 2. Instrument Trading Hours - Replace hardcoded UK logic
 * 3. Global SAFE_MODE Flag - Prevent entries on critical failures
 */

// Candle freshness thresholds (minutes)
const FRESHNESS_THRESHOLDS = {
  "5m": 10,    // 5m candles must be < 10 minutes old
  "15m": 20,   // 15m candles must be < 20 minutes old
  "1h": 70,    // 1h candles must be < 70 minutes old
  "4h": 360,   // 4h candles must be < 6 hours old
  "1d": 1440,  // 1d candles must be < 24 hours old
} as const

// Instrument trading hours (UTC)
const INSTRUMENT_HOURS: Record<string, { open: number; close: number }> = {
  XAU_USD: { open: 22, close: 21 },      // Sun 22:00 UTC → Fri 21:00 UTC
  NAS100USD: { open: 22, close: 21 },    // Sun 22:00 UTC → Fri 21:00 UTC
  SPX500USD: { open: 22, close: 21 },    // Sun 22:00 UTC → Fri 21:00 UTC
}

// Global SAFE_MODE state
let SAFE_MODE = false
let dataFetchFailureCount = 0
let lastSafeModeLog = 0

/**
 * Validates if a candle is fresh (not stale)
 * @param candleTime - ISO timestamp of candle close time
 * @param timeframe - '5m', '15m', '1h', '4h', '1d'
 * @returns { isFresh: boolean, lagMinutes: number, reason?: string }
 */
export function validateCandleFreshness(
  candleTime: string | undefined,
  timeframe: string
): { isFresh: boolean; lagMinutes: number; reason?: string } {
  if (!candleTime) {
    return {
      isFresh: false,
      lagMinutes: Infinity,
      reason: "MISSING_TIMESTAMP",
    }
  }

  const now = Date.now()
  const candleMs = new Date(candleTime).getTime()
  const lagMs = now - candleMs
  const lagMinutes = Math.floor(lagMs / 60000)

  const threshold = (FRESHNESS_THRESHOLDS as any)[timeframe] || 1440
  const isFresh = lagMinutes <= threshold

  if (!isFresh) {
    return {
      isFresh: false,
      lagMinutes,
      reason: `STALE_DATA`,
    }
  }

  return { isFresh: true, lagMinutes }
}

/**
 * Checks if instrument is open for trading (UTC-based)
 * @param symbol - 'XAU_USD', 'NAS100USD', 'SPX500USD'
 * @param nowUTC - Optional Date for testing
 * @returns boolean
 */
export function isInstrumentOpen(symbol: string, nowUTC?: Date): boolean {
  const hours = INSTRUMENT_HOURS[symbol]
  if (!hours) {
    console.warn(`[CAPITAL_PROTECTION] Unknown symbol for hours check: ${symbol}`)
    return true // Default to open for unknown symbols
  }

  const now = nowUTC || new Date()
  const utcDay = now.getUTCDay() // 0=Sunday, 5=Friday
  const utcHour = now.getUTCHours()

  // Market is open: Sunday 22:00 through Friday 21:00 UTC
  // Special handling: wraps around week boundary
  if (utcDay === 0) {
    // Sunday: open from 22:00 onwards
    return utcHour >= hours.open
  } else if (utcDay >= 1 && utcDay <= 4) {
    // Monday-Thursday: always open
    return true
  } else if (utcDay === 5) {
    // Friday: open until 21:00
    return utcHour < hours.close
  } else {
    // Saturday: closed
    return false
  }
}

/**
 * Check freshness of all candle timeframes
 * @returns { allFresh: boolean, staleTimeframes: string[], details: object }
 */
export function validateAllCandleFreshness(candleData: {
  daily?: { candles?: any[] }
  h4?: { candles?: any[] }
  h1?: { candles?: any[] }
  m15?: { candles?: any[] }
  m5?: { candles?: any[] }
}): {
  allFresh: boolean
  staleTimeframes: string[]
  details: Record<string, any>
} {
  const details: Record<string, any> = {}
  const staleTimeframes: string[] = []

  const checks = [
    { tf: "5m", data: candleData.m5 },
    { tf: "15m", data: candleData.m15 },
    { tf: "1h", data: candleData.h1 },
    { tf: "4h", data: candleData.h4 },
    { tf: "1d", data: candleData.daily },
  ]

  for (const check of checks) {
    const lastCandle = check.data?.candles?.[check.data.candles.length - 1]
    const validation = validateCandleFreshness(lastCandle?.time, check.tf)

    details[check.tf] = validation

    if (!validation.isFresh) {
      staleTimeframes.push(check.tf)
    }
  }

  return {
    allFresh: staleTimeframes.length === 0,
    staleTimeframes,
    details,
  }
}

/**
 * Track data fetch failures for SAFE_MODE activation
 * @param success - true if fetch succeeded
 */
export function trackDataFetchSuccess(success: boolean): void {
  if (!success) {
    dataFetchFailureCount++
    console.warn(
      `[CAPITAL_PROTECTION] Data fetch failed (${dataFetchFailureCount}/3) - SAFE_MODE will trigger at 3`
    )

    if (dataFetchFailureCount >= 3) {
      activateSafeMode("CONSECUTIVE_DATA_FAILURES")
    }
  } else {
    dataFetchFailureCount = 0 // Reset on success
  }
}

/**
 * Activate SAFE_MODE to block new entries
 * @param reason - Reason for activation
 */
export function activateSafeMode(reason: string): void {
  if (!SAFE_MODE) {
    SAFE_MODE = true
    console.error(`[SAFE_MODE] ACTIVATED - Reason: ${reason}. All new entries blocked.`)
    lastSafeModeLog = Date.now()
  }
}

/**
 * Deactivate SAFE_MODE (after manual intervention or retry period)
 */
export function deactivateSafeMode(): void {
  if (SAFE_MODE) {
    SAFE_MODE = false
    dataFetchFailureCount = 0
    console.log(`[SAFE_MODE] DEACTIVATED - System back to normal operation`)
  }
}

/**
 * Get current SAFE_MODE state
 */
export function isSafeModeActive(): boolean {
  return SAFE_MODE
}

/**
 * Reset SAFE_MODE counters (call periodically or on startup)
 */
export function resetSafeModeCounters(): void {
  dataFetchFailureCount = 0
  SAFE_MODE = false
  lastSafeModeLog = 0
}

/**
 * Export SAFE_MODE state for monitoring
 */
export function getSafeModeMetrics(): {
  safeModeActive: boolean
  failureCount: number
  lastLogTime: string
} {
  return {
    safeModeActive: SAFE_MODE,
    failureCount: dataFetchFailureCount,
    lastLogTime: new Date(lastSafeModeLog).toISOString(),
  }
}
