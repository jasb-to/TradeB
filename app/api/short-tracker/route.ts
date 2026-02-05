import { NextResponse } from "next/server"
import { ShortRejectionTracker } from "@/lib/short-rejection-tracker"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * GET /api/short-tracker
 * 
 * Returns the last 3 rejected SHORT setups for XAU and XAG
 * with full context to verify rejections are legitimate.
 */
export async function GET() {
  const summary = ShortRejectionTracker.getSummary()

  const analysis = {
    xau: {
      ...summary.xau,
      verdict: summary.xau.suspicious === 0 
        ? "All rejections are legitimate" 
        : `WARNING: ${summary.xau.suspicious} suspicious rejection(s) found - investigate HTF logic`
    },
    xag: {
      ...summary.xag,
      verdict: summary.xag.suspicious === 0 
        ? "All rejections are legitimate" 
        : `WARNING: ${summary.xag.suspicious} suspicious rejection(s) found - investigate HTF logic`
    },
    overall: {
      totalRejections: summary.xau.total + summary.xag.total,
      totalLegitimate: summary.xau.legitimate + summary.xag.legitimate,
      totalSuspicious: summary.xau.suspicious + summary.xag.suspicious,
      htfFixWorking: summary.xau.suspicious === 0 && summary.xag.suspicious === 0,
      message: summary.xau.suspicious === 0 && summary.xag.suspicious === 0
        ? "HTF fix is working correctly - all SHORT rejections are for legitimate reasons"
        : "POTENTIAL BUG: Some SHORT rejections may be due to HTF mismatch - review logs"
    }
  }

  return NextResponse.json({
    success: true,
    timestamp: new Date().toISOString(),
    analysis,
    note: "Tracking up to 3 most recent SHORT rejections per symbol. Refresh the signal endpoints to populate."
  })
}

/**
 * POST /api/short-tracker
 * 
 * Reset the tracker (for testing)
 */
export async function POST() {
  ShortRejectionTracker.reset()
  return NextResponse.json({
    success: true,
    message: "SHORT rejection tracker reset"
  })
}
