import { Redis } from "@upstash/redis"

// Initialize Redis client with Upstash credentials
const redis = new Redis({
  url: process.env.KV_URL || process.env.REDIS_URL || "",
  token: process.env.KV_REST_API_TOKEN || "",
})

export interface ActiveTrade {
  id: string
  symbol: string
  direction: "LONG" | "SHORT"
  entry: number
  stopLoss: number
  takeProfit1: number
  takeProfit2: number
  tier: "A+" | "A" | "B"
  status: "ACTIVE" | "TP1_HIT" | "TP2_HIT" | "SL_HIT" | "CLOSED"
  createdAt: string
  closedAt?: string
  entryDecisionScore: number
  entryDecisionTier: string
  breakdown?: any
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
        status: "ACTIVE",
        createdAt: new Date().toISOString(),
        entryDecisionScore,
        entryDecisionTier,
        breakdown,
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
          if (trade.symbol === symbol && trade.status === "ACTIVE") {
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
          if (trade.status === "ACTIVE") {
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
   * Check if a trade should be closed based on current price
   */
  async checkTradeExit(tradeId: string, currentPrice: number): Promise<{closed: boolean; status?: string}> {
    try {
      const tradeKey = `${TRADE_KEY_PREFIX}${tradeId}`
      const tradeData = await redis.get(tradeKey)
      
      if (!tradeData) return {closed: false}

      const trade = typeof tradeData === "string" ? JSON.parse(tradeData) : tradeData
      
      if (trade.direction === "LONG") {
        if (currentPrice >= trade.takeProfit2) {
          await this.closeTrade(tradeId, "TP2_HIT", currentPrice)
          return {closed: true, status: "TP2_HIT"}
        } else if (currentPrice >= trade.takeProfit1 && trade.status === "ACTIVE") {
          trade.status = "TP1_HIT"
          await redis.setex(tradeKey, TRADE_TTL, JSON.stringify(trade))
          return {closed: false, status: "TP1_HIT"}
        } else if (currentPrice <= trade.stopLoss) {
          await this.closeTrade(tradeId, "SL_HIT", currentPrice)
          return {closed: true, status: "SL_HIT"}
        }
      } else {
        // SHORT
        if (currentPrice <= trade.takeProfit2) {
          await this.closeTrade(tradeId, "TP2_HIT", currentPrice)
          return {closed: true, status: "TP2_HIT"}
        } else if (currentPrice <= trade.takeProfit1 && trade.status === "ACTIVE") {
          trade.status = "TP1_HIT"
          await redis.setex(tradeKey, TRADE_TTL, JSON.stringify(trade))
          return {closed: false, status: "TP1_HIT"}
        } else if (currentPrice >= trade.stopLoss) {
          await this.closeTrade(tradeId, "SL_HIT", currentPrice)
          return {closed: true, status: "SL_HIT"}
        }
      }
      
      return {closed: false}
    } catch (error) {
      console.error("[REDIS_TRADE] Error checking trade exit:", error)
      return {closed: false}
    }
  },

  /**
   * Get trade history (last N trades)
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
