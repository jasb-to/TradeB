import { Redis } from "@upstash/redis"

// Trade status enum - tracks lifecycle from entry to close
export enum TradeStatus {
  ACTIVE = "ACTIVE",
  TP1_HIT = "TP1_HIT",
  TP2_HIT = "TP2_HIT",
  SL_HIT = "SL_HIT",
  MANUALLY_CLOSED = "MANUALLY_CLOSED",
}

// PRODUCTION SAFETY: Redis is MANDATORY for live trading systems
// Fail fast if not configured - silent fallback is dangerous
const validateRedisConfig = () => {
  const url = process.env.KV_REST_API_URL
  const token = process.env.KV_REST_API_TOKEN
  
  if (!url || !token) {
    const env = process.env.NODE_ENV || "development"
    const message = `Redis not configured (KV_REST_API_URL/KV_REST_API_TOKEN missing)`
    
    if (env === "production") {
      console.error(`[REDIS] CRITICAL: ${message}`)
      console.error("[REDIS] Production requires Redis for trade persistence & atomic operations")
      throw new Error(`${message}. Production boot aborted.`)
    } else {
      console.warn(`[REDIS] ${message}. Development mode - falling back to in-memory (NOT persistent)`)
      return null
    }
  }
  
  return { url, token }
}

const redisConfig = validateRedisConfig()
const redis: Redis | null = redisConfig ? new Redis(redisConfig) : null

if (redis) {
  console.log("[REDIS] Connected to Upstash Redis - trade persistence ACTIVE")
} else {
  console.warn("[REDIS] Running in memory-only mode - trades will NOT persist across deployments")
}

export interface ActiveTrade {
  id: string
  symbol: string
  direction: "LONG" | "SHORT"
  entry: number
  stopLoss: number
  takeProfit1: number
  takeProfit2: number
  tier: "A+" | "A" | "B"
  status: TradeStatus
  createdAt: string
  closedAt?: string
  entryDecisionScore: number
  entryDecisionTier: string
  breakdown?: any
  // Alert state tracking - prevents duplicate alerts
  tp1AlertSent: boolean
  tp2AlertSent: boolean
  slAlertSent: boolean
  lastCheckedPrice?: number
  lastCheckedAt?: string
}

const TRADE_KEY_PREFIX = "trade:"
const ACTIVE_TRADES_KEY = "active_trades_set"
const TRADE_HISTORY_KEY = "trade_history"
const TRADE_TTL = 86400 * 7 // 7 days

