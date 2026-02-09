import { NextResponse } from "next/server"
import { CronHeartbeat } from "@/lib/cron-heartbeat"
import { NearMissTracker } from "@/lib/near-miss-tracker"
import { SignalCache } from "@/lib/signal-cache"

/**
 * SYSTEM DIAGNOSTICS ENDPOINT
 * 
 * Returns complete system health snapshot:
 * - Cron execution state (last hit, frequency, duration)
 * - Per-symbol execution tracking (XAU_USD, XAG_USD)
 * - Current strategy state (HTF polarity, biases, entry score)
 * - Outcome counters (trades, near-misses, B-trades)
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
  const xagHeartbeat = heartbeats.find((h) => h.symbol === "XAG_USD")

  // Calculate cron health
  const lastExternalCronHit = Math.max(xauHeartbeat?.lastExecutionTime || 0, xagHeartbeat?.lastExecutionTime || 0)
  const timeSinceLastCron = lastExternalCronHit ? now - lastExternalCronHit : null
  const cronHitsLast60m = (xauHeartbeat?.executionCount || 0) + (xagHeartbeat?.executionCount || 0)

  // Get current signals
  const xauSignal = SignalCache.get("XAU_USD")
  const xagSignal = SignalCache.get("XAG_USD")

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
      XAG_USD: {
        lastRunAt: xagHeartbeat?.lastExecutionTime ? new Date(xagHeartbeat.lastExecutionTime).toISOString() : null,
        runsLast60m: xagHeartbeat?.executionCount || 0,
        lastRunCompleted: xagHeartbeat?.lastExecutionStatus === "SUCCESS",
        lastError: xagHeartbeat?.lastExecutionStatus === "FAILED" ? "Execution failed" : null,
        status: xagHeartbeat?.lastExecutionStatus || "UNKNOWN",
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
      XAG_USD: xagSignal
        ? {
            htfPolarity: xagSignal.htfPolarityState || "UNKNOWN",
            dailyBias: xagSignal.mtfAlignment?.daily || "UNKNOWN",
            h4Bias: xagSignal.mtfAlignment?.h4 || "UNKNOWN",
            h1Bias: xagSignal.mtfAlignment?.h1 || "UNKNOWN",
            primaryBlocker: xagSignal.blockedReason || "None",
            entryScore: xagSignal.confidence?.toFixed(1) || "0.0",
            cooldownActive: xagSignal.cooldownRemaining ? true : false,
            cooldownRemainingMs: xagSignal.cooldownRemaining || null,
            signalType: xagSignal.type,
            lastUpdated: new Date(xagSignal.timestamp).toISOString(),
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
