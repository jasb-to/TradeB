import type { Signal } from "@/types/trading"

interface SilverTradeState {
  direction: "LONG" | "SHORT" | "NONE"
  entryPrice: number
  stopLoss: number
  tp1: number
  tp2: number
  entryTime: number
  lastBias: "LONG" | "SHORT" | "NEUTRAL"
  status: "ACTIVE" | "CLOSED_TP" | "CLOSED_SL"
}

interface SilverAlertState {
  lastEntryAlertTime: number
  lastEntryAlertDirection: "LONG" | "SHORT" | "NONE"
  lastGetReadyAlertTime: number
  lastGetReadyAlertDirection: "LONG" | "SHORT" | "NONE"
  currentTradeState: SilverTradeState | null
}

const CACHE_DURATION = 30000 // 30 seconds
const ENTRY_ALERT_COOLDOWN_MS = 60 * 60 * 1000 // 1 hour between entry alerts for same direction
const GET_READY_ALERT_COOLDOWN_MS = 30 * 60 * 1000 // 30 minutes between "get ready" alerts for same direction
const TRADE_LOCK_DURATION_MS = 24 * 60 * 60 * 1000 // 24 hours (until TP2/SL is hit)

let cachedSignal: Signal | null = null
let cacheTimestamp: number = 0
let alertState: SilverAlertState = {
  lastEntryAlertTime: 0,
  lastEntryAlertDirection: "NONE",
  lastGetReadyAlertTime: 0,
  lastGetReadyAlertDirection: "NONE",
  currentTradeState: null,
}

function isWithinTradingSession(): boolean {
  const now = new Date()
  const utcHour = now.getUTCHours()
  // Allow trading between 07:00 UTC and 17:00 UTC (16:59:59)
  return utcHour >= 7 && utcHour < 17
}

