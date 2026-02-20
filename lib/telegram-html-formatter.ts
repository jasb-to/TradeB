import type { Signal } from "@/types/trading"

/**
 * Telegram HTML Signal Formatter
 * Generates clean, professional HTML alerts for Telegram parse_mode: "HTML"
 */

const icon = (value: boolean): string => (value ? "✅" : "❌")

export interface SignalBreakdown {
  trend?: {
    daily?: boolean
    h4?: boolean
    h1?: boolean
  }
  momentum?: {
    adx?: boolean
    rsi?: boolean
  }
  entry?: {
    m15?: boolean
    m5?: boolean
  }
  filters?: {
    volatility?: boolean
    session?: boolean
  }
}

/**
 * Format entry signal as HTML for Telegram
 * Renders cleanly with proper structure and visual clarity
 */
export function formatSignalHTML(signal: {
  symbol: string
  direction: string
  tier: string
  score: number
  scoreMax?: number
  entryPrice: number
  takeProfit1: number
  takeProfit2: number
  stopLoss: number
  breakdown?: SignalBreakdown
}): string {
  const scoreMax = signal.scoreMax || 9
  const trendEmoji = signal.direction === "LONG" ? "📈" : signal.direction === "SHORT" ? "📉" : "⚪"
  const tierBadge =
    signal.tier === "A+"
      ? "🔥 A+ PREMIUM"
      : signal.tier === "A"
        ? "⭐ A SETUP"
        : signal.tier === "B"
          ? "⚠️ B TIER"
          : "⚪ NO_TRADE"

  const breakdown = signal.breakdown || {}
  const trend = breakdown.trend || {}
  const momentum = breakdown.momentum || {}
  const entry = breakdown.entry || {}
  const filters = breakdown.filters || {}

  return `<b>${trendEmoji} ${signal.symbol} ${signal.direction} Entry</b>

<b>Tier:</b> ${tierBadge}
<b>Score:</b> ${signal.score.toFixed(1)} / ${scoreMax}

<b>📍 Entry:</b> ${signal.entryPrice.toFixed(2)}
<b>🎯 TP1:</b> ${signal.takeProfit1.toFixed(2)}
<b>🎯 TP2:</b> ${signal.takeProfit2.toFixed(2)}
<b>🛑 SL:</b> ${signal.stopLoss.toFixed(2)}

<b>──────────────</b>

<b>🧠 Breakdown</b>

<b>Trend Alignment</b>
• Daily: ${icon(trend.daily ?? false)}
• 4H: ${icon(trend.h4 ?? false)}
• 1H: ${icon(trend.h1 ?? false)}

<b>Momentum</b>
• ADX: ${icon(momentum.adx ?? false)}
• RSI: ${icon(momentum.rsi ?? false)}

<b>Entry Confirmation</b>
• M15: ${icon(entry.m15 ?? false)}
• M5: ${icon(entry.m5 ?? false)}

<b>Filters</b>
• Volatility: ${icon(filters.volatility ?? false)}
• Session: ${icon(filters.session ?? false)}

<b>Status:</b> Monitoring Active`
}

/**
 * Format TP1 alert as HTML
 */
export function formatTP1AlertHTML(signal: {
  symbol: string
  entryPrice: number
  tp1Price: number
  currentPrice: number
  tier: string
}): string {
  const profitPercent = (((signal.currentPrice - signal.entryPrice) / signal.entryPrice) * 100).toFixed(2)
  const isBTier = signal.tier === "B"

  if (isBTier) {
    return `<b>🚨 B TIER TP1 - FULL POSITION CLOSED</b>

<b>Symbol:</b> ${signal.symbol}
<b>Entry Price:</b> $${signal.entryPrice.toFixed(2)}
<b>TP1 Level (Full Exit):</b> $${signal.tp1Price.toFixed(2)}
<b>Exit Price:</b> $${signal.currentPrice.toFixed(2)}
<b>Profit:</b> +${profitPercent}%

✅ B TIER Trade Closed at Target
Position fully exited at TP1 level

⏰ Time: ${new Date().toISOString()}`
  } else {
    return `<b>✅ TP1 REACHED - SCALE OUT</b>

<b>Symbol:</b> ${signal.symbol}
<b>Entry Price:</b> $${signal.entryPrice.toFixed(2)}
<b>TP1 Level:</b> $${signal.tp1Price.toFixed(2)}
<b>Current Price:</b> $${signal.currentPrice.toFixed(2)}
<b>Profit:</b> +${profitPercent}%

📊 Action: Take 50% profit
🔒 Move SL to: Entry ($${signal.entryPrice.toFixed(2)})
📈 Hold remaining 50% for TP2

⏰ Time: ${new Date().toISOString()}`
  }
}

/**
 * Format TP2 alert as HTML
 */
export function formatTP2AlertHTML(signal: {
  symbol: string
  entryPrice: number
  tp2Price: number
  currentPrice: number
}): string {
  const profitPercent = (((signal.currentPrice - signal.entryPrice) / signal.entryPrice) * 100).toFixed(2)

  return `<b>🎯 TP2 REACHED - FULL EXIT</b>

<b>Symbol:</b> ${signal.symbol}
<b>Entry Price:</b> $${signal.entryPrice.toFixed(2)}
<b>TP2 Level:</b> $${signal.tp2Price.toFixed(2)}
<b>Exit Price:</b> $${signal.currentPrice.toFixed(2)}
<b>Total Profit:</b> +${profitPercent}%

✅ Trade Closed Successfully
Position fully exited at target

⏰ Time: ${new Date().toISOString()}`
}

/**
 * Format SL alert as HTML
 */
export function formatSLAlertHTML(signal: { symbol: string; entryPrice: number; slPrice: number; currentPrice: number }): string {
  const lossPercent = (((signal.currentPrice - signal.entryPrice) / signal.entryPrice) * 100).toFixed(2)

  return `<b>🛑 STOP LOSS HIT</b>

<b>Symbol:</b> ${signal.symbol}
<b>Entry Price:</b> $${signal.entryPrice.toFixed(2)}
<b>Stop Loss:</b> $${signal.slPrice.toFixed(2)}
<b>Exit Price:</b> $${signal.currentPrice.toFixed(2)}
<b>Loss:</b> ${lossPercent}%

❌ Trade Closed
Risk management triggered - Position exited at stop loss

⏰ Time: ${new Date().toISOString()}`
}

/**
 * Format test message as HTML
 */
export function formatTestMessageHTML(): string {
  return `<b>✅ TELEGRAM TEST SUCCESSFUL</b>

Your TradeB trading system is now connected to Telegram!

This test confirms:
✓ Bot token is valid
✓ Chat ID is correct
✓ API connection is working
✓ Messages will be delivered

You will now receive:
📈 Entry signals with full trade details
⚠️ TP1 alerts when positions are scaled
🚨 Stop loss alerts when risk breaches
✅ TP2 alerts when full position closes

⏰ Time: ${new Date().toISOString()}`
}
