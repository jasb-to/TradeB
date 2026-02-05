/**
 * B-TRADE TRACKER - Redis-Backed with Local Cache
 * 
 * Uses a hybrid approach:
 * - Local in-memory Map for fast sync access within current instance
 * - Redis persistence for cross-instance/cross-deploy visibility
 * - Syncs to Redis after each recordBSetup call
 */

import type { Signal } from "@/types/trading"
import type { BTradeEvaluationResult } from "./b-trade-evaluator"
import { RedisClient } from "./redis-client"

export interface BTradeRecord {
  timestamp: number
  symbol: string
  direction: string
  classification: string
  blockersCount: number
  mostCommonBlocker: string | null
  indicatorGaps: {
    adxGap: number
    rsiGap: number
    atrGap: number
  }
  upgradeTime?: number // When it upgraded to A/A+ (if ever)
  upgradeReason?: string
}

interface BTradeStats {
  symbol: string
  count24h: number
  totalRecorded: number
  directionalBias: { long: number; short: number }
  upgradedToA: number
  upgradedToAPlus: number
  mostCommonBlocker: string | null
  avgIndicatorGap: {
    adx: number
    rsi: number
    atr: number
  }
}

// In-memory storage with Redis sync
const bTradeRecords: Map<string, BTradeRecord[]> = new Map()
const STORAGE_LIMIT_PER_SYMBOL = 100
const REDIS_KEY_PREFIX = "b-trade:"

async function syncToRedis(symbol: string): Promise<void> {
  const records = bTradeRecords.get(symbol)
  if (records) {
    try {
      await RedisClient.set(
        `${REDIS_KEY_PREFIX}${symbol}`,
        JSON.stringify(records),
        604800 // 7 days TTL
      )
    } catch (error) {
      console.warn(`[v0] Failed to sync B-trade to Redis: ${error}`)
    }
  }
}

export const BTradeTracker = {
  /**
   * Record a B_SETUP evaluation result
   */
  recordBSetup(
    signal: Signal,
    evaluation: BTradeEvaluationResult,
    symbol: string
  ): void {
    if (!evaluation.isValid) {
      return // Don't track invalid evals
    }

    const record: BTradeRecord = {
      timestamp: typeof signal.timestamp === "number" ? signal.timestamp : Date.now(),
      symbol,
      direction: signal.direction || "UNKNOWN",
      classification: evaluation.classification,
      blockersCount: evaluation.blockers.length,
      mostCommonBlocker: evaluation.blockers[0] || null,
      indicatorGaps: evaluation.indicatorGaps,
    }

    if (!bTradeRecords.has(symbol)) {
      bTradeRecords.set(symbol, [])
    }

    const records = bTradeRecords.get(symbol)!
    records.push(record)

    // Keep only recent records (limit memory)
    if (records.length > STORAGE_LIMIT_PER_SYMBOL) {
      records.shift()
    }

    // Sync to Redis for persistence
    syncToRedis(symbol)

    console.log(`[v0] B-TRADE RECORDED: ${symbol} ${signal.direction} ${evaluation.classification}`)
  },

  /**
   * Mark a B-trade as upgraded to A/A+
   */
  recordUpgrade(symbol: string, tier: "A" | "A+", reason: string): void {
    const records = bTradeRecords.get(symbol)
    if (!records || records.length === 0) return

    // Mark the most recent B-trade as upgraded
    const lastRecord = records[records.length - 1]
    lastRecord.upgradeTime = Date.now()
    lastRecord.upgradeReason = reason

    console.log(`[v0] B-TRADE UPGRADED: ${symbol} → ${tier} (${reason})`)
  },

  /**
   * Get stats for a symbol
   */
  getStats(symbol: string): BTradeStats {
    const records = bTradeRecords.get(symbol) || []
    const now = Date.now()
    const day = 24 * 60 * 60 * 1000

    const records24h = records.filter((r) => now - r.timestamp < day)

    const stats: BTradeStats = {
      symbol,
      count24h: records24h.length,
      totalRecorded: records.length,
      directionalBias: { long: 0, short: 0 },
      upgradedToA: 0,
      upgradedToAPlus: 0,
      mostCommonBlocker: null,
      avgIndicatorGap: { adx: 0, rsi: 0, atr: 0 },
    }

    const blockerCounts: Map<string, number> = new Map()
    let totalAdxGap = 0
    let totalRsiGap = 0
    let totalAtrGap = 0

    for (const record of records24h) {
      if (record.direction === "LONG") stats.directionalBias.long++
      if (record.direction === "SHORT") stats.directionalBias.short++

      if (record.upgradeTime) {
        if (record.upgradeReason?.includes("A+")) stats.upgradedToAPlus++
        else if (record.upgradeReason?.includes("A")) stats.upgradedToA++
      }

      if (record.mostCommonBlocker) {
        blockerCounts.set(
          record.mostCommonBlocker,
          (blockerCounts.get(record.mostCommonBlocker) || 0) + 1
        )
      }

      totalAdxGap += record.indicatorGaps.adxGap
      totalRsiGap += record.indicatorGaps.rsiGap
      totalAtrGap += record.indicatorGaps.atrGap
    }

    // Find most common blocker
    let maxCount = 0
    for (const [blocker, count] of blockerCounts.entries()) {
      if (count > maxCount) {
        maxCount = count
        stats.mostCommonBlocker = blocker
      }
    }

    if (records24h.length > 0) {
      stats.avgIndicatorGap.adx = totalAdxGap / records24h.length
      stats.avgIndicatorGap.rsi = totalRsiGap / records24h.length
      stats.avgIndicatorGap.atr = totalAtrGap / records24h.length
    }

    return stats
  },

  /**
   * Get all B-trade records for a symbol (last N records)
   */
  getRecent(symbol: string, limit: number = 5): BTradeRecord[] {
    const records = bTradeRecords.get(symbol) || []
    return records.slice(-limit)
  },

  /**
   * Reset all B-trade data (for testing)
   */
  resetAll(): void {
    bTradeRecords.clear()
    console.log("[v0] B-TRADE TRACKER: All data reset")
  },
}
