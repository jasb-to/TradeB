/**
 * NEAR-MISS TRACKER - Redis-Backed with Local Cache
 * 
 * Uses a hybrid approach:
 * - Local in-memory Map for fast sync access within current instance
 * - Redis persistence for cross-instance/cross-deploy visibility
 * - Syncs to Redis after each recordNearMiss call
 */

import type { Signal, EntryDecision } from "@/types/trading"
import { RedisClient } from "./redis-client"

export interface NearMissSetup {
  symbol: string
  direction: "LONG" | "SHORT"
  timestamp: number
  score: number
  scoreThreshold: number
  scorePercentage: number // score / threshold * 100
  scoreGap: number // threshold - score
  blockers: string[] // Rejection reasons
  blockerCount: number
  htfPolarity: string
  structure: string
  mtfBias: Record<string, string | undefined>
  indicatorsSnapshot: {
    adx?: number
    atr?: number
    rsi?: number
    vwap?: number
  }
  classification: "ONE_RULE_AWAY" | "STRUCTURE_DELAY" | "INDICATOR_LAG"
}

interface NearMissState {
  symbol: string
  recentNearMisses: NearMissSetup[]
  stats: {
    count24h: number
    mostCommonBlocker: string | null
    avgScoreGap: number
    longVsShort: { long: number; short: number }
  }
}

// In-memory storage with Redis sync
const nearMissStates: Map<string, NearMissState> = new Map()
const NEAR_MISS_WINDOW = 24 * 60 * 60 * 1000 // 24 hours
const MAX_STORED_NEAR_MISSES = 5
const REDIS_KEY_PREFIX = "near-miss:"

async function syncToRedis(symbol: string): Promise<void> {
  const state = nearMissStates.get(symbol)
  if (state) {
    try {
      await RedisClient.set(
        `${REDIS_KEY_PREFIX}${symbol}`,
        JSON.stringify(state),
        86400 // 24 hours TTL
      )
    } catch (error) {
      console.warn(`[v0] Failed to sync near-miss to Redis: ${error}`)
    }
  }
}

/**
 * CLASSIFICATION LOGIC
 * Determines why the setup was close but not quite entry-ready
 */
function classifyNearMiss(
  blockers: string[],
  indicatorsSnapshot: any
): "ONE_RULE_AWAY" | "STRUCTURE_DELAY" | "INDICATOR_LAG" {
  const blockerText = blockers.join("|").toLowerCase()

  // Structure/HTF polarity issues
  if (blockerText.includes("htf") || blockerText.includes("polarity") || blockerText.includes("structure")) {
    return "STRUCTURE_DELAY"
  }

  // Indicator/momentum issues
  if (
    blockerText.includes("rsi") ||
    blockerText.includes("momentum") ||
    blockerText.includes("adx") ||
    blockerText.includes("trend")
  ) {
    return "INDICATOR_LAG"
  }

  // Single rule away
  return "ONE_RULE_AWAY"
}

function getNearMissState(symbol: string): NearMissState {
  if (!nearMissStates.has(symbol)) {
    nearMissStates.set(symbol, {
      symbol,
      recentNearMisses: [],
      stats: {
        count24h: 0,
        mostCommonBlocker: null,
        avgScoreGap: 0,
        longVsShort: { long: 0, short: 0 },
      },
    })
  }
  return nearMissStates.get(symbol)!
}

function updateStats(state: NearMissState): void {
  const now = Date.now()
  const recentMisses = state.recentNearMisses.filter((nm) => now - nm.timestamp < NEAR_MISS_WINDOW)

  // Count blockers
  const blockerCounts: Record<string, number> = {}
  let totalGap = 0

  for (const miss of recentMisses) {
    for (const blocker of miss.blockers) {
      blockerCounts[blocker] = (blockerCounts[blocker] || 0) + 1
    }
    totalGap += miss.scoreGap
  }

  // Find most common
  let mostCommon: string | null = null
  let maxCount = 0
  for (const [blocker, count] of Object.entries(blockerCounts)) {
    if (count > maxCount) {
      maxCount = count
      mostCommon = blocker
    }
  }

  state.stats.count24h = recentMisses.length
  state.stats.mostCommonBlocker = mostCommon
  state.stats.avgScoreGap = recentMisses.length > 0 ? totalGap / recentMisses.length : 0
  state.stats.longVsShort = {
    long: recentMisses.filter((nm) => nm.direction === "LONG").length,
    short: recentMisses.filter((nm) => nm.direction === "SHORT").length,
  }
}

