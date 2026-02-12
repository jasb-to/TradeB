import { kv } from "@vercel/kv"

export interface DirectionState {
  symbol: string
  lastDirection: "BUY" | "SELL" | "NEUTRAL"
  lastTier: "A+" | "A" | "B" | "NO_TRADE"
  lastChangeTime: number
  lastAlertTime: number
}

const DIRECTION_STATE_KEY = "direction_state:"
const ALERT_COOLDOWN_MS = 300000 // 5 minutes between alerts for same symbol

export async function getDirectionState(symbol: string): Promise<DirectionState | null> {
  try {
    const data = await kv.get(DIRECTION_STATE_KEY + symbol)
    return data ? JSON.parse(data as string) : null
  } catch (error) {
    console.error(`[DIRECTION] Error reading state for ${symbol}:`, error)
    return null
  }
}

export async function setDirectionState(state: DirectionState): Promise<void> {
  try {
    await kv.set(DIRECTION_STATE_KEY + state.symbol, JSON.stringify(state))
  } catch (error) {
    console.error(`[DIRECTION] Error saving state for ${state.symbol}:`, error)
  }
}

export async function checkDirectionChange(
  symbol: string,
  newDirection: "BUY" | "SELL" | "NEUTRAL",
  newTier: "A+" | "A" | "B" | "NO_TRADE"
): Promise<{ changed: boolean; alert: string | null }> {
  const now = Math.floor(Date.now() / 1000)
  const prevState = await getDirectionState(symbol)

  // No previous state - initialize
  if (!prevState) {
    await setDirectionState({
      symbol,
      lastDirection: newDirection,
      lastTier: newTier,
      lastChangeTime: now,
      lastAlertTime: 0,
    })
    return { changed: false, alert: null }
  }

  // Check for direction change
  const directionChanged = prevState.lastDirection !== newDirection && newDirection !== "NEUTRAL"
  const tierChanged = prevState.lastTier !== newTier

  if (!directionChanged && !tierChanged) {
    return { changed: false, alert: null }
  }

  // Check cooldown to avoid spam
  const timeSinceLastAlert = (now - prevState.lastAlertTime) * 1000
  if (timeSinceLastAlert < ALERT_COOLDOWN_MS) {
    console.log(
      `[DIRECTION] Alert cooldown active for ${symbol} (${Math.round((ALERT_COOLDOWN_MS - timeSinceLastAlert) / 1000)}s remaining)`
    )
    return { changed: true, alert: null }
  }

  // Update state
  const updatedState: DirectionState = {
    symbol,
    lastDirection: newDirection,
    lastTier: newTier,
    lastChangeTime: now,
    lastAlertTime: now,
  }
  await setDirectionState(updatedState)

  // Generate alert message
  let alertMessage = null

  if (directionChanged) {
    const directionEmoji = newDirection === "BUY" ? "📈" : "📉"
    const previousDirection = prevState.lastDirection
    alertMessage = `${directionEmoji} <b>DIRECTION CHANGE</b>\n${symbol}\n${previousDirection} → ${newDirection}\nTier: ${newTier}`
    console.log(`[DIRECTION] Direction changed: ${symbol} ${previousDirection} → ${newDirection}`)
  }

  if (tierChanged && !directionChanged) {
    const tierEmoji = newTier === "NO_TRADE" ? "🛑" : newTier === "B" ? "🟡" : newTier === "A" ? "🟢" : "⭐"
    alertMessage = `${tierEmoji} <b>TIER CHANGE</b>\n${symbol}\n${prevState.lastTier} → ${newTier}\nDirection: ${newDirection}`
    console.log(`[DIRECTION] Tier changed: ${symbol} ${prevState.lastTier} → ${newTier}`)
  }

  return { changed: true, alert: alertMessage }
}
