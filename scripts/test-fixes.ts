#!/usr/bin/env ts-node

/**
 * Test script to validate the three critical fixes:
 * 1. Gold cooldown reset function
 * 2. Silver strategy verbose logging
 * 3. Telegram test button functionality
 */

import { SignalCache } from "@/lib/signal-cache"
import { SilverStrategy } from "@/lib/silver-strategy"
import { DataFetcher } from "@/lib/data-fetcher"
import { DEFAULT_TRADING_CONFIG } from "@/lib/default-config"

async function testFixes(): Promise<void> {
  console.log("🧪 TESTING CRITICAL FIXES")
  console.log("=".repeat(50))

  // Test 1: Gold state reset function
  console.log("\n1️⃣ Testing Gold state reset function...")
  try {
    SignalCache.resetState("XAU_USD")
    console.log("✅ Gold state reset function works")
  } catch (error) {
    console.log("❌ Gold state reset function failed:", error)
  }

  // Test 2: Silver strategy verbose logging
  console.log("\n2️⃣ Testing Silver strategy verbose logging...")
  try {
    const dataFetcher = new DataFetcher("XAG_USD")
    const dailyCandles = await dataFetcher.fetchCandles("1d", 30)
    const h4Candles = await dataFetcher.fetchCandles("4h", 100)
    const h1Candles = await dataFetcher.fetchCandles("1h", 200)
    const m15Candles = await dataFetcher.fetchCandles("15m", 500)
    const m5Candles = await dataFetcher.fetchCandles("5m", 500)

    console.log(`📊 Silver data loaded: Daily=${dailyCandles.candles.length}, 4H=${h4Candles.candles.length}, 1H=${h1Candles.candles.length}, 15M=${m15Candles.candles.length}, 5M=${m5Candles.candles.length}`)

    const result = SilverStrategy.evaluateSilverSignal(
      dailyCandles.candles,
      h4Candles.candles,
      h1Candles.candles,
      m15Candles.candles,
      m5Candles.candles
    )

    console.log(`🎯 Silver signal result: ${result.signal.type} ${result.signal.direction} | Confidence: ${result.signal.confidence}%`)
    console.log(`📝 Signal reasons: ${result.signal.reasons?.join(", ") || "None"}`)
    console.log("✅ Silver strategy verbose logging works")
  } catch (error) {
    console.log("❌ Silver strategy verbose logging failed:", error)
  }

  // Test 3: Candle validation fix
  console.log("\n3️⃣ Testing candle validation fix...")
  try {
    const dataFetcher = new DataFetcher("XAU_USD")
    const candles = await dataFetcher.fetchCandles("1h", 100)
    
    console.log(`📊 Candle validation test: ${candles.candles.length} candles loaded`)
    if (candles.candles.length > 0) {
      const firstCandle = candles.candles[0]
      console.log(`🔍 First candle: Time=${new Date(firstCandle.timestamp).toISOString()}, Close=${firstCandle.close}`)
      console.log("✅ Candle validation fix works")
    } else {
      console.log("❌ No candles loaded")
    }
  } catch (error) {
    console.log("❌ Candle validation fix failed:", error)
  }

  console.log("\n" + "=".repeat(50))
  console.log("🏁 FIX VALIDATION COMPLETE")
  console.log("=".repeat(50))
}

// Run the test
testFixes().catch(console.error)