export const NearMissTracker = {
  /**
   * Evaluate and potentially record a near-miss setup
   * Called AFTER full signal evaluation (non-invasive)
   * Only records if trade was rejected and meets near-miss criteria
   */
  recordNearMiss: (
    signal: Signal,
    entryDecision: EntryDecision,
    scoreThreshold: number,
    indicatorsSnapshot: any
  ): void => {
    // GUARD: Only track if trade was rejected
    if (entryDecision.allowed === true) {
      return
    }

    // GUARD: Score must be ≥ 85% of threshold
    const score = signal.confidence || 0
    const scorePercentage = (score / scoreThreshold) * 100
    if (scorePercentage < 85) {
      return
    }

    // GUARD: Only 1-2 blockers
    const blockersCount = entryDecision.blockedReasons?.length || 0
    if (blockersCount === 0 || blockersCount > 2) {
      return
    }

    // GUARD: HTF polarity must be non-conflicting
    const polarity = signal.htfPolarity
    if (polarity === "NEUTRAL_CONFLICTING" || polarity === "CONFLICTING") {
      return
    }

    // All conditions met - record the near-miss
    const state = getNearMissState(signal.symbol || "UNKNOWN")

    const nearMiss: NearMissSetup = {
      symbol: signal.symbol || "UNKNOWN",
      direction: (signal.direction as "LONG" | "SHORT") || "LONG",
      timestamp: Date.now(),
      score,
      scoreThreshold,
      scorePercentage,
      scoreGap: scoreThreshold - score,
      blockers: entryDecision.blockedReasons || [],
      blockerCount: blockersCount,
      htfPolarity: polarity || "UNKNOWN",
      structure: signal.htfStructure || "UNKNOWN",
      mtfBias: signal.mtfBias || {},
      indicatorsSnapshot: {
        adx: indicatorsSnapshot?.adx,
        atr: indicatorsSnapshot?.atr,
        rsi: indicatorsSnapshot?.rsi,
        vwap: indicatorsSnapshot?.vwap,
      },
      classification: classifyNearMiss(
        entryDecision.blockedReasons || [],
        indicatorsSnapshot
      ),
    }

    // Store (keep last 5)
    state.recentNearMisses.unshift(nearMiss)
    if (state.recentNearMisses.length > MAX_STORED_NEAR_MISSES) {
      state.recentNearMisses.pop()
    }

    updateStats(state)

    // Sync to Redis for persistence
    syncToRedis(state.symbol)

    console.log(
      `[v0] NEAR-MISS: ${signal.symbol} ${signal.direction} - Score ${score.toFixed(1)}/${scoreThreshold} (${scorePercentage.toFixed(0)}%) - Blocked by: ${(entryDecision.blockedReasons || []).join(", ")}`
    )
  },

  /**
   * Get all near-miss data for a symbol
   */
  getNearMisses: (symbol: string): NearMissSetup[] => {
    return getNearMissState(symbol).recentNearMisses
  },

  /**
   * Get stats for a symbol
   */
  getStats: (symbol: string) => {
    return getNearMissState(symbol).stats
  },

  /**
   * Get latest near-miss for a symbol
   */
  getLatest: (symbol: string): NearMissSetup | null => {
    const state = getNearMissState(symbol)
    return state.recentNearMisses.length > 0 ? state.recentNearMisses[0] : null
  },

  /**
   * Get all near-miss states across all symbols
   */
  getAllStates: (): NearMissState[] => {
    return Array.from(nearMissStates.values())
  },

  /**
   * Clear all near-miss data (for testing or reset)
   */
  reset: (): void => {
    nearMissStates.clear()
    console.log("[v0] NEAR-MISS: All states reset")
  },
}
