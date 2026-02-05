/**
 * SHORT REJECTION TRACKER
 * 
 * Tracks the next 3 rejected SHORT setups for XAU and XAG with full context.
 * Used to verify that rejections are for legitimate reasons (ADX, ATR, structure)
 * and not HTF mismatch after the fix.
 */

interface ShortRejectionLog {
  timestamp: string
  symbol: string
  direction: "SHORT"
  htfPolarity: string
  htfStructure: {
    daily: string
    h4: string
  }
  mtfBias: {
    daily: string
    h4: string
    h1: string
    m15?: string
    m5?: string
  }
  indicators: {
    adx: number
    atr: number
    rsi: number
    stochRSI: number | null
    vwap: number
  }
  entryDecision: {
    allowed: boolean
    tier: string
    score: number
    blockedReasons: string[]
  }
  rejectionCategory: "HTF_MISMATCH" | "STRUCTURE_ALIGNMENT" | "ADX_THRESHOLD" | "ATR_THRESHOLD" | "SCORE_TOO_LOW" | "COUNTER_TREND" | "HTF_NEUTRAL"
  isLegitimate: boolean
  analysisNote: string
}

class ShortRejectionTrackerClass {
  private xauRejections: ShortRejectionLog[] = []
  private xagRejections: ShortRejectionLog[] = []
  private maxTracked = 3

  private categorizeRejection(log: Omit<ShortRejectionLog, "rejectionCategory" | "isLegitimate" | "analysisNote">): Pick<ShortRejectionLog, "rejectionCategory" | "isLegitimate" | "analysisNote"> {
    const blockedReasons = log.entryDecision.blockedReasons

    // Check for HTF mismatch (the bug we fixed)
    if (blockedReasons.some(r => r.includes("HTF") && r.includes("mismatch"))) {
      return {
        rejectionCategory: "HTF_MISMATCH",
        isLegitimate: false,
        analysisNote: "BUG: HTF mismatch blocking SHORT - this should not happen after the fix"
      }
    }

    // Check for counter-trend block
    if (blockedReasons.some(r => r.includes("Counter-trend"))) {
      return {
        rejectionCategory: "COUNTER_TREND",
        isLegitimate: true,
        analysisNote: "Legitimate: HTF polarity does not support SHORT direction"
      }
    }

    // Check for HTF Neutral (mixed signals)
    if (log.htfPolarity === "NEUTRAL") {
      return {
        rejectionCategory: "HTF_NEUTRAL",
        isLegitimate: true,
        analysisNote: `Legitimate: HTF polarity is NEUTRAL (Daily=${log.htfStructure.daily}, 4H=${log.htfStructure.h4}) - no clear trend`
      }
    }

    // Check for structure alignment issues
    if (blockedReasons.some(r => r.includes("Daily not aligned") || r.includes("4H not aligned"))) {
      return {
        rejectionCategory: "STRUCTURE_ALIGNMENT",
        isLegitimate: true,
        analysisNote: `Legitimate: Structure not aligned - Daily=${log.mtfBias.daily}, 4H=${log.mtfBias.h4}`
      }
    }

    // Check for ADX threshold
    if (log.indicators.adx < 19) {
      return {
        rejectionCategory: "ADX_THRESHOLD",
        isLegitimate: true,
        analysisNote: `Legitimate: ADX ${log.indicators.adx.toFixed(1)} below threshold (19)`
      }
    }

    // Check for ATR threshold
    if (log.indicators.atr < 2.375) {
      return {
        rejectionCategory: "ATR_THRESHOLD",
        isLegitimate: true,
        analysisNote: `Legitimate: ATR ${log.indicators.atr.toFixed(2)} below threshold (2.375)`
      }
    }

    // Default to score too low
    return {
      rejectionCategory: "SCORE_TOO_LOW",
      isLegitimate: true,
      analysisNote: `Legitimate: Entry score ${log.entryDecision.score}/9 insufficient for tier promotion`
    }
  }