export const RedisTrades = {
  /**
   * Create and persist a new active trade to Redis
   * ENFORCES: Exactly one active trade per symbol (atomic check-and-set)
   */
  async createTrade(
    symbol: string,
    direction: "LONG" | "SHORT",
    entry: number,
    stopLoss: number,
    takeProfit1: number,
    takeProfit2: number,
    tier: "A+" | "A" | "B",
    entryDecisionScore: number,
    entryDecisionTier: string,
    breakdown?: any
  ): Promise<string> {
    try {
      if (!redis) {
        console.warn("[REDIS_TRADE] Redis not configured - trade not persisted")
        return `${symbol}-${Date.now()}`
      }
      
      const activeTradeKey = `active_trade:${symbol}`
      
      // ATOMIC: Check if active trade already exists for this symbol (NX = only set if not exists)
      const existingTradeId = await redis.get(activeTradeKey)
      if (existingTradeId) {
        console.log(`[REDIS_TRADE] Trade already active for ${symbol}: ${existingTradeId}`)
        throw new Error(`Cannot create trade: ${symbol} already has active trade`)
      }

      const tradeId = `${symbol}-${Date.now()}`
      const trade: ActiveTrade = {
        id: tradeId,
        symbol,
        direction,
        entry,
        stopLoss,
        takeProfit1,
        takeProfit2,
        tier,
        status: TradeStatus.ACTIVE,
        createdAt: new Date().toISOString(),
        entryDecisionScore,
        entryDecisionTier,
        breakdown,
        tp1AlertSent: false,
        tp2AlertSent: false,
        slAlertSent: false,
      }

      const tradeKey = `${TRADE_KEY_PREFIX}${tradeId}`
      
      // Store trade with TTL
      await redis.setex(tradeKey, TRADE_TTL, JSON.stringify(trade))
      
      // ATOMIC: Register as active for this symbol (fails if another trade exists)
      // This uses Redis SET with NX (only set if not exists) to atomically enforce uniqueness
      const setResult = await redis.set(activeTradeKey, tradeId, { nx: true, ex: TRADE_TTL })
      
      if (!setResult) {
        // Another trade was just created, clean up this one
        await redis.del(tradeKey)
        console.log(`[REDIS_TRADE] Race detected: ${symbol} trade created by another process`)
        throw new Error(`Race condition: ${symbol} trade created by concurrent process`)
      }
      
      // Add to legacy active trades set (for backwards compatibility)
      await redis.sadd(ACTIVE_TRADES_KEY, tradeId)
      
      // Add to history
      await redis.lpush(TRADE_HISTORY_KEY, JSON.stringify(trade))
      
      console.log(`[REDIS_TRADE] Created: ${tradeId} | ${symbol} ${direction} ${tier} @ ${entry.toFixed(2)}`)
      return tradeId
    } catch (error) {
      console.error("[REDIS_TRADE] Error creating trade:", error)
      throw error
    }
  },

  /**
   * Get active trade for a symbol (O(1) lookup instead of O(n) scan)
   */
  async getActiveTrade(symbol: string): Promise<ActiveTrade | null> {
    try {
      // EFFICIENT: Direct lookup using symbol-indexed key (not set iteration)
      const tradeId = await redis.get(`active_trade:${symbol}`)
      
      if (!tradeId) {
        return null
      }

      const tradeKey = `${TRADE_KEY_PREFIX}${tradeId}`
      const tradeData = await redis.get(tradeKey)
      
      if (!tradeData) {
        return null
      }

      const trade = typeof tradeData === "string" ? JSON.parse(tradeData) : tradeData
      
      // Verify this trade is still active
      if (trade.status === TradeStatus.ACTIVE) {
        return trade
      }
      
      return null
    } catch (error) {
      console.error("[REDIS_TRADE] Error getting active trade:", error)
      return null
    }
  },

  /**
   * Get all active trades
   */
  async getAllActiveTrades(): Promise<ActiveTrade[]> {
    try {
      if (!redis) {
        return []
      }
      
      const members = await redis.smembers(ACTIVE_TRADES_KEY)
      
      if (!members || members.length === 0) {
        return []
      }

      const trades: ActiveTrade[] = []
      
      for (const tradeId of members) {
        const tradeKey = `${TRADE_KEY_PREFIX}${tradeId}`
        const tradeData = await redis.get(tradeKey)
        
        if (tradeData) {
          const trade = typeof tradeData === "string" ? JSON.parse(tradeData) : tradeData
      if (trade.status === TradeStatus.ACTIVE) {
            trades.push(trade)
          }
        }
      }
      
      return trades
    } catch (error) {
      console.error("[REDIS_TRADE] Error getting all active trades:", error)
      return []
    }
  },

  /**
   * Close a trade (TP or SL hit)
   */
  async closeTrade(
    tradeId: string,
    status: "TP1_HIT" | "TP2_HIT" | "SL_HIT" | "CLOSED" | "MANUALLY_CLOSED",
    closePrice: number
  ): Promise<boolean> {
    try {
      if (!redis) {
        return false
      }
      
      const tradeKey = `${TRADE_KEY_PREFIX}${tradeId}`
      const tradeData = await redis.get(tradeKey)
      
      if (!tradeData) return false

      const trade = typeof tradeData === "string" ? JSON.parse(tradeData) : tradeData
      trade.status = status
      trade.closedAt = new Date().toISOString()
      
      // Update trade in Redis
      await redis.setex(tradeKey, TRADE_TTL, JSON.stringify(trade))
      
      // Remove from active set
      await redis.srem(ACTIVE_TRADES_KEY, tradeId)
      
      // Add to history
      await redis.lpush(TRADE_HISTORY_KEY, JSON.stringify(trade))
      
      console.log(`[REDIS_TRADE] Closed: ${tradeId} | Status: ${status} @ ${closePrice.toFixed(2)}`)
      return true
    } catch (error) {
      console.error("[REDIS_TRADE] Error closing trade:", error)
      return false
    }
  },

  /**
   * Atomically check trade exit with distributed lock to prevent duplicate alerts
   * Uses Redis NX (only set if not exists) for atomic compare-and-set semantics
   */
  async checkTradeExit(tradeId: string, currentPrice: number): Promise<{closed: boolean; status?: string; alertShouldSend?: boolean}> {
    try {
      if (!redis) {
        return {closed: false}
      }
      
      const lockKey = `lock:${tradeId}`
      const lockTTL = 5 // 5 second lock to prevent duplicate processing
      
      // ATOMIC: Try to acquire lock (fails if another monitor is processing this trade)
      const lockAcquired = await redis.set(lockKey, "1", { nx: true, ex: lockTTL })
      
      if (!lockAcquired) {
        console.log(`[REDIS_TRADE] Lock contention: ${tradeId} already being processed`)
        return {closed: false} // Skip if another monitor is handling this trade
      }

      try {
        const tradeKey = `${TRADE_KEY_PREFIX}${tradeId}`
        const tradeData = await redis.get(tradeKey)
        
        if (!tradeData) return {closed: false}

        const trade = typeof tradeData === "string" ? JSON.parse(tradeData) : tradeData
        
        // Only check exit conditions if trade is still active
        if (trade.status !== TradeStatus.ACTIVE && trade.status !== TradeStatus.TP1_HIT) {
          return {closed: false}
        }
        
        let shouldAlert = false
        let newStatus = trade.status
        let isClosed = false

        if (trade.direction === "LONG") {
          // Check TP2 first (highest priority close)
          if (currentPrice >= trade.takeProfit2 && trade.status !== TradeStatus.TP2_HIT) {
            newStatus = TradeStatus.TP2_HIT
            shouldAlert = !trade.tp2AlertSent
            isClosed = true
            trade.tp2AlertSent = true
          } 
          // Check TP1 (intermediate exit, doesn't close trade)
          else if (currentPrice >= trade.takeProfit1 && trade.status === TradeStatus.ACTIVE && !trade.tp1AlertSent) {
            newStatus = TradeStatus.TP1_HIT
            shouldAlert = true
            trade.tp1AlertSent = true
          }
          // Check SL
          else if (currentPrice <= trade.stopLoss && trade.status !== TradeStatus.SL_HIT) {
            newStatus = TradeStatus.SL_HIT
            shouldAlert = !trade.slAlertSent
            isClosed = true
            trade.slAlertSent = true
          }
        } else if (trade.direction === "SHORT") {
          // Check TP2 first (highest priority close)
          if (currentPrice <= trade.takeProfit2 && trade.status !== TradeStatus.TP2_HIT) {
            newStatus = TradeStatus.TP2_HIT
            shouldAlert = !trade.tp2AlertSent
            isClosed = true
            trade.tp2AlertSent = true
          }
          // Check TP1
          else if (currentPrice <= trade.takeProfit1 && trade.status === TradeStatus.ACTIVE && !trade.tp1AlertSent) {
            newStatus = TradeStatus.TP1_HIT
            shouldAlert = true
            trade.tp1AlertSent = true
          }
          // Check SL
          else if (currentPrice >= trade.stopLoss && trade.status !== TradeStatus.SL_HIT) {
            newStatus = TradeStatus.SL_HIT
            shouldAlert = !trade.slAlertSent
            isClosed = true
            trade.slAlertSent = true
          }
        }

        // ATOMIC: Only update if status actually changed
        if (newStatus !== trade.status || shouldAlert) {
          trade.status = newStatus
          trade.lastCheckedPrice = currentPrice
          trade.lastCheckedAt = new Date().toISOString()
          
          // Atomically update trade
          await redis.setex(tradeKey, TRADE_TTL, JSON.stringify(trade))
          
          // If trade fully closed, remove from active set
          if (isClosed) {
            await redis.srem(ACTIVE_TRADES_KEY, tradeId)
            console.log(`[REDIS_TRADE] Closed: ${tradeId} | Status: ${newStatus} @ ${currentPrice.toFixed(2)}`)
          }
          
          if (shouldAlert) {
            console.log(`[REDIS_TRADE] Alert: ${tradeId} | Status: ${newStatus} @ ${currentPrice.toFixed(2)} (shouldAlert=${shouldAlert})`)
          }
          
          return {closed: isClosed, status: newStatus, alertShouldSend: shouldAlert}
        }
        
        return {closed: false}
      } finally {
        // Always release lock
        await redis.del(lockKey)
      }
    } catch (error) {
      console.error("[REDIS_TRADE] Error checking trade exit:", error)
      return {closed: false}
    }
  },

  /**
   * Get trade history with pagination
   */
  async getTradeHistory(limit: number = 100): Promise<ActiveTrade[]> {
    try {
      const history = await redis.lrange(TRADE_HISTORY_KEY, 0, limit - 1)
      
      if (!history || history.length === 0) {
        return []
      }

      return history.map((item) => typeof item === "string" ? JSON.parse(item) : item)
    } catch (error) {
      console.error("[REDIS_TRADE] Error getting trade history:", error)
      return []
    }
  },

  /**
   * Clear all trades (for testing/reset)
   */
  async clearAll(): Promise<void> {
    try {
      const members = await redis.smembers(ACTIVE_TRADES_KEY)
      
      if (members && members.length > 0) {
        for (const tradeId of members) {
          await redis.del(`${TRADE_KEY_PREFIX}${tradeId}`)
        }
      }
      
      await redis.del(ACTIVE_TRADES_KEY)
      await redis.del(TRADE_HISTORY_KEY)
      
      console.log("[REDIS_TRADE] Cleared all trades")
    } catch (error) {
      console.error("[REDIS_TRADE] Error clearing trades:", error)
    }
  },

  /**
   * Get system stats
   */
  async getStats(): Promise<{active: number; historyCount: number}> {
    try {
      const activeCount = await redis.scard(ACTIVE_TRADES_KEY)
      const historyCount = await redis.llen(TRADE_HISTORY_KEY)
      
      return {
        active: activeCount || 0,
        historyCount: historyCount || 0,
      }
    } catch (error) {
      console.error("[REDIS_TRADE] Error getting stats:", error)
      return {active: 0, historyCount: 0}
    }
  },
}