export const SilverCache = {
  set: (signal: Signal): void => {
    cachedSignal = signal
    cacheTimestamp = Date.now()
    console.log(`[v0] SILVER CACHE: Signal cached - type=${signal.type} direction=${signal.direction}`)
  },

  get: (): Signal | null => {
    if (!cachedSignal) return null

    const age = Date.now() - cacheTimestamp
    if (age > CACHE_DURATION) {
      console.log(`[v0] SILVER CACHE: Expired (age=${age}ms)`)
      cachedSignal = null
      return null
    }

    return cachedSignal
  },

  // Session filter: block all entries outside trading window
  isSessionAllowed: (): boolean => {
    return isWithinTradingSession()
  },

  getSessionStatus: (): string => {
    const now = new Date()
    const utcHour = now.getUTCHours()
    if (utcHour < 7) {
      return `REJECTED: Outside session (${utcHour}:00 UTC, next session 07:00 UTC)`
    }
    if (utcHour >= 17) {
      return `REJECTED: Outside session (${utcHour}:00 UTC, next session tomorrow 07:00 UTC)`
    }
    return `ALLOWED: Inside trading session (${utcHour}:00 UTC)`
  },

  // ONE TRADE RULE: Check if direction is already locked
  isDirectionLocked: (direction: "LONG" | "SHORT"): boolean => {
    if (!alertState.currentTradeState) return false
    if (alertState.currentTradeState.direction !== direction) return false
    if (alertState.currentTradeState.status !== "ACTIVE") return false

    const lockAge = Date.now() - alertState.currentTradeState.entryTime
    if (lockAge > TRADE_LOCK_DURATION_MS) {
      // Lock expired, clear it
      alertState.currentTradeState = null
      return false
    }

    return true
  },

  // ONE TRADE RULE: Lock a direction after entry alert
  lockDirection: (signal: Signal): void => {
    if (signal.direction === "NONE") return

    alertState.currentTradeState = {
      direction: signal.direction as "LONG" | "SHORT",
      entryPrice: signal.entryPrice || 0,
      stopLoss: signal.stopLoss || 0,
      tp1: signal.takeProfit1 || 0,
      tp2: signal.takeProfit2 || 0,
      entryTime: Date.now(),
      lastBias: signal.direction,
      status: "ACTIVE",
    }

    console.log(`[v0] SILVER: Locked ${signal.direction} trade at $${signal.entryPrice?.toFixed(2)}`)
  },

  // Release lock when TP2 or SL is hit
  releaseDirectionLock: (direction: "LONG" | "SHORT", reason: "TP2" | "SL"): void => {
    if (!alertState.currentTradeState || alertState.currentTradeState.direction !== direction) {
      return
    }

    alertState.currentTradeState.status = reason === "TP2" ? "CLOSED_TP" : "CLOSED_SL"
    console.log(`[v0] SILVER: Released ${direction} lock - ${reason} hit`)

    // Only clear state if TP2 hit, keep SL state for bias reset check
    if (reason === "TP2") {
      alertState.currentTradeState = null
      alertState.lastEntryAlertDirection = "NONE"
    }
  },

  // Check if bias has fully reset (direction flip OR ADX recovered)
  hasBiasReset: (currentBias: "LONG" | "SHORT" | "NEUTRAL", currentADX: number): boolean => {
    if (!alertState.currentTradeState) return true

    const previousBias = alertState.currentTradeState.lastBias
    const tradeDirection = alertState.currentTradeState.direction

    // Bias fully reversed
    if (previousBias === "LONG" && currentBias === "SHORT") {
      console.log("[v0] SILVER: Bias reset - LONG→SHORT flip")
      return true
    }
    if (previousBias === "SHORT" && currentBias === "LONG") {
      console.log("[v0] SILVER: Bias reset - SHORT→LONG flip")
      return true
    }

    // Bias became neutral
    if (currentBias === "NEUTRAL") {
      console.log("[v0] SILVER: Bias reset - NEUTRAL state")
      return true
    }

    return false
  },

  // ENTRY ALERT: Check if we can send entry alert
  canSendEntryAlert: (signal: Signal): { allowed: boolean; reason: string } => {
    // Must be A or A+ setup
    if (signal.type !== "ENTRY" || signal.setupQuality !== "A" && signal.setupQuality !== "A+") {
      return { allowed: false, reason: "Not an A/A+ entry signal" }
    }

    // Check session
    if (!isWithinTradingSession()) {
      return { allowed: false, reason: `REJECTED: ${SilverCache.getSessionStatus()}` }
    }

    // Check ONE TRADE RULE
    if (SilverCache.isDirectionLocked(signal.direction!)) {
      return {
        allowed: false,
        reason: `BLOCKED: ${signal.direction} trade already active (one trade per direction rule)`,
      }
    }

    // No same setup re-alert (cooldown)
    const now = Date.now()
    if (
      alertState.lastEntryAlertDirection === signal.direction &&
      now - alertState.lastEntryAlertTime < ENTRY_ALERT_COOLDOWN_MS
    ) {
      const minutesLeft = Math.ceil((ENTRY_ALERT_COOLDOWN_MS - (now - alertState.lastEntryAlertTime)) / 60000)
      return { allowed: false, reason: `Cooldown: ${minutesLeft}min until next ${signal.direction} alert` }
    }

    return { allowed: true, reason: "Entry alert approved" }
  },

  recordEntryAlert: (signal: Signal): void => {
    alertState.lastEntryAlertTime = Date.now()
    alertState.lastEntryAlertDirection = signal.direction!
    SilverCache.lockDirection(signal)
    console.log(`[v0] SILVER: Entry alert recorded - ${signal.setupQuality} ${signal.direction}`)
  },

  // GET READY ALERT: Check if we can send "setup forming" alert
  canSendGetReadyAlert: (setupConditionPercentage: number, bias: "LONG" | "SHORT" | "NEUTRAL"): { allowed: boolean; reason: string } => {
    // Must be 80%+ of conditions met
    if (setupConditionPercentage < 0.8) {
      return { allowed: false, reason: `Only ${(setupConditionPercentage * 100).toFixed(0)}% conditions met (need ≥80%)` }
    }

    // Check session
    if (!isWithinTradingSession()) {
      return { allowed: false, reason: SilverCache.getSessionStatus() }
    }

    // No duplicate get-ready alerts for same direction
    const now = Date.now()
    if (
      bias !== "NEUTRAL" &&
      alertState.lastGetReadyAlertDirection === bias &&
      now - alertState.lastGetReadyAlertTime < GET_READY_ALERT_COOLDOWN_MS
    ) {
      const minutesLeft = Math.ceil((GET_READY_ALERT_COOLDOWN_MS - (now - alertState.lastGetReadyAlertTime)) / 60000)
      return { allowed: false, reason: `Get-ready cooldown: ${minutesLeft}min for ${bias}` }
    }

    return { allowed: true, reason: "Get-ready alert approved" }
  },

  recordGetReadyAlert: (bias: "LONG" | "SHORT" | "NEUTRAL"): void => {
    alertState.lastGetReadyAlertTime = Date.now()
    alertState.lastGetReadyAlertDirection = bias
    console.log(`[v0] SILVER: Get-ready alert recorded - ${bias} setup forming`)
  },

  clear: (): void => {
    cachedSignal = null
    console.log("[v0] SILVER CACHE: Cleared")
  },
}
