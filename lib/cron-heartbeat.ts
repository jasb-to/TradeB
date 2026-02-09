/**
 * CRON HEARTBEAT TRACKER - Redis-Backed Persistent Cron Execution Monitoring
 * 
 * ✅ PERSISTENCE (Redis-Backed):
 * Heartbeats survive:
 * - Vercel deployments/redeploys
 * - Server cold starts
 * - Process restarts
 * - Browser tab reloads
 * 
 * Uses Upstash Redis via environment variables:
 * - UPSTASH_REDIS_REST_URL
 * - UPSTASH_REDIS_REST_TOKEN
 */

import { RedisClient } from "./redis-client"

export interface CronHeartbeat {
  symbol: string
  lastExecutionTime: number | null
  lastExecutionStatus: "SUCCESS" | "FAILED" | "UNKNOWN"
  executionCount: number
  timeSinceLastExecution: number | null // milliseconds
}

const HEARTBEAT_KEY_PREFIX = "cron:heartbeat:"
const HEARTBEAT_TTL = 86400 * 7 // 7 days

async function getHeartbeat(symbol: string): Promise<CronHeartbeat> {
  try {
    const stored = await RedisClient.get(`${HEARTBEAT_KEY_PREFIX}${symbol}`)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (error) {
    console.warn(`[v0] Failed to fetch heartbeat from Redis: ${error}`)
  }

  // Return default if not found
  return {
    symbol,
    lastExecutionTime: null,
    lastExecutionStatus: "UNKNOWN",
    executionCount: 0,
    timeSinceLastExecution: null,
  }
}

async function saveHeartbeat(heartbeat: CronHeartbeat): Promise<void> {
  try {
    await RedisClient.set(
      `${HEARTBEAT_KEY_PREFIX}${heartbeat.symbol}`,
      JSON.stringify(heartbeat),
      HEARTBEAT_TTL
    )
  } catch (error) {
    console.warn(`[v0] Failed to save heartbeat to Redis: ${error}`)
  }
}

export const CronHeartbeat = {
  /**
   * Record a successful cron execution for a symbol
   */
  recordExecution: async (symbol: string): Promise<void> => {
    try {
      const heartbeat = await getHeartbeat(symbol)
      heartbeat.lastExecutionTime = Date.now()
      heartbeat.lastExecutionStatus = "SUCCESS"
      heartbeat.executionCount += 1
      await saveHeartbeat(heartbeat)
      console.log(
        `[v0] HEARTBEAT: ${symbol} - Execution #${heartbeat.executionCount} at ${new Date(heartbeat.lastExecutionTime).toISOString()}`
      )
    } catch (err) {
      console.error(`[v0] HEARTBEAT RECORD EXECUTION ERROR: ${symbol} - ${err}`)
    }
  },

  /**
   * Record a failed cron execution
   */
  recordFailure: async (symbol: string, error?: Error | string): Promise<void> => {
    try {
      const heartbeat = await getHeartbeat(symbol)
      heartbeat.lastExecutionTime = Date.now()
      heartbeat.lastExecutionStatus = "FAILED"
      const errorMsg = typeof error === "string" ? error : error?.message || "Unknown error"
      await saveHeartbeat(heartbeat)
      console.error(
        `[v0] HEARTBEAT FAILURE: ${symbol} - ${errorMsg} at ${new Date(heartbeat.lastExecutionTime).toISOString()}`
      )
    } catch (err) {
      console.error(`[v0] HEARTBEAT RECORD FAILURE ERROR: ${symbol} - ${err}`)
    }
  },

  /**
   * Get current heartbeat status for a symbol (async)
   */
  getStatus: async (symbol: string): Promise<CronHeartbeat> => {
    const heartbeat = await getHeartbeat(symbol)
    const now = Date.now()

    return {
      ...heartbeat,
      timeSinceLastExecution: heartbeat.lastExecutionTime ? now - heartbeat.lastExecutionTime : null,
    }
  },

  /**
   * Get formatted time since last execution for display
   */
  getFormattedTimeSinceExecution: async (symbol: string): Promise<string> => {
    const heartbeat = await getHeartbeat(symbol)
    if (!heartbeat.lastExecutionTime) {
      return "Never (post-deploy)"
    }

    const timeSinceMs = Date.now() - heartbeat.lastExecutionTime
    const seconds = Math.floor(timeSinceMs / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (seconds < 60) {
      return `${seconds}s ago`
    } else if (minutes < 60) {
      return `${minutes}m ago`
    } else if (hours < 24) {
      return `${hours}h ago`
    } else {
      return `${days}d ago`
    }
  },

  /**
   * Get health status indicator
   */
  getHealthStatus: async (symbol: string): Promise<"HEALTHY" | "STALE" | "FAILED" | "UNKNOWN"> => {
    const heartbeat = await getHeartbeat(symbol)

    if (heartbeat.lastExecutionStatus === "FAILED") {
      return "FAILED"
    }

    if (!heartbeat.lastExecutionTime) {
      return "UNKNOWN"
    }

    const timeSinceMs = Date.now() - heartbeat.lastExecutionTime
    const timeSinceMinutes = timeSinceMs / (1000 * 60)

    // Cron should run every 2-5 minutes, alert if > 15 minutes
    if (timeSinceMinutes > 15) {
      return "STALE"
    }

    return "HEALTHY"
  },

  /**
   * Get all heartbeats for dashboard display (async)
   */
  getAllHeartbeats: async (): Promise<CronHeartbeat[]> => {
    const keys = await RedisClient.keys(`${HEARTBEAT_KEY_PREFIX}*`)
    const heartbeats: CronHeartbeat[] = []

    for (const key of keys) {
      const symbol = key.replace(HEARTBEAT_KEY_PREFIX, "")
      const hb = await getHeartbeat(symbol)
      heartbeats.push({
        ...hb,
        timeSinceLastExecution: hb.lastExecutionTime ? Date.now() - hb.lastExecutionTime : null,
      })
    }

    return heartbeats
  },

  /**
   * Format timestamp for display
   */
  formatTimestamp: (timestamp: number | null): string => {
    if (!timestamp) return "Never"
    const date = new Date(timestamp)
    const now = new Date()
    const isSameDay = date.toDateString() === now.toDateString()

    if (isSameDay) {
      return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    }
    return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
  },

  /**
   * Reset all heartbeats in Redis
   */
  resetAll: async (): Promise<void> => {
    const keys = await RedisClient.keys(`${HEARTBEAT_KEY_PREFIX}*`)
    for (const key of keys) {
      await RedisClient.delete(key)
    }
    console.log("[v0] HEARTBEAT: All heartbeats reset from Redis")
  },
}
