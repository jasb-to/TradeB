import { kv } from "@vercel/kv"

export interface TradeFile {
  id: string
  symbol: string
  direction: "BUY" | "SELL"
  entry: number
  stopLoss: number
  tp1: number
  tp2: number
  tier: "A+" | "A" | "B"
  status: "OPEN" | "CLOSED"
  tp1Hit: boolean
  tp2Hit: boolean
  slHit: boolean
  invalidated: boolean
  openedAt: number
  lastChecked: number | null
  closedAt?: number
  closeReason?: string
}

const TRADES_PREFIX = "trade:"
const TRADES_INDEX = "trades_index"

export async function createTrade(
  symbol: string,
  direction: "BUY" | "SELL",
  entry: number,
  stopLoss: number,
  tp1: number,
  tp2: number,
  tier: "A+" | "A" | "B"
): Promise<TradeFile> {
  const timestamp = Math.floor(Date.now() / 1000)
  const tradeId = `${symbol}_${timestamp}_${Math.random().toString(36).substring(7)}`

  const trade: TradeFile = {
    id: tradeId,
    symbol,
    direction,
    entry,
    stopLoss,
    tp1,
    tp2,
    tier,
    status: "OPEN",
    tp1Hit: false,
    tp2Hit: false,
    slHit: false,
    invalidated: false,
    openedAt: timestamp,
    lastChecked: null,
  }

  await kv.set(TRADES_PREFIX + tradeId, JSON.stringify(trade))
  await kv.sadd(TRADES_INDEX, tradeId)

  console.log(`[LIFECYCLE] Trade created: ${symbol} ${direction} ${tier} Tier at ${entry.toFixed(2)}`)
  return trade
}

export async function getAllTrades(): Promise<TradeFile[]> {
  const tradeIds = await kv.smembers(TRADES_INDEX)
  const trades: TradeFile[] = []

  for (const tradeId of tradeIds) {
    try {
      const tradeData = await kv.get(TRADES_PREFIX + tradeId)
      if (tradeData) {
        trades.push(JSON.parse(tradeData as string))
      }
    } catch (error) {
      console.error(`[LIFECYCLE] Error reading trade ${tradeId}: ${error}`)
    }
  }

  return trades
}

export async function getOpenTrades(): Promise<TradeFile[]> {
  const trades = await getAllTrades()
  return trades.filter((t) => t.status === "OPEN")
}

export async function updateTrade(trade: TradeFile): Promise<void> {
  await kv.set(TRADES_PREFIX + trade.id, JSON.stringify(trade))
}

export function isValidTradeFile(trade: TradeFile): boolean {
  return (
    trade.id &&
    trade.symbol &&
    ["BUY", "SELL"].includes(trade.direction) &&
    typeof trade.entry === "number" &&
    typeof trade.stopLoss === "number" &&
    typeof trade.tp1 === "number" &&
    typeof trade.tp2 === "number" &&
    ["A+", "A", "B"].includes(trade.tier) &&
    ["OPEN", "CLOSED"].includes(trade.status)
  )
}
