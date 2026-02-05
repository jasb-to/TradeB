/**
 * PATIENCE TRACKER - Visibility & Diagnostic Module
 * 
 * HARD CONSTRAINTS:
 * - DO NOT loosen entry rules
 * - DO NOT change EntryDecision logic
 * - DO NOT alter HTF polarity detection
 * - DO NOT affect alert gating
 * - DO NOT increase trade frequency
 * 
 * This module is DIAGNOSTIC ONLY - tracks timing and state for transparency.
 */

export interface HTFNeutralState {
  symbol: string
  neutralStartTime: number | null
  lastAlignedAt: number | null
  lastAlignedDirection: "LONG" | "SHORT" | null
}

export interface LastValidSetup {
  symbol: string
  timestamp: number | null
  tier: "A" | "A+" | null
  direction: "LONG" | "SHORT" | null
}

export interface NoTradeSummary {
  reasonCategory: "HTF_NEUTRAL" | "MTF_UNALIGNED" | "VOLATILITY_LOW" | "COOLDOWN" | "COUNTER_TREND" | "SCORE_LOW"
  explanation: string
  blockingReasons: string[]
  htfState: {
    daily: string
    h4: string
    polarity: string
  }
  durationContext: {
    htfNeutralHours: number
    hoursSinceLastSetup: number | null
  }
}

export interface PatienceMetrics {
  symbol: string
  htfPolarity: "LONG" | "SHORT" | "NEUTRAL"
  htfNeutralDurationMinutes: number
  htfNeutralDurationHours: number
  lastHTFAlignedAt: number | null
  lastHTFDirection: "LONG" | "SHORT" | null
  lastValidSetupAt: number | null
  lastValidSetupTier: "A" | "A+" | null
  hoursSinceLastValidSetup: number | null
  currentPrimaryBlocker: string
  noTradeSummary: NoTradeSummary | null
}

// In-memory persistence (survives cron executions within same instance)
const htfNeutralStates: Map<string, HTFNeutralState> = new Map()
const lastValidSetups: Map<string, LastValidSetup> = new Map()
const lastDailyStatusSent: Map<string, number> = new Map()

function getHTFState(symbol: string): HTFNeutralState {
  if (!htfNeutralStates.has(symbol)) {
    htfNeutralStates.set(symbol, {
      symbol,
      neutralStartTime: null,
      lastAlignedAt: null,
      lastAlignedDirection: null,
    })
  }
  return htfNeutralStates.get(symbol)!
}

function getLastSetup(symbol: string): LastValidSetup {
  if (!lastValidSetups.has(symbol)) {
    lastValidSetups.set(symbol, {
      symbol,
      timestamp: null,
      tier: null,
      direction: null,
    })
  }
  return lastValidSetups.get(symbol)!
}

