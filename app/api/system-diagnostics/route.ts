import { NextResponse } from "next/server"
import { CronHeartbeat } from "@/lib/cron-heartbeat"
import { NearMissTracker } from "@/lib/near-miss-tracker"
import { SignalCache } from "@/lib/signal-cache"

/**
 * SYSTEM DIAGNOSTICS ENDPOINT
 * 
 * Returns complete system health snapshot:
 * - Cron execution state (last hit, frequency, duration)
 * - Per-symbol execution tracking (XAU_USD, GBP_JPY)
 * - Current strategy state (HTF polarity, biases, entry score)
 * - Outcome counters (trades, near-misses)
 * - Operational verdict
 */

export async function GET(request: Request) {
  const startTime = Date.now()
  const now = Date.now()
  const oneHourAgo = now - 60 * 60 * 1000
  const oneDayAgo = now - 24 * 60 * 60 * 1000

  // Get cron heartbeats (now returns Promise)
  const heartbeats = await CronHeartbeat.getAllHeartbeats()
  const xauHeartbeat = heartbeats.find((h) => h.symbol === "XAU_USD")
  const gbpjpyHeartbeat = heartbeats.find((h) => h.symbol === "GBP_JPY")

  // Calculate cron health
  const lastExternalCronHit = Math.max(xauHeartbeat?.lastExecutionTime || 0, gbpjpyHeartbeat?.lastExecutionTime || 0)
  const timeSinceLastCron = lastExternalCronHit ? now - lastExternalCronHit : null
  const cronHitsLast60m = (xauHeartbeat?.executionCount || 0) + (gbpjpyHeartbeat?.executionCount || 0)

  // Get current signals
  const xauSignal = SignalCache.get("XAU_USD")
  const gbpjpySignal = SignalCache.get("GBP_JPY")

  // Get diagnostic data
  const nearMissAllStates = NearMissTracker.getAllStates()

  // Calculate operational verdict
  const isCronHealthy = timeSinceLastCron ? timeSinceLastCron < 10 * 60 * 1000 : false // Must have run in last 10 min
  const hasRecentActivity = (xauSignal && xauSignal.timestamp > oneHourAgo) || (xagSignal && xagSignal.timestamp > oneHourAgo)
  const systemOperational = isCronHealthy && hasRecentActivity

  const diagnostics = {
    timestamp: new Date().toISOString(),
    systemOperational,
    reason: systemOperational
      ? "✓ Cron is executing, signals are fresh, system is operational"
      : `✗ System not operational: ${
          !isCronHealthy ? `Cron not healthy (last ran ${timeSinceLastCron ? Math.floor(timeSinceLastCron / 1000) + "s ago" : "never"})` : ""
        }${!hasRecentActivity ? " | No recent signal activity" : ""}`,

    cronExecution: {
      lastExternalCronHitAt: lastExternalCronHit ? new Date(lastExternalCronHit).toISOString() : null,
      timeSinceLastCronMs: timeSinceLastCron,
      cronHitsLast60m,
      isCronHealthy,
    },

    perSymbolExecution: {
      XAU_USD: {
        lastRunAt: xauHeartbeat?.lastExecutionTime ? new Date(xauHeartbeat.lastExecutionTime).toISOString() : null,
        runsLast60m: xauHeartbeat?.executionCount || 0,
        lastRunCompleted: xauHeartbeat?.lastExecutionStatus === "SUCCESS",
        lastError: xauHeartbeat?.lastExecutionStatus === "FAILED" ? "Execution failed" : null,
        status: xauHeartbeat?.lastExecutionStatus || "UNKNOWN",
      },
      GBP_JPY: {
        lastRunAt: gbpjpyHeartbeat?.lastExecutionTime ? new Date(gbpjpyHeartbeat.lastExecutionTime).toISOString() : null,
        runsLast60m: gbpjpyHeartbeat?.executionCount || 0,
        lastRunCompleted: gbpjpyHeartbeat?.lastExecutionStatus === "SUCCESS",
        lastError: gbpjpyHeartbeat?.lastExecutionStatus === "FAILED" ? "Execution failed" : null,
        status: gbpjpyHeartbeat?.lastExecutionStatus || "UNKNOWN",
      },
    },

    strategyState: {
      XAU_USD: xauSignal
        ? {
            htfPolarity: xauSignal.htfPolarityState || "UNKNOWN",
            dailyBias: xauSignal.mtfAlignment?.daily || "UNKNOWN",
            h4Bias: xauSignal.mtfAlignment?.h4 || "UNKNOWN",
            h1Bias: xauSignal.mtfAlignment?.h1 || "UNKNOWN",
            primaryBlocker: xauSignal.blockedReason || "None",
            entryScore: xauSignal.confidence?.toFixed(1) || "0.0",
            cooldownActive: xauSignal.cooldownRemaining ? true : false,
            cooldownRemainingMs: xauSignal.cooldownRemaining || null,
            signalType: xauSignal.type,
            lastUpdated: new Date(xauSignal.timestamp).toISOString(),
          }
        : { error: "No signal data" },
      GBP_JPY: gbpjpySignal
        ? {
            htfPolarity: gbpjpySignal.htfPolarityState || "UNKNOWN",
            dailyBias: gbpjpySignal.mtfAlignment?.daily || "UNKNOWN",
            h4Bias: gbpjpySignal.mtfAlignment?.h4 || "UNKNOWN",
            h1Bias: gbpjpySignal.mtfAlignment?.h1 || "UNKNOWN",
            primaryBlocker: gbpjpySignal.blockedReason || "None",
            entryScore: gbpjpySignal.confidence?.toFixed(1) || "0.0",
            cooldownActive: gbpjpySignal.cooldownRemaining ? true : false,
            cooldownRemainingMs: gbpjpySignal.cooldownRemaining || null,
            signalType: gbpjpySignal.type,
            lastUpdated: new Date(gbpjpySignal.timestamp).toISOString(),
          }
        : { error: "No signal data" },
    },

    outcomesLast24h: {
      nearMissesRecorded: nearMissAllStates.reduce((sum, s) => sum + s.stats.count24h, 0),
      nearMissesBySymbol: nearMissAllStates.map((s) => ({
        symbol: s.symbol,
        count24h: s.stats.count24h,
        mostCommonBlocker: s.stats.mostCommonBlocker,
        directionalBias: s.stats.longVsShort,
        avgScoreGap: s.stats.avgScoreGap?.toFixed(2) || "0.00",
      })),
    },

    diagnosticSummary: {
      cronIsRunning: isCronHealthy,
      signalsAreFresh: hasRecentActivity,
      systemReadyForTrades: systemOperational && xauSignal?.type !== "NO_TRADE" && xagSignal?.type !== "NO_TRADE",
      currentMarketRegime: xauSignal?.marketState || "UNKNOWN",
      dataQualityOk: !!xauSignal && !!xagSignal,
    },

    serverDiagnosticTime: Date.now() - startTime,
  }

  return NextResponse.json(diagnostics)
}
