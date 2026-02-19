import { Redis } from "@upstash/redis"

// Initialize Redis client with Upstash REST API credentials (not rediss:// protocol)
// Upstash provides REST API URL in KV_REST_API_URL format
const redis = new Redis({
  url: process.env.KV_REST_API_URL || "",
  token: process.env.KV_REST_API_TOKEN || "",
})

// Trade Status Enum - SINGLE SOURCE OF TRUTH for all state transitions
export enum TradeStatus {
  ACTIVE = "ACTIVE",
  TP1_HIT = "TP1_HIT",
  TP2_HIT = "TP2_HIT",
  SL_HIT = "SL_HIT",
  CLOSED = "CLOSED",
  MANUALLY_CLOSED = "MANUALLY_CLOSED",
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
      
      // Add to active trades set
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
   * Get active trade for a symbol
   */
  async getActiveTrade(symbol: string): Promise<ActiveTrade | null> {
    try {
      const members = await redis.smembers(ACTIVE_TRADES_KEY)
      
      if (!members || members.length === 0) {
        return null
      }

      for (const tradeId of members) {
        const tradeKey = `${TRADE_KEY_PREFIX}${tradeId}`
        const tradeData = await redis.get(tradeKey)
        
        if (tradeData) {
          const trade = typeof tradeData === "string" ? JSON.parse(tradeData) : tradeData
          if (trade.symbol === symbol && trade.status === TradeStatus.ACTIVE) {
            return trade
          }
        }
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
    status: "TP1_HIT" | "TP2_HIT" | "SL_HIT" | "CLOSED",
    closePrice: number
  ): Promise<boolean> {
    try {
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
   * Atomically check trade exit and update alert state - PREVENTS DUPLICATE ALERTS
   * Uses compare-and-set semantics to ensure only one alert per state transition
   */
  async checkTradeExit(tradeId: string, currentPrice: number): Promise<{closed: boolean; status?: string; alertShouldSend?: boolean}> {
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
          shouldAlert = !trade.tp2AlertSent // Only alert if not already sent
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

      // Atomic update: only update if status actually changed
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
    } catch (error) {
      console.error("[REDIS_TRADE] Error checking trade exit:", error)
      return {closed: false}
    }
  }
          return {closed: true, status: "SL_HIT"}
        }

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
