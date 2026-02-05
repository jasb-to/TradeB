/**
 * SYNCHRONIZATION & DATA FLOW MONITOR
 *
 * This module tracks data freshness across the entire system:
 * - OANDA API data age (source)
 * - Candle validation pipeline
 * - Indicator calculation freshness
 * - Signal cache staleness
 * - Display update latency
 *
 * Goal: Eliminate any "CALCULATING" or "N/A" placeholders by ensuring
 * real-time data flows continuously from OANDA through to client display.
 */

interface DataFlowCheckpoint {
  name: string
  timestamp: number
  ageMs: number
  status: "FRESH" | "ACCEPTABLE" | "STALE" | "MISSING"
  value: string | number | null
}

interface SynchronizationReport {
  timestamp: number
  symbol: string
  checkpoints: Record<string, DataFlowCheckpoint>
  overallHealth: "HEALTHY" | "DEGRADED" | "CRITICAL"
  recommendations: string[]
  bottlenecks: string[]
}

export class SynchronizationMonitor {
  private static checkpoints: Map<string, DataFlowCheckpoint[]> = new Map()

  /**
   * Record a checkpoint in the data pipeline
   */
  static recordCheckpoint(
    symbol: string,
    name: string,
    value: string | number | null,
    ageMs: number,
  ): void {
    const checkpoint: DataFlowCheckpoint = {
      name,
      timestamp: Date.now(),
      ageMs,
      status: ageMs < 5000 ? "FRESH" : ageMs < 30000 ? "ACCEPTABLE" : ageMs < 60000 ? "STALE" : "MISSING",
      value,
    }

    if (!this.checkpoints.has(symbol)) {
      this.checkpoints.set(symbol, [])
    }

    const checkpointList = this.checkpoints.get(symbol)!
    checkpointList.push(checkpoint)

    // Keep only last 100 checkpoints per symbol
    if (checkpointList.length > 100) {
      checkpointList.shift()
    }

    console.log(
      `[v0] SYNC CHECKPOINT: ${symbol} → ${name} = ${value} (${checkpoint.status}, ${ageMs}ms old)`,
    )
  }

  /**
   * Generate synchronization report showing entire data flow health
   */
  static generateSyncReport(symbol: string): SynchronizationReport {
    const checkpointList = this.checkpoints.get(symbol) || []
    const recentCheckpoints = checkpointList.slice(-20) // Last 20 checkpoints

    const report: SynchronizationReport = {
      timestamp: Date.now(),
      symbol,
      checkpoints: {},
      overallHealth: "HEALTHY",
      recommendations: [],
      bottlenecks: [],
    }

    // Analyze each checkpoint
    const statusCounts = { FRESH: 0, ACCEPTABLE: 0, STALE: 0, MISSING: 0 }

    recentCheckpoints.forEach((cp) => {
      report.checkpoints[cp.name] = cp
      statusCounts[cp.status]++
    })

    // Determine overall health
    if (statusCounts.MISSING > 0 || statusCounts.STALE > 5) {
      report.overallHealth = "CRITICAL"
    } else if (statusCounts.STALE > 2) {
      report.overallHealth = "DEGRADED"
    } else {
      report.overallHealth = "HEALTHY"
    }

    // Identify bottlenecks
    const staleCheckpoints = recentCheckpoints.filter((cp) => cp.status === "STALE" || cp.status === "MISSING")
    if (staleCheckpoints.length > 0) {
      report.bottlenecks = staleCheckpoints.map((cp) => `${cp.name} is ${cp.status} (${cp.ageMs}ms old)`)
    }

    // Generate recommendations
    if (report.overallHealth === "CRITICAL") {
      report.recommendations.push("🔴 CRITICAL: Data pipeline is stale - refresh OANDA connection")
      report.recommendations.push("Check OANDA API key and rate limits")
      report.recommendations.push("Verify market is open and data is flowing")
    } else if (report.overallHealth === "DEGRADED") {
      report.recommendations.push("⚠️ DEGRADED: Some data is stale - monitor closely")
      report.recommendations.push("Consider reducing calculation frequency temporarily")
    } else {
      report.recommendations.push("✅ HEALTHY: All data synchronization nominal")
      report.recommendations.push("System ready for live trading")
    }

    return report
  }

  /**
   * Clear historical checkpoints for a symbol
   */
  static clearCheckpoints(symbol?: string): void {
    if (symbol) {
      this.checkpoints.delete(symbol)
    } else {
      this.checkpoints.clear()
    }
  }

  /**
   * Get average latency between specific checkpoints
   */
  static getLatencyBetweenCheckpoints(symbol: string, startName: string, endName: string): number {
    const checkpoints = this.checkpoints.get(symbol) || []
    let totalLatency = 0
    let count = 0

    for (let i = 1; i < checkpoints.length; i++) {
      if (checkpoints[i - 1].name === startName && checkpoints[i].name === endName) {
        totalLatency += checkpoints[i].timestamp - checkpoints[i - 1].timestamp
        count++
      }
    }

    return count > 0 ? totalLatency / count : 0
  }
}

/**
 * DATA SYNCHRONIZATION CHECKLIST
 *
 * To ensure real-time data flows continuously:
 *
 * 1. OANDA DATA FETCHING
 *    ✓ Fetch 1h, 4h, daily candles with 1-minute cache TTL
 *    ✓ Automatic server detection (live/practice)
 *    ✓ Rate limiting: 500ms between requests
 *    ✓ Retry logic for transient failures
 *
 * 2. CANDLE VALIDATION
 *    ✓ Symbol-specific price range validation (not hardcoded)
 *    ✓ OHLC integrity checks
 *    ✓ NaN/null rejection
 *    ✓ Gap detection warnings
 *
 * 3. INDICATOR CALCULATION
 *    ✓ 50+ candle minimum requirement
 *    ✓ All calculations return non-zero or sensible defaults
 *    ✓ Try-catch blocks prevent silent failures
 *    ✓ Bounds checking on all values (0-100 for indices)
 *
 * 4. SIGNAL GENERATION
 *    ✓ Multi-timeframe analysis (1h/4h/daily)
 *    ✓ Weighted alignment scoring
 *    ✓ Setup tier classification (A+, A, null)
 *    ✓ Confidence calculation based on ADX
 *
 * 5. CACHING STRATEGY
 *    ✓ OANDA cache: 1 minute (fresh data)
 *    ✓ Signal cache: 30 seconds (prevents spam)
 *    ✓ Active trade duration: 24 hours
 *    ✓ Real-time price cache: Updated on each fetch
 *
 * 6. DISPLAY & CLIENT
 *    ✓ Client receives actual indicator values (not "CALCULATING")
 *    ✓ "N/A" only appears if market is closed
 *    ✓ Real price from latest 1h candle
 *    ✓ Entry/Stop/TP levels calculated from ATR
 *
 * 7. ERROR HANDLING
 *    ✓ Missing 15m/5m data doesn't block signal generation
 *    ✓ Graceful degradation with sensible defaults
 *    ✓ Error logs include timestamp + symbol + value
 *    ✓ Alert on critical failures (missing daily/1h data)
 */
