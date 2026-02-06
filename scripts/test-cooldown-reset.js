/**
 * Test script to verify cooldown reset functionality
 */

const fs = require('fs')
const path = require('path')

// Load the SignalCache module
const SignalCache = require('/Users/bilkhumacmini/Documents/VS Projects/TradeB/lib/signal-cache')

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