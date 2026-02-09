import type { Signal } from "@/types/trading"

// Trade State Machine: IDLE → IN_TRADE → IDLE
type TradeState = "IDLE" | "IN_TRADE"

interface CachedSignal {
  signal: Signal
  timestamp: number
  hash: string
  symbol: string
  setupHash: string // Hash of the setup idea itself (not just the signal)
}

interface TradeStateData {
  state: TradeState
  stateChangeTime: number
  lastTradedSetupHash: string | null // Never re-alert on this setup
  failedSetupHashes: Set<string> // Setups that resulted in losses
  entryWindowStart: number | null
  entryWindowExpiry: number | null
  lastAlertedSetupHash: string | null
}

const CACHE_DURATION = 30000 // 30 second cache
const GOLD_ENTRY_WINDOW = 15 * 60 * 1000 // 15 minute validity window
const SILVER_ENTRY_WINDOW = 20 * 60 * 1000 // 20 minute validity window

// Symbol-based cache
let cachedSignals: Map<string, CachedSignal> = new Map()

// Simplified trade state machine (removed cooldown)
let tradeStates: Map<string, TradeStateData> = new Map()

function generateSetupHash(signal: Signal, symbol: string): string {
  // Hash based on the SETUP IDEA itself, not the current entry price
  // This prevents re-alerting on the same setup at different prices
  const key = [
    symbol,
    signal.direction || "none",
    signal.strategy || "unknown",
    Math.round((signal.entryPrice || 0) / 10) * 10, // Round entry to nearest $10 to group similar setups
    signal.mtfBias?.daily || "?",
    signal.mtfBias?.["4h"] || "?",
    signal.mtfBias?.["1h"] || "?",
  ].join("|")

  let hash = 0
  for (let i = 0; i < key.length; i++) {
    const char = key.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash
  }
  return hash.toString(16)
}

function getTradeState(symbol: string): TradeStateData {
  if (!tradeStates.has(symbol)) {
    tradeStates.set(symbol, {
      state: "IDLE",
      stateChangeTime: Date.now(),
      lastTradedSetupHash: null,
      failedSetupHashes: new Set(),
      entryWindowStart: null,
      entryWindowExpiry: null,
      lastAlertedSetupHash: null,
    })
  }
  return tradeStates.get(symbol)!
}

function getEntryWindowDuration(symbol: string): number {
  return symbol.includes("XAU") ? GOLD_ENTRY_WINDOW : SILVER_ENTRY_WINDOW
}

// Symbol-based alert states
let alertStates: Map<string, AlertState> = new Map()

interface AlertState {
  lastAlertTime: number
  lastAlertType: string | null
  lastAlertDirection: string | null
  lastAlertLevel: number
  consecutiveNoTrades: number
  lastSignalHash: string | null
  lastSentHash: string | null
  activeTrade: Signal | null // Track the active trade to prevent replacement
  activeTradeTime: number // When the active trade was created
  tp1Level: number | null // TP1 price level for monitoring
  tp2Level: number | null // TP2 price level for monitoring
  tp1Reached: boolean // Has TP1 been hit yet
  tp1AlertSent: boolean // Have we alerted about TP1
}

const ALERT_COOLDOWN_MS = 5 * 60 * 1000 // 5 minute cooldown between similar alerts
const ACTIVE_TRADE_DURATION = 24 * 60 * 60 * 1000 // 24 hour max trade duration
const MAX_CONSECUTIVE_NO_TRADES = 10

function generateSignalHash(signal: Signal): string {
  // Create a hash based on key signal properties for deduplication
  const key = [
    signal.type,
    signal.direction || "none",
    signal.strategy,
    signal.alertLevel,
    Math.round((signal.entryPrice || 0) * 100) / 100, // Round to 2 decimals
    Math.round((signal.confidence || 0) / 5) * 5, // Round confidence to nearest 5
  ].join("|")

  // Simple hash function
  let hash = 0
  for (let i = 0; i < key.length; i++) {
    const char = key.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32bit integer
  }
  return hash.toString(16)
}