export const PatienceTracker = {
  /**
   * Update HTF polarity state - call this on every signal evaluation
   */
  updateHTFPolarity: (symbol: string, polarity: "LONG" | "SHORT" | "NEUTRAL"): void => {
    const state = getHTFState(symbol)
    const now = Date.now()

    if (polarity === "NEUTRAL") {
      // Start tracking neutral duration if not already
      if (state.neutralStartTime === null) {
        state.neutralStartTime = now
        console.log(`[v0] PATIENCE: ${symbol} HTF entered NEUTRAL state at ${new Date(now).toISOString()}`)
      }
    } else {
      // HTF is aligned (LONG or SHORT) - reset neutral timer
      if (state.neutralStartTime !== null) {
        const durationMs = now - state.neutralStartTime
        const durationHours = (durationMs / (1000 * 60 * 60)).toFixed(1)
        console.log(`[v0] PATIENCE: ${symbol} HTF exited NEUTRAL after ${durationHours}h - now ${polarity}`)
      }
      state.neutralStartTime = null
      state.lastAlignedAt = now
      state.lastAlignedDirection = polarity
    }
  },

  /**
   * Record when a valid A or A+ setup is detected (allowed=true)
   */
  recordValidSetup: (symbol: string, tier: "A" | "A+", direction: "LONG" | "SHORT"): void => {
    const setup = getLastSetup(symbol)
    setup.timestamp = Date.now()
    setup.tier = tier
    setup.direction = direction
    console.log(`[v0] PATIENCE: ${symbol} Valid ${tier} setup recorded (${direction}) at ${new Date().toISOString()}`)
  },

  /**
   * Get current patience metrics for a symbol
   */
  getMetrics: (symbol: string, currentPolarity: "LONG" | "SHORT" | "NEUTRAL", primaryBlocker: string): PatienceMetrics => {
    const htfState = getHTFState(symbol)
    const lastSetup = getLastSetup(symbol)
    const now = Date.now()

    // Calculate HTF neutral duration
    let htfNeutralMs = 0
    if (currentPolarity === "NEUTRAL" && htfState.neutralStartTime !== null) {
      htfNeutralMs = now - htfState.neutralStartTime
    }

    // Calculate time since last valid setup
    let hoursSinceLastSetup: number | null = null
    if (lastSetup.timestamp !== null) {
      hoursSinceLastSetup = (now - lastSetup.timestamp) / (1000 * 60 * 60)
    }

    return {
      symbol,
      htfPolarity: currentPolarity,
      htfNeutralDurationMinutes: Math.round(htfNeutralMs / (1000 * 60)),
      htfNeutralDurationHours: htfNeutralMs / (1000 * 60 * 60),
      lastHTFAlignedAt: htfState.lastAlignedAt,
      lastHTFDirection: htfState.lastAlignedDirection,
      lastValidSetupAt: lastSetup.timestamp,
      lastValidSetupTier: lastSetup.tier,
      hoursSinceLastValidSetup: hoursSinceLastSetup !== null ? Math.round(hoursSinceLastSetup * 10) / 10 : null,
      currentPrimaryBlocker: primaryBlocker,
      noTradeSummary: null, // Populated by generateNoTradeSummary
    }
  },

  /**
   * Generate human-readable no-trade explanation
   */
  generateNoTradeSummary: (
    symbol: string,
    htfPolarity: "LONG" | "SHORT" | "NEUTRAL",
    dailyStructure: string,
    h4Structure: string,
    blockingReasons: string[],
  ): NoTradeSummary => {
    const htfState = getHTFState(symbol)
    const lastSetup = getLastSetup(symbol)
    const now = Date.now()

    // Calculate durations
    let htfNeutralHours = 0
    if (htfPolarity === "NEUTRAL" && htfState.neutralStartTime !== null) {
      htfNeutralHours = (now - htfState.neutralStartTime) / (1000 * 60 * 60)
    }

    let hoursSinceLastSetup: number | null = null
    if (lastSetup.timestamp !== null) {
      hoursSinceLastSetup = (now - lastSetup.timestamp) / (1000 * 60 * 60)
    }

    // Determine primary reason category
    let reasonCategory: NoTradeSummary["reasonCategory"] = "SCORE_LOW"
    if (htfPolarity === "NEUTRAL") {
      reasonCategory = "HTF_NEUTRAL"
    } else if (blockingReasons.some(r => r.toLowerCase().includes("counter"))) {
      reasonCategory = "COUNTER_TREND"
    } else if (blockingReasons.some(r => r.toLowerCase().includes("cooldown"))) {
      reasonCategory = "COOLDOWN"
    } else if (blockingReasons.some(r => r.toLowerCase().includes("aligned"))) {
      reasonCategory = "MTF_UNALIGNED"
    } else if (blockingReasons.some(r => r.toLowerCase().includes("atr") || r.toLowerCase().includes("volatility"))) {
      reasonCategory = "VOLATILITY_LOW"
    }

    // Generate human-readable explanation
    let explanation = ""
    switch (reasonCategory) {
      case "HTF_NEUTRAL":
        explanation = `No trade because Daily (${dailyStructure}) and 4H (${h4Structure}) structures are conflicting. HTF has been neutral for ${htfNeutralHours.toFixed(1)} hours.`
        break
      case "MTF_UNALIGNED":
        explanation = `HTF polarity is ${htfPolarity}, but lower timeframes are not aligned for entry.`
        break
      case "COUNTER_TREND":
        explanation = `Counter-trend entry blocked. HTF trend is ${htfPolarity}-only.`
        break
      case "COOLDOWN":
        explanation = `System is in cooldown period after previous trade.`
        break
      case "VOLATILITY_LOW":
        explanation = `Volatility conditions not met for safe entry.`
        break
      default:
        explanation = `Entry score below required threshold.`
    }

    if (hoursSinceLastSetup !== null) {
      explanation += ` Last valid ${lastSetup.tier || "A"}-tier setup occurred ${hoursSinceLastSetup.toFixed(1)} hours ago.`
    } else {
      explanation += ` No valid setups recorded in current session.`
    }

    return {
      reasonCategory,
      explanation,
      blockingReasons,
      htfState: {
        daily: dailyStructure,
        h4: h4Structure,
        polarity: htfPolarity,
      },
      durationContext: {
        htfNeutralHours: Math.round(htfNeutralHours * 10) / 10,
        hoursSinceLastSetup,
      },
    }
  },

  /**
   * Get formatted duration string for display
   */
  formatDuration: (minutes: number): string => {
    if (minutes < 60) {
      return `${minutes}m`
    }
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours}h ${mins}m`
  },

  /**
   * Check if daily status should be sent (once per 24h max)
   */
  shouldSendDailyStatus: (symbol: string): boolean => {
    const lastSent = lastDailyStatusSent.get(symbol) || 0
    const now = Date.now()
    const twentyFourHours = 24 * 60 * 60 * 1000
    return now - lastSent >= twentyFourHours
  },

  /**
   * Record that daily status was sent
   */
  recordDailyStatusSent: (symbol: string): void => {
    lastDailyStatusSent.set(symbol, Date.now())
    console.log(`[v0] PATIENCE: Daily status sent for ${symbol} at ${new Date().toISOString()}`)
  },

  /**
   * Get all current state for API response
   */
  getFullState: (symbol: string): {
    htfNeutralState: HTFNeutralState
    lastValidSetup: LastValidSetup
  } => {
    return {
      htfNeutralState: { ...getHTFState(symbol) },
      lastValidSetup: { ...getLastSetup(symbol) },
    }
  },

  /**
   * Log current HTF neutral duration
   */
  logNeutralDuration: (symbol: string): void => {
    const state = getHTFState(symbol)
    if (state.neutralStartTime !== null) {
      const durationMs = Date.now() - state.neutralStartTime
      const hours = Math.floor(durationMs / (1000 * 60 * 60))
      const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60))
      console.log(`[v0] HTF NEUTRAL DURATION: ${symbol} = ${hours}h ${minutes}m`)
    }
  },
}
