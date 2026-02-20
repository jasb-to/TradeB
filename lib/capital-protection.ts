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
let indicatorErrorCount = 0
let strategyExecutionErrorCount = 0
let redisFailureCount = 0
let lastSafeModeLog = 0

// SAFE_MODE triggers: cumulative error tracking
const SAFE_MODE_TRIGGERS = {
  dataFetchFailures: 3,        // 3 consecutive data fetch failures
  indicatorErrors: 3,          // 3 indicator calculation failures
  strategyErrors: 3,           // 3 strategy execution failures
  redisFailures: 2,            // 2 Redis subsystem failures
}

/**
 * Validates if a candle is fresh (not stale)
 * @param candleTime - Epoch timestamp (ms) or ISO string of candle close time
 * @param timeframe - '5m', '15m', '1h', '4h', '1d'
 * @returns { isFresh: boolean, lagMinutes: number, reason?: string }
 */
export function validateCandleFreshness(
  candleTime: number | string | undefined,
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
  // Handle both epoch (number) and ISO string formats
  const candleMs = typeof candleTime === "number" ? candleTime : new Date(candleTime).getTime()
  
  if (isNaN(candleMs)) {
    return {
      isFresh: false,
      lagMinutes: Infinity,
      reason: "INVALID_TIMESTAMP",
    }
  }
  
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
    const candles = check.data?.candles
    
    // No candles at all - this is an error state, not just stale
    if (!candles || candles.length === 0) {
      details[check.tf] = { 
        isFresh: false, 
        lagMinutes: Infinity, 
        reason: "NO_CANDLES" 
      }
      staleTimeframes.push(check.tf)
      continue
    }
    
    // Candle type uses 'timestamp' field (epoch ms), not 'time'
    const lastCandle = candles[candles.length - 1]
    const validation = validateCandleFreshness(lastCandle?.timestamp, check.tf)

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
      `[CAPITAL_PROTECTION] Data fetch failed (${dataFetchFailureCount}/${SAFE_MODE_TRIGGERS.dataFetchFailures}) - SAFE_MODE at threshold`
    )

    if (dataFetchFailureCount >= SAFE_MODE_TRIGGERS.dataFetchFailures) {
      activateSafeMode("CONSECUTIVE_DATA_FAILURES")
    }
  } else {
    dataFetchFailureCount = 0 // Reset on success
  }
}

/**
 * Track indicator calculation errors
 * @param error - Error from indicator calculation
 */
export function trackIndicatorError(error: Error): void {
  indicatorErrorCount++
  console.error(
    `[CAPITAL_PROTECTION] Indicator calculation failed (${indicatorErrorCount}/${SAFE_MODE_TRIGGERS.indicatorErrors}): ${error.message}`
  )

  if (indicatorErrorCount >= SAFE_MODE_TRIGGERS.indicatorErrors) {
    activateSafeMode("INDICATOR_CALCULATION_FAILURES")
  }
}

/**
 * Track strategy execution errors
 * @param error - Error from strategy evaluation
 */
export function trackStrategyError(error: Error): void {
  strategyExecutionErrorCount++
  console.error(
    `[CAPITAL_PROTECTION] Strategy execution failed (${strategyExecutionErrorCount}/${SAFE_MODE_TRIGGERS.strategyErrors}): ${error.message}`
  )

  if (strategyExecutionErrorCount >= SAFE_MODE_TRIGGERS.strategyErrors) {
    activateSafeMode("STRATEGY_EXECUTION_FAILURES")
  }
}

/**
 * Track Redis/subsystem failures
 * @param component - Which component failed (redis, cache, etc)
 */
export function trackSubsystemError(component: string): void {
  redisFailureCount++
  console.error(
    `[CAPITAL_PROTECTION] Subsystem failure - ${component} (${redisFailureCount}/${SAFE_MODE_TRIGGERS.redisFailures})`
  )

  if (redisFailureCount >= SAFE_MODE_TRIGGERS.redisFailures) {
    activateSafeMode(`${component.toUpperCase()}_SUBSYSTEM_FAILURE`)
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
  indicatorErrorCount = 0
  strategyExecutionErrorCount = 0
  redisFailureCount = 0
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
