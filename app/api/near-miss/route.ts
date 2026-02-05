import { NextResponse } from "next/server"
import { NearMissTracker } from "@/lib/near-miss-tracker"

/**
 * GET /api/near-miss
 * 
 * Read-only diagnostic endpoint to retrieve near-miss tracking data.
 * This endpoint does NOT trigger trades or modify any system state.
 * 
 * Response includes:
 * - Per-symbol near-miss counts
 * - Full context of last 5 near-misses
 * - Statistics: most common blocker, avg score gap, directional bias
 */

export async function GET() {
  const allStates = NearMissTracker.getAllStates()

  const response = {
    timestamp: new Date().toISOString(),
    disclaimer:
      "DIAGNOSTIC ONLY - Near-misses are NOT trade signals and do NOT trigger entries. This data proves the system is working as designed.",
    symbols: allStates.map((state) => ({
      symbol: state.symbol,
      stats: state.stats,
      recentNearMisses: state.recentNearMisses.map((nm) => ({
        direction: nm.direction,
        timestamp: new Date(nm.timestamp).toISOString(),
        scoreGap: nm.scoreGap.toFixed(2),
        scorePercentage: nm.scorePercentage.toFixed(1),
        blockers: nm.blockers,
        blockerCount: nm.blockerCount,
        classification: nm.classification,
        htfPolarity: nm.htfPolarity,
        structure: nm.structure,
      })),
    })),
  }

  return NextResponse.json(response)
}