function getAlertState(symbol: string): AlertState {
  if (!alertStates.has(symbol)) {
    alertStates.set(symbol, {
      lastAlertTime: 0,
      lastAlertType: null,
      lastAlertDirection: null,
      lastAlertLevel: 0,
      consecutiveNoTrades: 0,
      lastSignalHash: null,
      lastSentHash: null,
      activeTrade: null,
      activeTradeTime: 0,
      tp1Level: null,
      tp2Level: null,
      tp1Reached: false,
      tp1AlertSent: false,
    })
  }
  return alertStates.get(symbol)!
}

export const SignalCache = {
  get: (symbol: string): Signal | null => {
    const state = getAlertState(symbol)
    
    // If there's an active trade and it hasn't expired, return it
    if (state.activeTrade && Date.now() - state.activeTradeTime < ACTIVE_TRADE_DURATION) {
      console.log(`[v0] Returning active trade for ${symbol} (${Math.round((Date.now() - state.activeTradeTime) / 1000)}s old)`)
      return state.activeTrade
    }

    // Otherwise get from cache
    const cached = cachedSignals.get(symbol)
    if (!cached) return null
    if (Date.now() - cached.timestamp > CACHE_DURATION) {
      cachedSignals.delete(symbol)
      return null // Cache expired
    }
    return cached.signal
  },

  set: (signal: Signal, symbol: string): void => {
    const setupHash = generateSetupHash(signal, symbol)
    const state = getTradeState(symbol)

    // Auto-expire entry window if exceeded
    if (state.entryWindowExpiry && Date.now() > state.entryWindowExpiry) {
      console.log(`[v0] ${symbol} ENTRY WINDOW EXPIRED - Setup is now stale`)
      state.entryWindowStart = null
      state.entryWindowExpiry = null
    }

    const hash = generateSignalHash(signal)

    if (signal.type === "NO_TRADE" || signal.type === "EXIT") {
      // Exit state - clear trade state
      state.state = "IDLE"
      state.stateChangeTime = Date.now()
    }

    cachedSignals.set(symbol, {
      signal,
      timestamp: Date.now(),
      hash: `${signal.type}_${signal.direction}`,
      symbol,
      setupHash,
    })
  },

  getTradeState: (symbol: string): TradeState => {
    return getTradeState(symbol).state
  },

  setTradeState: (symbol: string, newState: TradeState, reason: string): void => {
    const state = getTradeState(symbol)
    const oldState = state.state
    state.state = newState
    state.stateChangeTime = Date.now()

    if (newState === "IN_TRADE") {
      state.entryWindowStart = Date.now()
      state.entryWindowExpiry = Date.now() + getEntryWindowDuration(symbol)
      console.log(`[v0] ${symbol} → IN_TRADE | Entry window valid for ${Math.round(getEntryWindowDuration(symbol) / 60000)}min`)
    } else if (newState === "IDLE") {
      console.log(`[v0] ${symbol} → IDLE | Reason: ${reason}`)
    }
  },

  canAlertSetup: (signal: Signal, symbol: string): { allowed: boolean; reason: string } => {
    const state = getTradeState(symbol)
    const setupHash = generateSetupHash(signal, symbol)
    const now = Date.now()

    if (state.state === "IN_TRADE") {
      return { allowed: false, reason: `BLOCKED: Trade already active for ${symbol}` }
    }

    if (state.lastAlertedSetupHash === setupHash) {
      return { allowed: false, reason: `BLOCKED: Same setup already alerted (setupHash: ${setupHash})` }
    }

    if (state.failedSetupHashes.has(setupHash)) {
      return { allowed: false, reason: `BLOCKED: This setup previously resulted in a loss` }
    }

    if (state.entryWindowExpiry && now > state.entryWindowExpiry) {
      return { allowed: false, reason: `BLOCKED: Entry window expired for ${symbol}` }
    }

    return { allowed: true, reason: "APPROVED: All conditions met" }
  },

  recordAlertSent: (signal: Signal, symbol: string): void => {
    const state = getTradeState(symbol)
    const setupHash = generateSetupHash(signal, symbol)
    state.lastAlertedSetupHash = setupHash
    state.lastTradedSetupHash = setupHash
    console.log(`[v0] Alert recorded for ${symbol} (setupHash: ${setupHash})`)
  },

  recordLoss: (symbol: string): void => {
    const state = getTradeState(symbol)
    if (state.lastTradedSetupHash) {
      state.failedSetupHashes.add(state.lastTradedSetupHash)
      console.log(`[v0] ${symbol} Loss recorded - blacklisting setupHash ${state.lastTradedSetupHash}`)
    }
  },

  recordWin: (symbol: string): void => {
    const state = getTradeState(symbol)
    console.log(`[v0] ${symbol} Win recorded - setup is good`)
  },

  getTimestamp: (symbol: string): number => cachedSignals.get(symbol)?.timestamp || 0,

  getHash: (symbol: string): string | null => cachedSignals.get(symbol)?.hash || null,

  clear: (symbol?: string): void => {
    if (symbol) {
      cachedSignals.delete(symbol)
    } else {
      cachedSignals.clear()
    }
  },

  // Clear active trade when direction changes or TP2 is hit
  clearActiveTrade: (symbol: string): void => {
    const state = getAlertState(symbol)
    if (state.activeTrade) {
      console.log(`[v0] ${symbol} Active trade cleared (was ${state.activeTrade.direction} @ ${state.activeTrade.entryPrice})`)
    }
    state.activeTrade = null
    state.activeTradeTime = 0
  },

  // NEW: Store TP1/TP2 levels when entry alert sent
  storeTakeProfitLevels: (symbol: string, tp1: number, tp2: number): void => {
    const state = getAlertState(symbol)
    state.tp1Level = tp1
    state.tp2Level = tp2
    state.tp1Reached = false
    state.tp1AlertSent = false
    console.log(`[v0] ${symbol} TP levels stored: TP1=$${tp1.toFixed(2)}, TP2=$${tp2.toFixed(2)}`)
  },

  // NEW: Check if TP1 has been reached (price touched TP1 level)
  checkTP1Reached: (symbol: string, currentPrice: number): boolean => {
    const state = getAlertState(symbol)
    if (!state.tp1Level) return false
    
    const direction = state.activeTrade?.direction
    if (!direction) return false

    // For LONG: price >= TP1
    // For SHORT: price <= TP1
    const reached = direction === "LONG" ? currentPrice >= state.tp1Level : currentPrice <= state.tp1Level
    
    if (reached && !state.tp1Reached) {
      state.tp1Reached = true
      console.log(`[v0] ${symbol} TP1 REACHED at $${currentPrice.toFixed(2)} (TP1=$${state.tp1Level.toFixed(2)})`)
    }
    
    return state.tp1Reached
  },

  // NEW: Check if TP2 has been reached
  checkTP2Reached: (symbol: string, currentPrice: number): boolean => {
    const state = getAlertState(symbol)
    if (!state.tp2Level) return false
    
    const direction = state.activeTrade?.direction
    if (!direction) return false

    // For LONG: price >= TP2
    // For SHORT: price <= TP2
    return direction === "LONG" ? currentPrice >= state.tp2Level : currentPrice <= state.tp2Level
  },

  // NEW: Get TP level info for monitoring
  getTPLevels: (symbol: string): { tp1: number | null; tp2: number | null; tp1Reached: boolean } => {
    const state = getAlertState(symbol)
    return {
      tp1: state.tp1Level,
      tp2: state.tp2Level,
      tp1Reached: state.tp1Reached,
    }
  },

  // NEW: Mark TP1 alert as sent
  recordTP1Alert: (symbol: string): void => {
    const state = getAlertState(symbol)
    state.tp1AlertSent = true
    console.log(`[v0] TP1 alert recorded for ${symbol}`)
  },

  // NEW: Clear TP levels when trade is closed
  clearTPLevels: (symbol: string): void => {
    const state = getAlertState(symbol)
    state.tp1Level = null
    state.tp2Level = null
    state.tp1Reached = false
    state.tp1AlertSent = false
    console.log(`[v0] TP levels cleared for ${symbol}`)
  },

  // Alert management methods
  shouldSendAlert: (signal: Signal, symbol: string): boolean => {
    const now = Date.now()
    const hash = generateSignalHash(signal)
    const state = getAlertState(symbol)

    // Signal type is already correct from Signal interface
    const signalType = signal.type

    console.log(`[v0] shouldSendAlert check for ${symbol}: type=${signalType} level=${signal.alertLevel} dir=${signal.direction}`)
    console.log(`[v0] Alert state: lastType=${state.lastAlertType} lastDir=${state.lastAlertDirection} lastTime=${Date.now() - state.lastAlertTime}ms ago hash=${hash} lastSent=${state.lastSentHash}`)

    // Always alert on EXIT signals
    if (signalType === "EXIT") {
      console.log(`[v0] ${symbol} EXIT signal - ALERTING`)
      return true
    }

    // Don't alert on NO_TRADE
    if (signalType === "NO_TRADE" || signal.alertLevel === 0) {
      console.log(`[v0] ${symbol} Skipping NO_TRADE or alertLevel 0`)
      return false
    }

    // CRITICAL: Never send same hash twice (absolute duplicate prevention)
    if (hash === state.lastSentHash) {
      console.log(`[v0] ${symbol} BLOCKED - Hash ${hash} already sent, absolute duplicate`)
      return false
    }

    // Check for duplicate signal (same hash within cooldown)
    if (hash === state.lastSignalHash && now - state.lastAlertTime < ALERT_COOLDOWN_MS) {
      console.log(`[v0] ${symbol} Signal deduplicated - same hash (${hash}) within ${Math.round((ALERT_COOLDOWN_MS - (now - state.lastAlertTime)) / 1000)}s cooldown`)
      return false
    }

    // Check cooldown for same type/direction/level
    if (
      signalType === state.lastAlertType &&
      signal.direction === state.lastAlertDirection &&
      signal.alertLevel === state.lastAlertLevel &&
      now - state.lastAlertTime < ALERT_COOLDOWN_MS
    ) {
      console.log(`[v0] ${symbol} Alert suppressed - cooldown active for ${signalType}/${signal.direction} (${Math.round((ALERT_COOLDOWN_MS - (now - state.lastAlertTime)) / 1000)}s remaining)`)
      return false
    }

    // Alert on new ENTRY signals with level 2+
    if (signalType === "ENTRY" && signal.alertLevel >= 2) {
      console.log(`[v0] ${symbol} ENTRY with alertLevel=${signal.alertLevel}, checking conditions...`)
      
      // New direction - always alert
      if (signal.direction !== state.lastAlertDirection) {
        console.log(`[v0] ${symbol} NEW DIRECTION: ${state.lastAlertDirection} -> ${signal.direction} - ALERTING`)
        return true
      }

      // Upgraded alert level
      if (signal.alertLevel > state.lastAlertLevel) {
        console.log(`[v0] ${symbol} UPGRADED LEVEL: ${state.lastAlertLevel} -> ${signal.alertLevel} - ALERTING`)
        return true
      }

      // First ENTRY after NO_TRADE streak
      if (state.lastAlertType !== "ENTRY") {
        console.log(`[v0] ${symbol} FIRST ENTRY after ${state.lastAlertType} - ALERTING`)
        return true
      }
    }

    // Alert on level 1 signals only if it's a genuinely new setup
    if (
      signal.alertLevel === 1 &&
      (state.lastAlertType !== "ENTRY" || signal.direction !== state.lastAlertDirection)
    ) {
      // But require longer cooldown for level 1
      if (now - state.lastAlertTime < ALERT_COOLDOWN_MS * 2) {
        return false
      }
      return true
    }

    console.log(`[v0] ${symbol} No alert condition met`)
    return false
  },

  recordAlert: (signal: Signal, symbol: string): void => {
    const state = getAlertState(symbol)
    const hash = generateSignalHash(signal)
    
    state.lastAlertTime = Date.now()
    state.lastAlertType = signal.type
    state.lastAlertDirection = signal.direction || null
    state.lastAlertLevel = signal.alertLevel
    state.lastSignalHash = hash
    state.lastSentHash = hash // Mark this hash as sent to prevent resends
    
    console.log(`[v0] Alert recorded for ${symbol}: hash=${hash} time=${new Date().toLocaleTimeString()}`)
  },

  // CRITICAL FIX: Return the actual mutable reference, NOT a spread copy.
  // The external-cron route mutates alertState.activeTrade directly — a spread
  // copy meant those mutations were silently lost, breaking TP monitoring and
  // direction-change detection.
  getAlertState: (symbol: string): AlertState => getAlertState(symbol),

  getConsecutiveNoTrades: (symbol: string): number => getAlertState(symbol).consecutiveNoTrades,

  // For confidence degradation - if we've had many NO_TRADE signals,
  // require higher confidence for new signals
  getConfidenceThreshold: (symbol: string): number => {
    const state = getAlertState(symbol)
    if (state.consecutiveNoTrades >= MAX_CONSECUTIVE_NO_TRADES) {
      return 70 // Require 70% confidence after long NO_TRADE streak
    }
    if (state.consecutiveNoTrades >= 5) {
      return 60 // Require 60% after moderate streak
    }
    return 50 // Default threshold
  },

  resetAlertState: (symbol?: string): void => {
    if (symbol) {
      alertStates.delete(symbol)
    } else {
      alertStates.clear()
    }
  },

  // NEW: Reset state for a specific symbol (for immediate fixes)
  resetState: (symbol: string): void => {
    console.log(`[v0] RESET_STATE CALLED for ${symbol}`)
    
    // Check if state exists
    if (!tradeStates.has(symbol)) {
      console.log(`[v0] WARNING: No state found for ${symbol}, creating new state`)
      getTradeState(symbol)
    }
    
    const state = getTradeState(symbol)
    console.log(`[v0] Current state before reset:`, JSON.stringify(state, null, 2))
    
    // Clear all state-related properties
    state.state = "IDLE"
    state.stateChangeTime = Date.now()
    state.lastTradedSetupHash = null
    state.entryWindowStart = null
    state.entryWindowExpiry = null
    
    // Also clear alert state
    const alertState = getAlertState(symbol)
    alertState.lastAlertTime = 0
    alertState.lastAlertType = null
    alertState.lastAlertDirection = null
    alertState.lastAlertLevel = 0
    alertState.consecutiveNoTrades = 0
    alertState.lastSignalHash = null
    alertState.lastSentHash = null
    alertState.activeTrade = null
    alertState.activeTradeTime = 0
    alertState.tp1Level = null
    alertState.tp2Level = null
    alertState.tp1Reached = false
    alertState.tp1AlertSent = false
    
    console.log(`[v0] State after reset:`, JSON.stringify(state, null, 2))
    console.log(`[v0] Alert state after reset:`, JSON.stringify(alertState, null, 2))
    console.log(`[v0] STATE RESET for ${symbol} - State cleared and ready for new trades`)
    
    // Force update the tradeStates map
    tradeStates.set(symbol, state)
    alertStates.set(symbol, alertState)
    console.log(`[v0] Updated tradeStates and alertStates maps for ${symbol}`)
  },

  // NEW: Get detailed state information for debugging
  getDetailedState: (symbol: string): any => {
    const state = getTradeState(symbol)
    const alertState = getAlertState(symbol)
    return {
      symbol,
      tradeState: state.state,
      stateChangeTime: new Date(state.stateChangeTime).toISOString(),
      lastTradedSetupHash: state.lastTradedSetupHash,
      failedSetupHashes: Array.from(state.failedSetupHashes),
      entryWindowStart: state.entryWindowStart ? new Date(state.entryWindowStart).toISOString() : null,
      entryWindowExpiry: state.entryWindowExpiry ? new Date(state.entryWindowExpiry).toISOString() : null,
      timeUntilEntryWindowEnd: state.entryWindowExpiry ? Math.max(0, state.entryWindowExpiry - Date.now()) : 0,
      alertState: {
        lastAlertTime: new Date(alertState.lastAlertTime).toISOString(),
        lastAlertType: alertState.lastAlertType,
        lastAlertDirection: alertState.lastAlertDirection,
        lastAlertLevel: alertState.lastAlertLevel,
        consecutiveNoTrades: alertState.consecutiveNoTrades,
        lastSignalHash: alertState.lastSignalHash,
        lastSentHash: alertState.lastSentHash,
        activeTrade: alertState.activeTrade ? {
          type: alertState.activeTrade.type,
          direction: alertState.activeTrade.direction,
          entryPrice: alertState.activeTrade.entryPrice,
          timestamp: new Date(alertState.activeTradeTime).toISOString()
        } : null
      }
    }
  },
}
