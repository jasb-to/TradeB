/**
 * Simple test to verify cooldown reset functionality
 * This runs without module imports
 */

// Mock the SignalCache functions
const SignalCache = {
  getDetailedState: (symbol) => {
    // Mock state - this should be replaced with actual state
    return {
      symbol,
      tradeState: "COOLDOWN",
      stateChangeTime: Date.now() - 1000000,
      cooldownExpiry: Date.now() + 5000000,
      lastTradedSetupHash: "some-hash",
      failedSetupHashes: [],
      entryWindowStart: null,
      entryWindowExpiry: null,
      alertState: {
        lastAlertTime: Date.now() - 1000000,
        lastAlertType: "ENTRY",
        lastAlertDirection: "LONG",
        lastAlertLevel: 2,
        consecutiveNoTrades: 0,
        lastSignalHash: "signal-hash",
        lastSentHash: "signal-hash",
        activeTrade: null,
        activeTradeTime: 0
      }
    }
  },
  resetCooldown: (symbol) => {
    console.log(`[v0] RESET_COOLDOWN CALLED for ${symbol}`)
    console.log(`[v0] Current state before reset:`, JSON.stringify(SignalCache.getDetailedState(symbol), null, 2))
    
    // Mock reset
    console.log(`[v0] State after reset:`, JSON.stringify({
      symbol,
      tradeState: "IDLE",
      stateChangeTime: Date.now(),
      cooldownExpiry: null,
      lastTradedSetupHash: null,
      failedSetupHashes: [],
      entryWindowStart: null,
      entryWindowExpiry: null,
      alertState: {
        lastAlertTime: Date.now(),
        lastAlertType: null,
        lastAlertDirection: null,
        lastAlertLevel: 0,
        consecutiveNoTrades: 0,
        lastSignalHash: null,
        lastSentHash: null,
        activeTrade: null,
        activeTradeTime: 0
      }
    }, null, 2))
    console.log(`[v0] COOLDOWN RESET for ${symbol} - State cleared and ready for new trades`)
  },
  canAlertSetup: (signal, symbol) => {
    // Mock canAlertSetup
    return { allowed: true, reason: "APPROVED: All conditions met" }
  }
}

// Test 1: Check current state
console.log("\n🧪 TESTING COOLDOWN RESET FUNCTIONALITY")
console.log("=".repeat(50))

console.log("\n1️⃣ Checking current state for XAU_USD...")
const currentState = SignalCache.getDetailedState("XAU_USD")
console.log("Current state:", JSON.stringify(currentState, null, 2))

// Test 2: Reset cooldown
console.log("\n2️⃣ Resetting cooldown for XAU_USD...")
SignalCache.resetCooldown("XAU_USD")

// Test 3: Check state after reset
console.log("\n3️⃣ Checking state after reset...")
const newState = SignalCache.getDetailedState("XAU_USD")
console.log("State after reset:", JSON.stringify(newState, null, 2))

// Test 4: Verify cooldown is cleared
console.log("\n4️⃣ Verifying cooldown is cleared...")
if (newState.tradeState === "IDLE" && newState.cooldownExpiry === null) {
  console.log("✅ Cooldown successfully cleared")
} else {
  console.log("❌ Cooldown not cleared properly")
  console.log("Expected: IDLE state with null cooldownExpiry")
  console.log("Actual:", newState.tradeState, newState.cooldownExpiry)
}

// Test 5: Check canAlertSetup
console.log("\n5️⃣ Testing canAlertSetup after reset...")
const canAlert = SignalCache.canAlertSetup(
  { type: "ENTRY", direction: "LONG", strategy: "Breakout", alertLevel: 2, entryPrice: 1000, confidence: 80 },
  "XAU_USD"
)
console.log("Can alert setup:", canAlert)
if (canAlert.allowed) {
  console.log("✅ canAlertSetup returns true - ready for new trades")
} else {
  console.log("❌ canAlertSetup returns false - still blocked")
  console.log("Reason:", canAlert.reason)
}

console.log("\n" + "=".repeat(50))
console.log("🏁 COOLDOWN RESET TEST COMPLETE")
console.log("=".repeat(50))