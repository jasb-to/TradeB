import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  // 🔴 PRODUCTION SAFETY: Live trade execution disabled until signal engine is 100% stable
  // This endpoint is reserved for future use when:
  // - Entry decision tier assignment is verified stable (≥ 7 days production data)
  // - OANDA API rate limiting is tested and validated
  // - Alert deduplication is confirmed working
  // - Multi-symbol stacking is operational
  //
  // For now, all trading requires manual execution via dashboard UI + confirmation dialog
  
  return NextResponse.json(
    {
      success: false,
      error: "EXECUTION_DISABLED",
      message: "Automated trade execution is currently disabled in production mode for safety",
      reason: "Signal engine stabilization phase - manual execution only",
      nextReview: "2026-02-27",
      status: "DISABLED_FOR_PRODUCTION_SAFETY"
    },
    { status: 503 }
  )
}
