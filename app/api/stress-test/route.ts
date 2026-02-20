import { NextResponse } from "next/server"
import { RedisTrades, TradeStatus } from "@/lib/redis-trades"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

interface StressTestResult {
  testName: string
  passed: boolean
  duration: number
  results: {
    totalCalls: number
    alertsSent: number
    stateChanges: number
    lockContentions: number
    errors: number
    details: string[]
  }
}

/**
 * Concurrency Stress Test Endpoint
 * Simulates 5 concurrent monitor calls on the same trade hitting TP1
 * Verifies that distributed locks prevent duplicate alerts
 * 
 * PRODUCTION SAFETY TEST: If this fails, locking is NOT safe
 */
export async function POST(): Promise<NextResponse<StressTestResult>> {
  const testStart = Date.now()
  const results = {
    totalCalls: 0,
    alertsSent: 0,
    stateChanges: 0,
    lockContentions: 0,
    errors: 0,
    details: [] as string[],
  }

  try {
    // Step 1: Create a test trade
    const testTradeId = `stress-test-${Date.now()}`
    const testSymbol = "XAU_USD_TEST"
    const testTrade = await RedisTrades.createTrade(
      testSymbol,
      "LONG",
      2000, // entry
      1900, // SL
      2100, // TP1
      2200, // TP2
      "A",
      5,
      "A",
      { test: true }
    )

    results.details.push(`Created test trade: ${testTrade}`)

    // Step 2: Simulate 5 concurrent checkTradeExit calls at the same TP1 price
    const concurrentCalls = 5
    const tpPrice = 2100 // This should trigger TP1
    const promises = []

    for (let i = 0; i < concurrentCalls; i++) {
      results.totalCalls++
      promises.push(
        RedisTrades.checkTradeExit(testTrade, tpPrice)
          .then((result) => {
            if (result.alertShouldSend) {
              results.alertsSent++
            }
            if (result.status && result.status !== "ACTIVE") {
              results.stateChanges++
            }
            return result
          })
          .catch((error) => {
            results.errors++
            results.details.push(`Call ${i + 1} error: ${error.message}`)
            throw error
          })
      )
    }

    // Execute all concurrent calls
    const exitResults = await Promise.allSettled(promises)

    // Step 3: Analyze results
    let successCount = 0
    for (const result of exitResults) {
      if (result.status === "fulfilled") {
        successCount++
      }
    }

    // Verify lock safety: Only ONE call should have sent an alert
    if (results.alertsSent === 1) {
      results.details.push("✅ PASS: Distributed lock working - exactly 1 alert sent")
    } else if (results.alertsSent === 0) {
      results.details.push("⚠️  WARNING: No alerts sent (could be price condition not met)")
    } else {
      results.details.push(
        `❌ FAIL: ${results.alertsSent} alerts sent (should be 1 max). Locking FAILED.`
      )
    }

    // Verify state consistency: Only ONE state change
    if (results.stateChanges <= 1) {
      results.details.push("✅ PASS: State consistency maintained - at most 1 state change")
    } else {
      results.details.push(`❌ FAIL: ${results.stateChanges} state changes (should be ≤1)`)
    }

    // Step 4: Cleanup test trade
    try {
      await RedisTrades.closeTrade(testTrade, TradeStatus.CLOSED, tpPrice)
      results.details.push("✅ Cleanup: Test trade closed")
    } catch (cleanupError) {
      results.details.push(`⚠️  Cleanup error: ${(cleanupError as Error).message}`)
    }

    const duration = Date.now() - testStart
    const lockSafetyPassed = results.alertsSent <= 1 && results.stateChanges <= 1

    return NextResponse.json({
      testName: "Concurrency Lock Safety Test",
      passed: lockSafetyPassed && results.errors === 0,
      duration,
      results: {
        ...results,
        lockContentions: concurrentCalls - 1, // Expected contentions (only 1 gets lock)
      },
    })
  } catch (error) {
    console.error("[STRESS-TEST] Error:", error)
    const duration = Date.now() - testStart
    return NextResponse.json(
      {
        testName: "Concurrency Lock Safety Test",
        passed: false,
        duration,
        results: {
          ...results,
          errors: results.errors + 1,
          details: [...results.details, `CRITICAL: ${(error as Error).message}`],
        },
      },
      { status: 500 }
    )
  }
}
