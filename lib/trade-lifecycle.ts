import fs from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'

export interface TradeFile {
  id: string
  symbol: string
  direction: 'BUY' | 'SELL'
  entry: number
  stopLoss: number
  tp1: number
  tp2: number
  tier: 'A+' | 'A' | 'B'
  status: 'OPEN' | 'CLOSED'
  tp1Hit: boolean
  tp2Hit: boolean
  slHit: boolean
  invalidated: boolean
  openedAt: number
  lastChecked: number | null
  closedAt?: number
  closeReason?: string
}

const TRADES_DIR = path.join(process.cwd(), 'data', 'trades')

// Ensure directory exists
export function ensureTradesDir() {
  if (!fs.existsSync(TRADES_DIR)) {
    fs.mkdirSync(TRADES_DIR, { recursive: true })
    console.log(`[LIFECYCLE] Created trades directory: ${TRADES_DIR}`)
  }
}

// Create new trade file
export function createTrade(
  symbol: string,
  direction: 'BUY' | 'SELL',
  entry: number,
  stopLoss: number,
  tp1: number,
  tp2: number,
  tier: 'A+' | 'A' | 'B'
): TradeFile {
  ensureTradesDir()

  const tradeId = uuidv4()
  const timestamp = Math.floor(Date.now() / 1000)
  const filename = `${symbol}_${timestamp}_${tradeId.substring(0, 8)}.json`
  const filepath = path.join(TRADES_DIR, filename)

  const trade: TradeFile = {
    id: tradeId,
    symbol,
    direction,
    entry,
    stopLoss,
    tp1,
    tp2,
    tier,
    status: 'OPEN',
    tp1Hit: false,
    tp2Hit: false,
    slHit: false,
    invalidated: false,
    openedAt: timestamp,
    lastChecked: null,
  }

  // Atomic write: write to temp file first, then rename
  const tempFilepath = filepath + '.tmp'
  fs.writeFileSync(tempFilepath, JSON.stringify(trade, null, 2))
  fs.renameSync(tempFilepath, filepath)

  console.log(`[LIFECYCLE] Trade created: ${symbol} ${direction} ${tier} Tier at ${entry.toFixed(2)}`)
  return trade
}

// Read all active trades
export function getAllTrades(): TradeFile[] {
  ensureTradesDir()

  const files = fs.readdirSync(TRADES_DIR).filter(f => f.endsWith('.json'))
  const trades: TradeFile[] = []

  for (const file of files) {
    try {
      const filepath = path.join(TRADES_DIR, file)
      const content = fs.readFileSync(filepath, 'utf-8')
      const trade = JSON.parse(content) as TradeFile
      trades.push(trade)
    } catch (error) {
      console.error(`[LIFECYCLE] Error reading trade file ${file}: ${error}`)
      // Continue processing other files
    }
  }

  return trades
}

// Get open trades
export function getOpenTrades(): TradeFile[] {
  return getAllTrades().filter(t => t.status === 'OPEN')
}

// Update trade file
export function updateTrade(trade: TradeFile): void {
  ensureTradesDir()

  // Find the file matching this trade ID
  const files = fs.readdirSync(TRADES_DIR).filter(f => f.endsWith('.json'))
  let found = false

  for (const file of files) {
    try {
      const filepath = path.join(TRADES_DIR, file)
      const content = fs.readFileSync(filepath, 'utf-8')
      const existingTrade = JSON.parse(content) as TradeFile

      if (existingTrade.id === trade.id) {
        // Atomic write
        const tempFilepath = filepath + '.tmp'
        fs.writeFileSync(tempFilepath, JSON.stringify(trade, null, 2))
        fs.renameSync(tempFilepath, filepath)
        found = true
        break
      }
    } catch (error) {
      console.error(`[LIFECYCLE] Error updating trade file ${file}: ${error}`)
    }
  }

  if (!found) {
    console.error(`[LIFECYCLE] Trade not found: ${trade.id}`)
  }
}

// Check if trade file exists and is valid
export function isValidTradeFile(trade: TradeFile): boolean {
  return (
    trade.id &&
    trade.symbol &&
    ['BUY', 'SELL'].includes(trade.direction) &&
    typeof trade.entry === 'number' &&
    typeof trade.stopLoss === 'number' &&
    typeof trade.tp1 === 'number' &&
    typeof trade.tp2 === 'number' &&
    ['A+', 'A', 'B'].includes(trade.tier) &&
    ['OPEN', 'CLOSED'].includes(trade.status)
  )
}