  logShortRejection(
    symbol: "XAU_USD" | "XAG_USD",
    htfPolarity: string,
    htfStructure: { daily: string; h4: string },
    mtfBias: { daily: string; h4: string; h1: string; m15?: string; m5?: string },
    indicators: { adx: number; atr: number; rsi: number; stochRSI: number | null; vwap: number },
    entryDecision: { allowed: boolean; tier: string; score: number; blockedReasons: string[] }
  ) {
    // Only track if this could potentially be a SHORT setup
    // (either HTF is SHORT or MTF shows bearish bias)
    const couldBeShort = htfPolarity === "SHORT" || 
                         mtfBias.daily === "SHORT" || 
                         mtfBias.h4 === "SHORT" ||
                         (htfPolarity === "NEUTRAL" && (htfStructure.h4 === "LL" || htfStructure.h4 === "LH"))

    if (!couldBeShort) {
      return // Not a SHORT setup, don't track
    }

    const baseLog: Omit<ShortRejectionLog, "rejectionCategory" | "isLegitimate" | "analysisNote"> = {
      timestamp: new Date().toISOString(),
      symbol,
      direction: "SHORT",
      htfPolarity,
      htfStructure,
      mtfBias,
      indicators,
      entryDecision
    }

    const categorization = this.categorizeRejection(baseLog)
    const fullLog: ShortRejectionLog = { ...baseLog, ...categorization }

    // Add to appropriate array
    const rejections = symbol === "XAU_USD" ? this.xauRejections : this.xagRejections

    // Only keep the last 3
    if (rejections.length >= this.maxTracked) {
      rejections.shift()
    }
    rejections.push(fullLog)

    // Log to console with full context
    console.log(`[v0][SHORT_TRACKER] ${symbol} SHORT REJECTION #${rejections.length}/${this.maxTracked}:`)
    console.log(`[v0][SHORT_TRACKER]   HTF Polarity: ${htfPolarity} | Structure: Daily=${htfStructure.daily}, 4H=${htfStructure.h4}`)
    console.log(`[v0][SHORT_TRACKER]   MTF Bias: Daily=${mtfBias.daily} | 4H=${mtfBias.h4} | 1H=${mtfBias.h1}`)
    console.log(`[v0][SHORT_TRACKER]   Indicators: ADX=${indicators.adx.toFixed(1)} | ATR=${indicators.atr.toFixed(2)} | RSI=${indicators.rsi.toFixed(1)}`)
    console.log(`[v0][SHORT_TRACKER]   Entry Decision: allowed=${entryDecision.allowed} | tier=${entryDecision.tier} | score=${entryDecision.score}/9`)
    console.log(`[v0][SHORT_TRACKER]   Blocked Reasons: ${entryDecision.blockedReasons.join(" | ") || "NONE"}`)
    console.log(`[v0][SHORT_TRACKER]   Category: ${fullLog.rejectionCategory}`)
    console.log(`[v0][SHORT_TRACKER]   Legitimate: ${fullLog.isLegitimate ? "YES" : "NO - INVESTIGATE BUG"}`)
    console.log(`[v0][SHORT_TRACKER]   Analysis: ${fullLog.analysisNote}`)
    console.log(`[v0][SHORT_TRACKER] ---`)
  }

  getXauRejections(): ShortRejectionLog[] {
    return [...this.xauRejections]
  }

  getXagRejections(): ShortRejectionLog[] {
    return [...this.xagRejections]
  }

  getSummary(): {
    xau: { total: number; legitimate: number; suspicious: number; logs: ShortRejectionLog[] }
    xag: { total: number; legitimate: number; suspicious: number; logs: ShortRejectionLog[] }
  } {
    const xauLegit = this.xauRejections.filter(r => r.isLegitimate).length
    const xagLegit = this.xagRejections.filter(r => r.isLegitimate).length

    return {
      xau: {
        total: this.xauRejections.length,
        legitimate: xauLegit,
        suspicious: this.xauRejections.length - xauLegit,
        logs: this.xauRejections
      },
      xag: {
        total: this.xagRejections.length,
        legitimate: xagLegit,
        suspicious: this.xagRejections.length - xagLegit,
        logs: this.xagRejections
      }
    }
  }

  reset() {
    this.xauRejections = []
    this.xagRejections = []
  }
}

export const ShortRejectionTracker = new ShortRejectionTrackerClass()
