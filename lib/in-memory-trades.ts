// IN-MEMORY TRADE PERSISTENCE FALLBACK
// Used when Vercel KV is not configured
// Trades persist for the lifetime of the server process (sufficient for preview/testing)

interface Trade {
  id: string
  symbol: string
  direction: "BUY" | "SELL"
  entry: number
  stopLoss: number
  takeProfit1: number
  takeProfit2: number
  tier: "A+" | "A" | "B"
  status: "ACTIVE" | "TP1_HIT" | "TP2_HIT" | "SL_HIT" | "CLOSED"
  createdAt: string
  closedAt?: string
}

// In-memory storage (persists for server lifetime)
const activeTrades = new Map<string, Trade>()
const tradeHistory: Trade[] = []

export const InMemoryTrades = {
  /**
   * Create and persist a new active trade
   */
  async createTrade(
    symbol: string,
    direction: "BUY" | "SELL",
    entry: number,
    stopLoss: number,
    takeProfit1: number,
    takeProfit2: number,
    tier: "A+" | "A" | "B"
  ): Promise<string> {
    const tradeId = `${symbol}-${Date.now()}`
    const trade: Trade = {
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
    }

    activeTrades.set(symbol, trade)
    console.log(
      `[IN_MEMORY_TRADE] Created: ${symbol} ${direction} ${tier} @ ${entry.toFixed(2)} | Trades=${activeTrades.size}`
    )
    return tradeId
  },

  /**
   * Get active trade for a symbol
   */
  async getActiveTrade(symbol: string): Promise<Trade | null> {
    return activeTrades.get(symbol) || null
  },

  /**
   * Get all active trades
   */
  async getAllActiveTrades(): Promise<Trade[]> {
    return Array.from(activeTrades.values())
  },

  /**
   * Close a trade (TP or SL hit)
   */
  async closeTrade(
    symbol: string,
    status: "TP1_HIT" | "TP2_HIT" | "SL_HIT" | "CLOSED",
    currentPrice: number
  ): Promise<boolean> {
    const trade = activeTrades.get(symbol)
    if (!trade) return false

    trade.status = status
    trade.closedAt = new Date().toISOString()

    // Move to history
    tradeHistory.push(trade)
    activeTrades.delete(symbol)

    console.log(
      `[IN_MEMORY_TRADE] Closed: ${symbol} ${status} @ ${currentPrice.toFixed(2)} | Active=${activeTrades.size}`
    )
    return true
  },

  /**
   * Update trade status (for partial fills)
   */
  async updateTradeStatus(symbol: string, status: Trade["status"]): Promise<boolean> {
    const trade = activeTrades.get(symbol)
    if (!trade) return false

    trade.status = status
    console.log(`[IN_MEMORY_TRADE] Updated: ${symbol} → ${status}`)
    return true
  },

  /**
   * Check if a trade should be closed based on current price
   */
  async checkTradeExit(symbol: string, currentPrice: number): Promise<boolean> {
    const trade = activeTrades.get(symbol)
    if (!trade) return false

    if (trade.direction === "BUY") {
      if (currentPrice >= trade.takeProfit2) {
        await this.closeTrade(symbol, "TP2_HIT", currentPrice)
        return true
      } else if (currentPrice >= trade.takeProfit1 && trade.status === "ACTIVE") {
        await this.updateTradeStatus(symbol, "TP1_HIT")
      } else if (currentPrice <= trade.stopLoss) {
        await this.closeTrade(symbol, "SL_HIT", currentPrice)
        return true
      }
    } else {
      // SELL
      if (currentPrice <= trade.takeProfit2) {
        await this.closeTrade(symbol, "TP2_HIT", currentPrice)
        return true
      } else if (currentPrice <= trade.takeProfit1 && trade.status === "ACTIVE") {
        await this.updateTradeStatus(symbol, "TP1_HIT")
      } else if (currentPrice >= trade.stopLoss) {
        await this.closeTrade(symbol, "SL_HIT", currentPrice)
        return true
      }
    }

    return false
  },

  /**
   * Get trade history (last 100 trades)
   */
  async getTradeHistory(limit: number = 100): Promise<Trade[]> {
    return tradeHistory.slice(-limit)
  },

  /**
   * Clear all trades (for testing)
   */
  async clearAll(): Promise<void> {
    activeTrades.clear()
    tradeHistory.length = 0
    console.log("[IN_MEMORY_TRADE] Cleared all trades")
  },

  /**
   * Get system stats
   */
  getStats(): { active: number; history: number; totalMemory: number } {
    return {
      active: activeTrades.size,
      history: tradeHistory.length,
      totalMemory: activeTrades.size + tradeHistory.length,
    }
  },
}
