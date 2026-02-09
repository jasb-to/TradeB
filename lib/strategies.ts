import type { Candle, Signal, TechnicalIndicators, TradingConfig, EntryDecision, EntryDecisionCriteria, TimeframeAlignment, AlignmentState } from "../types/trading"
import { TechnicalAnalysis } from "./indicators"

interface ChopAnalysis {
  isChoppy: boolean
  score: number
  reasons: string[]
}

interface SignalDebugInfo {
  timestamp: string
  price: number
  mtfBias: Record<string, string>
  marketRegime: string
  chopScore: number
  longChecks: { name: string; passed: boolean; value?: string }[]
  shortChecks: { name: string; passed: boolean; value?: string }[]
  indicatorSnapshot: {
    rsi: number
    adx: number
    stochRSI: number
    ema20: number
    ema50: number
    atr: number
  }
  dataSource: string
}

let lastDebugInfo: SignalDebugInfo | null = null

export function getLastSignalDebug(): SignalDebugInfo | null {
  return lastDebugInfo
}

export class TradingStrategies {
  private config: TradingConfig
  private dataSource = "OANDA"

  constructor(config: TradingConfig) {
    this.config = config
  }

  setDataSource(source: string) {
    this.dataSource = source
  }

  public async evaluateSignals(
    dataDaily: Candle[],
    data8h: Candle[],
    data4h: Candle[],
    data1h: Candle[],
    data15m: Candle[],
    data5m: Candle[],
  ): Promise<Signal> {
    const indicatorsDaily = await this.calculateIndicators(dataDaily, "daily")
    const indicators8h = await this.calculateIndicators(data8h, "8h")
    const indicators4h = await this.calculateIndicators(data4h, "4h")
    const indicators1h = await this.calculateIndicators(data1h, "1h")
    const indicators15m =
      data15m.length > 0 ? await this.calculateIndicators(data15m, "15m") : ({} as TechnicalIndicators)
    const indicators5m = data5m.length > 0 ? await this.calculateIndicators(data5m, "5m") : ({} as TechnicalIndicators)

    const currentPrice = data1h[data1h.length - 1]?.close || 0
    this._currentPrice = currentPrice // Store current price for Silver detection
    const adx1h = indicators1h.adx || 0

    const marketRegime = adx1h >= 25 ? "HIGH_TREND" : adx1h >= 20 ? "TREND" : "WEAK"

    // HIGHER-TIMEFRAME DIRECTIONAL POLARITY (Daily + 4H structure + VWAP bias)
    const htfPolarity = this.detectHTFPolarity(dataDaily, data4h, indicatorsDaily, indicators4h)

    // Calculate MTF bias with weighted scoring for Gold
    const biases = {
      daily: this.determineBias(dataDaily, indicatorsDaily),
      "4h": this.determineBias(data4h, indicators4h),
      "1h": this.determineBias(data1h, indicators1h),
      "15m": this.determineBias(data15m, indicators15m),
      "5m": this.determineBias(data5m, indicators5m),
    }

    // BUILD CANONICAL TIMEFRAME ALIGNMENT - single source of truth for UI
    const timeframeAlignment = this.buildTimeframeAlignment(biases)

    const weightedAlignment = this.calculateWeightedAlignment(biases)
    let direction = weightedAlignment.direction
    const alignmentScore = weightedAlignment.score

    // ENFORCE HTF POLARITY: Lock to HTF trend direction only
    if (htfPolarity.trend !== "NEUTRAL" && direction !== "NEUTRAL" && direction !== htfPolarity.trend) {
      console.log(`[v0] COUNTER-TREND: HTF ${htfPolarity.trend} vs signal ${direction}`)
      return {
        type: "NO_TRADE",
        direction: "NONE",
        alertLevel: 0,
        confidence: 0,
        counterTrendBlocked: true,
        htfTrend: htfPolarity.trend,
        timeframeAlignment: timeframeAlignment,
        // Include lastCandle so VWAP bias and price display work in the UI
        lastCandle: {
          close: currentPrice,
          timestamp: data1h[data1h.length - 1]?.timestamp || Date.now(),
        },
        reasons: [
          `Counter-trend entry blocked: HTF ${htfPolarity.trend}-only regime`,
          `(${htfPolarity.reason})`,
          `Lower timeframes suggesting opposite direction - ignored for directional alignment`,
        ],
        timestamp: Date.now(),
        strategy: "BREAKOUT_CHANDELIER",
        indicators: {
          adx: indicators1h.adx || 0,
          atr: indicators1h.atr || 0,
          rsi: indicators1h.rsi || 50,
          stochRSI: indicators1h.stochRSI || 50,
          vwap: indicators1h.vwap || 0,
          ema20: indicators1h.ema20 || 0,
          ema50: indicators1h.ema50 || 0,
          ema200: indicators1h.ema200 || 0,
          bollingerUpper: 0,
          bollingerLower: 0,
          chandelierStop: 0,
          chandelierLongStop: 0,
          chandelierShortStop: 0,
          chandelierStop4H: 0,
          macd: { macd: 0, signal: 0, histogram: 0 },
          divergence: { bullish: false, bearish: false, strength: 0 },
          volumeSpike: false,
        },
      }
    }

    // If HTF trend is clear, enforce it as direction
    if (htfPolarity.trend !== "NEUTRAL") {
      direction = htfPolarity.trend as "LONG" | "SHORT"
    }

    // ── TIER B GATE ──────────────────────────────────────────────────────
    // B-tier allows HTF NEUTRAL because Daily+4H structural divergence is
    // common during momentum phases; the trade is driven by 1H+15M alignment
    // instead. Reduced position sizing (50-60%) compensates for the weaker
    // HTF backing. Counter-trend is still hard-blocked above (line 89-126).
    //
    // Rules (Gold & Silver identical):
    //   1. 1H + 15M must align in the same direction
    //   2. Daily must NOT oppose the direction (NEUTRAL is acceptable)
    //   3. ADX >= 15 (lowered from 18 to capture valid momentum earlier)
    //   4. VWAP must support direction on 1H
    if (htfPolarity.trend === "NEUTRAL" && direction !== "NEUTRAL") {
      const price1h = data1h[data1h.length - 1]?.close || 0
      const vwap1h = indicators1h.vwap || 0

      // B-tier primary alignment: 1H + 15M must agree on direction
      const h1Aligned = biases["1h"] === direction
      const m15Aligned = biases["15m"] === direction
      const ltfAlignment = h1Aligned && m15Aligned

      // B-tier HTF constraint: Daily must NOT oppose (NEUTRAL is fine)
      const dailyNotOpposing = biases.daily === "NEUTRAL" || biases.daily === direction

      // B-tier ADX floor: 15 (lowered from 18 for both Gold & Silver)
      const adxMinimum = adx1h >= 15

      // VWAP directional support on 1H
      const vwapSupport = (direction === "LONG" && price1h > vwap1h) || (direction === "SHORT" && price1h < vwap1h)

      if (ltfAlignment && dailyNotOpposing && adxMinimum && vwapSupport) {
        console.log(`[v0] TIER B PASS: HTF neutral + 1H/15M aligned ${direction} | Daily=${biases.daily} ADX=${adx1h.toFixed(1)} VWAP=${vwapSupport ? "OK" : "FAIL"}`)
      } else {
        const failReasons: string[] = []
        if (!ltfAlignment) failReasons.push(`1H+15M not aligned (1H=${biases["1h"]}, 15M=${biases["15m"]})`)
        if (!dailyNotOpposing) failReasons.push(`Daily opposes (${biases.daily} vs ${direction})`)
        if (!adxMinimum) failReasons.push(`ADX ${adx1h.toFixed(1)} < 15`)
        if (!vwapSupport) failReasons.push("VWAP not supporting direction")
        console.log(`[v0] TIER B FAIL: ${failReasons.join(" | ")}`)
        return {
          type: "NO_TRADE",
          direction: "NONE",
          alertLevel: 0,
          confidence: 0,
          htfTrend: "NEUTRAL",
          timeframeAlignment: timeframeAlignment,
          lastCandle: {
            close: currentPrice,
            timestamp: data1h[data1h.length - 1]?.timestamp || Date.now(),
          },
          reasons: [`HTF neutral + B-tier gate failed: ${failReasons.join("; ")}`],
          timestamp: Date.now(),
          strategy: "BREAKOUT_CHANDELIER",
          indicators: {
            adx: indicators1h.adx || 0,
            atr: indicators1h.atr || 0,
            rsi: indicators1h.rsi || 50,
            stochRSI: indicators1h.stochRSI || 50,
            vwap: indicators1h.vwap || 0,
            ema20: indicators1h.ema20 || 0,
            ema50: indicators1h.ema50 || 0,
            ema200: indicators1h.ema200 || 0,
            bollingerUpper: 0,
            bollingerLower: 0,
            chandelierStop: 0,
            chandelierLongStop: 0,
            chandelierShortStop: 0,
            chandelierStop4H: 0,
            macd: { macd: 0, signal: 0, histogram: 0 },
            divergence: { bullish: false, bearish: false, strength: 0 },
            volumeSpike: false,
          },
        }
      }
    }

    const setupTier = this.determineSetupTier(alignmentScore, adx1h, biases.daily, biases["4h"], biases["1h"], biases["15m"])

    const dailyAligned = biases.daily === direction
    const h4Aligned = biases["4h"] === direction
    const htfAligned = htfPolarity.trend !== "NEUTRAL" // Declare htfAligned variable
    const canEnter = dailyAligned && h4Aligned && setupTier !== null

    if (!canEnter) {
      const reason = !dailyAligned ? "Daily" : !h4Aligned ? "4H" : "Score"
      console.log(`[v0] ✗ ${reason} misaligned`)
      return {
        type: "NO_TRADE",
        direction: "NONE",
        alertLevel: 0,
        confidence: 0,
        timeframeAlignment: timeframeAlignment,
        lastCandle: {
          close: currentPrice,
          timestamp: data1h[data1h.length - 1]?.timestamp || Date.now(),
        },
        timestamp: Date.now(),
        strategy: "BREAKOUT_CHANDELIER",
        reasons: [`Daily/4H alignment required for entry, got ${biases.daily}/${biases["4h"]}`],
        indicators: {
          adx: indicators1h.adx || 0,
          atr: indicators1h.atr || 0,
          rsi: indicators1h.rsi || 50,
          stochRSI: indicators1h.stochRSI || 50,
          vwap: indicators1h.vwap || 0,
          ema20: 0,
          ema50: 0,
          ema200: 0,
          bollingerUpper: 0,
          bollingerLower: 0,
          chandelierStop: 0,
          chandelierLongStop: 0,
          chandelierShortStop: 0,
          chandelierStop4H: 0,
          macd: { macd: 0, signal: 0, histogram: 0 },
          divergence: { bullish: false, bearish: false, strength: 0 },
          volumeSpike: false,
        },
      }
    }

    let confidence = 0
    if (adx1h >= 25) confidence = setupTier === "A+" ? 95 : 85
    else if (adx1h >= 20) confidence = setupTier === "A+" ? 75 : 70
    else if (setupTier === "B") confidence = 65 // Changed from 45 to 65-75 range
    else confidence = setupTier === "A+" ? 50 : 45

    const ltfConfirm = direction !== "NEUTRAL" ? this.checkLTFConfirmation(data5m, data15m, indicators5m, indicators15m, direction) : false
    if (!ltfConfirm) {
      console.log(`[v0] Awaiting LTF confirmation on 5M/15M for ${direction} entry`)
      return {
        type: "PENDING",
        direction: direction,
        alertLevel: 0,
        confidence: confidence,
        pendingReason: `Waiting for 5M/15M confirmation on ${direction} entry`,
        timeframeAlignment: timeframeAlignment,
        lastCandle: {
          close: currentPrice,
          timestamp: data1h[data1h.length - 1]?.timestamp || Date.now(),
        },
        strategyRequirements: {
          dailyAligned: dailyAligned,
          htfAligned: htfAligned,
          ltfConfirmation: false,
          adxThreshold: adx1h >= 20,
          atrThreshold: (indicators1h.atr || 0) >= 2.5,
          chopFilter: true,
        },
        waiting: {
          for: ["5M/15M breakout confirmation", "Price action on lower timeframes"],
          met: [
            `Daily ${biases.daily} aligned`,
            `4H ${biases["4h"]} aligned`,
            `1H ${biases["1h"]} aligned`,
            `ADX ${adx1h.toFixed(1)} (${marketRegime} regime)`,
            `ATR ${(indicators1h.atr || 0).toFixed(2)} (volatility adequate)`,
            `Setup Quality: ${setupTier}`,
            `HTF Trend: ${htfPolarity.trend}`,
          ],
        },
        reasons: [
          `Daily/4H/1H aligned on ${direction}`,
          `${marketRegime} market regime (ADX: ${adx1h.toFixed(1)})`,
          `HTF Polarity: ${htfPolarity.trend} (${htfPolarity.reason})`,
          "Awaiting lower timeframe entry confirmation",
        ],
        timestamp: Date.now(),
        strategy: "BREAKOUT_CHANDELIER",
        indicators: {
          adx: adx1h,
          atr: indicators1h.atr || 0,
          rsi: indicators1h.rsi || 50,
          stochRSI: indicators1h.stochRSI || 50,
          vwap: indicators1h.vwap || 0,
          ema20: indicators1h.ema20 || 0,
          ema50: indicators1h.ema50 || 0,
          ema200: indicators1h.ema200 || 0,
          bollingerUpper: 0,
          bollingerLower: 0,
          chandelierStop: 0,
          chandelierLongStop: 0,
          chandelierShortStop: 0,
          chandelierStop4H: 0,
          macd: { macd: 0, signal: 0, histogram: 0 },
          divergence: { bullish: false, bearish: false, strength: 0 },
          volumeSpike: false,
        },
      }
    }

    const atr1h = indicators1h.atr || 0
    const stopLoss = direction === "LONG" ? currentPrice - atr1h * 1.5 : currentPrice + atr1h * 1.5
    const takeProfit = direction === "LONG" ? currentPrice + atr1h * 2.0 : currentPrice - atr1h * 2.0
    const riskReward = (atr1h * 2.0) / (atr1h * 1.5)

    console.log(`[v0] SIGNAL: ${direction} ${setupTier} @ ${currentPrice.toFixed(2)} | Conf ${confidence}% | HTF ${htfPolarity.trend}`)

    return {
      type: "ENTRY",
      direction,
      alertLevel: confidence >= 80 ? 3 : confidence >= 70 ? 2 : 1,
      confidence,
      entryPrice: currentPrice,
      stopLoss,
      takeProfit1: direction === "LONG" ? currentPrice + atr1h * 1.0 : currentPrice - atr1h * 1.0,
      takeProfit2: direction === "LONG" ? currentPrice + atr1h * 2.0 : currentPrice - atr1h * 2.0,
      takeProfit: direction === "LONG" ? currentPrice + atr1h * 2.0 : currentPrice - atr1h * 2.0,
      riskReward,
      setupQuality: setupTier || "STANDARD",
      htfTrend: htfPolarity.trend,
      strategy: "BREAKOUT_CHANDELIER",
      reasons: [
        `${setupTier || "STANDARD"} Setup: Score ${alignmentScore}/10 (Daily + 4H + 1H aligned)`,
        `${marketRegime} market (ADX ${adx1h.toFixed(1)})`,
        `HTF Polarity: ${htfPolarity.trend} (${htfPolarity.reason})`,
        `Weighted MTF Score: ${alignmentScore}`,
        `Risk:Reward ${riskReward.toFixed(2)}:1 (min 1.33:1)`,
      ],
      indicators: {
        adx: adx1h,
        rsi: indicators1h.rsi,
        stochRSI: indicators1h.stochRSI,
        atr: atr1h,
        vwap: indicators1h.vwap || 0,
        ema20: indicators1h.ema20 || 0,
        ema50: indicators1h.ema50 || 0,
        ema200: indicators1h.ema200 || 0,
      },
      lastCandle: {
        close: currentPrice,
        timestamp: data1h[data1h.length - 1]?.timestamp || Date.now(),
      },
      mtfBias: biases as any,
      timeframeAlignment: timeframeAlignment,
      timestamp: Date.now(),
    }
  }

  private detectHTFPolarity(
    dataDaily: Candle[],
    data4h: Candle[],
    indDaily: TechnicalIndicators,
    ind4h: TechnicalIndicators,
  ): { trend: "LONG" | "SHORT" | "NEUTRAL"; reason: string } {
    // CRITICAL FIX #6: HTF Polarity Logic Clarification
    // HTF polarity is determined by Daily+4H consensus (both same direction = strong trend)
    // HTF NEUTRAL = Daily and 4H diverge or lack clear directional agreement
    // B-tier signals allowed when HTF NEUTRAL IF 1H momentum + VWAP support the direction
    // Counter-trend rule: If HTF shows clear trend, lower timeframes cannot override it
    
    if (!dataDaily.length || !data4h.length) {
      return { trend: "NEUTRAL", reason: "Insufficient HTF data" }
    }

    // Detect structure: HH/HL (uptrend) vs LH/LL (downtrend)
    const dailyStructure = this.detectStructure(dataDaily)
    const h4Structure = this.detectStructure(data4h)

    // Check VWAP bias as anchor
    const vwapDaily = indDaily.vwap || 0
    const vwap4h = ind4h.vwap || 0

    const priceDailyVsVWAP = dataDaily[dataDaily.length - 1].close > vwapDaily ? "ABOVE" : "BELOW"
    const price4hVsVWAP = data4h[data4h.length - 1].close > vwap4h ? "ABOVE" : "BELOW"

    // Strong uptrend: HH/HL structure + price above VWAP
    if ((dailyStructure === "HL" || dailyStructure === "HH") && (h4Structure === "HL" || h4Structure === "HH")) {
      if (priceDailyVsVWAP === "ABOVE" && price4hVsVWAP === "ABOVE") {
        return { trend: "LONG", reason: "HH/HL structure + price above VWAP anchors" }
      }
    }

    // Strong downtrend: LH/LL structure + price below VWAP
    if ((dailyStructure === "LL" || dailyStructure === "LH") && (h4Structure === "LL" || h4Structure === "LH")) {
      if (priceDailyVsVWAP === "BELOW" && price4hVsVWAP === "BELOW") {
        return { trend: "SHORT", reason: "LL/LH structure + price below VWAP anchors" }
      }
    }

    // Weak confirmation: Structure aligned but VWAP bias weak
    if ((dailyStructure === "HL" || dailyStructure === "HH") && (h4Structure === "HL" || h4Structure === "HH")) {
      return { trend: "LONG", reason: "HH/HL structure (VWAP bias weak)" }
    }

    if ((dailyStructure === "LL" || dailyStructure === "LH") && (h4Structure === "LL" || h4Structure === "LH")) {
      return { trend: "SHORT", reason: "LL/LH structure (VWAP bias weak)" }
    }

    // No clear trend
    return { trend: "NEUTRAL", reason: "Mixed structure signals - no clear HTF trend" }
  }

  private detectStructure(candles: Candle[]): "HH" | "HL" | "LL" | "LH" | "NEUTRAL" {
    if (candles.length < 4) return "NEUTRAL"

    // Use last 4 candles to detect structure
    const recent = candles.slice(-4)
    const h1 = recent[0].high
    const l1 = recent[0].low
    const h2 = recent[1].high
    const l2 = recent[1].low
    const h3 = recent[2].high
    const l3 = recent[2].low
    const h4 = recent[3].high
    const l4 = recent[3].low

    // HH = Higher High (comparing last two highs)
    // HL = Higher Low
    // LL = Lower Low
    // LH = Lower High

    if (h3 > h1 && h4 > h3 && l3 > l1 && l4 > l3) return "HH"
    if (h3 > h1 && l4 > l2) return "HL"
    if (l3 < l1 && l4 < l3 && h3 < h1 && h4 < h3) return "LL"
    if (l3 < l1 && h4 < h2) return "LH"

    return "NEUTRAL"
  }

  private calculateWeightedAlignment(biases: Record<string, "LONG" | "SHORT" | "NEUTRAL">) {
    const weights = {
      daily: 2,
      h4: 2,
      h1: 2,
      m15: 1,
      m5: 1,
    }

    let longScore = 0
    let shortScore = 0

    Object.entries(biases).forEach(([tf, bias]) => {
      const weight = weights[tf as keyof typeof weights] || 1
      if (bias === "LONG") longScore += weight
      else if (bias === "SHORT") shortScore += weight
    })

    const direction = longScore > shortScore ? "LONG" : shortScore > longScore ? "SHORT" : "NEUTRAL"
    const score = Math.max(longScore, shortScore)

    return { direction: direction as "LONG" | "SHORT" | "NEUTRAL", score }
  }

  private determineSetupTier(
    score: number,
    adx: number,
    dailyBias: string,
    h4Bias: string,
    h1Bias: string,
    m15Bias?: string,
  ): "A+" | "A" | "B" | null {
    const allAligned = dailyBias === h4Bias && h4Bias === h1Bias && dailyBias !== "NEUTRAL"

    // Check if this is Silver (more volatile) vs Gold
    const isSilver = this.isSilverSymbol()

    // ── A+ / A tiers: UNCHANGED ─────────────────────────────────────────
    // Silver-specific thresholds (more lenient due to higher volatility)
    if (isSilver) {
      if (score >= 7.5 && adx >= 21 && allAligned) return "A+"
      if (score >= 5.5 && adx >= 17 && allAligned) return "A"
    } else {
      // Gold-specific thresholds
      if (score >= 7.5 && adx >= 23.5 && allAligned) return "A+"
      if (score >= 5.5 && adx >= 19 && allAligned) return "A"
    }

    // ── B tier: UPDATED (Gold & Silver unified) ─────────────────────────
    // B-tier is driven by 1H+15M alignment, NOT full HTF consensus.
    // This allows more frequent signals during momentum phases while
    // preserving safety via reduced position sizing (50-60%).
    //
    // Requirements:
    //   - 1H bias must match trade direction (not NEUTRAL)
    //   - 15M bias must match trade direction (alignment confirmation)
    //   - ADX >= 15 (lowered from 18/16 to capture valid momentum earlier)
    //   - Daily must NOT oppose (checked upstream in B-tier gate)
    //   - Minimum weighted score >= 4
    const h1Active = h1Bias !== "NEUTRAL"
    const m15Active = m15Bias !== undefined && m15Bias !== "NEUTRAL"
    const ltfAligned = h1Active && m15Active && h1Bias === m15Bias

    if (score >= 4 && adx >= 15 && ltfAligned) return "B"

    return null
  }

  private isSilverSymbol(): boolean {
    // Check if we're trading Silver based on current price range or symbol
    // Silver typically trades around $20-30, Gold around $2000+
    const currentPrice = this.getCurrentPrice()
    return currentPrice < 1000 // If price < $1000, assume Silver
  }

  private getCurrentPrice(): number {
    // This would need to be passed in or stored from the main evaluation
    // For now, we'll use a placeholder that gets set during evaluation
    return this._currentPrice || 0
  }

  private _currentPrice: number = 0

  private checkLTFConfirmation(
    data5m: Candle[],
    data15m: Candle[],
    ind5m: TechnicalIndicators,
    ind15m: TechnicalIndicators,
    direction: "LONG" | "SHORT",
  ): boolean {
    if (!data5m.length || !data15m.length) return false

    const recent5m = data5m.slice(-3)
    const recent15m = data15m.slice(-2)

    // Check for breakout or retest pattern
    const ema20_5m = ind5m.ema20 || 0
    const ema20_15m = ind15m.ema20 || 0

    if (direction === "LONG") {
      return recent5m.some((c) => c.close > ema20_5m) && recent15m[recent15m.length - 1]?.close > ema20_15m
    } else {
      return recent5m.some((c) => c.close < ema20_5m) && recent15m[recent15m.length - 1]?.close < ema20_15m
    }
  }

  private determineBias(candles: Candle[], indicators: TechnicalIndicators): "LONG" | "SHORT" | "NEUTRAL" {
    if (!candles.length) return "NEUTRAL"

    const close = candles[candles.length - 1].close
    const ema20 = indicators.ema20 || 0
    const ema50 = indicators.ema50 || 0
    const rsi = indicators.rsi || 50

    if (close > ema20 && ema20 > ema50 && rsi > 50) {
      return "LONG"
    } else if (close < ema20 && ema20 < ema50 && rsi < 50) {
      return "SHORT"
    }
    return "NEUTRAL"
  }

  // Convert LONG/SHORT/NEUTRAL bias to BULLISH/BEARISH/NO_CLEAR_BIAS alignment state
  private biasToAlignmentState(bias: "LONG" | "SHORT" | "NEUTRAL"): AlignmentState {
    if (bias === "LONG") return "BULLISH"
    if (bias === "SHORT") return "BEARISH"
    return "NO_CLEAR_BIAS"
  }

  // BUILD CANONICAL TIMEFRAME ALIGNMENT: Explicit state for every timeframe
  public buildTimeframeAlignment(biases: Record<string, "LONG" | "SHORT" | "NEUTRAL">): TimeframeAlignment {
    return {
      daily: this.biasToAlignmentState(biases.daily),
      h4: this.biasToAlignmentState(biases["4h"]),
      h1: this.biasToAlignmentState(biases["1h"]),
      m15: this.biasToAlignmentState(biases["15m"]),
      m5: this.biasToAlignmentState(biases["5m"]),
    }
  }

  // CANONICAL ENTRY DECISION: Single source of truth for ALL entry criteria
  // 5% LOOSENING: Earlier entries within HTF integrity
  // Lower timeframes are used for timing, not permission
  public buildEntryDecision(signal: Signal): EntryDecision {
    const isGold = signal.indicators?.atr !== undefined // XAU/XAG detected by presence of indicators
    
    const criteria: EntryDecisionCriteria[] = []
    let score = 0

    // Criterion 1: Daily bias aligned (MANDATORY)
    const dailyAligned = signal.mtfBias?.daily === signal.direction
    criteria.push({
      key: "daily_aligned",
      label: "Daily bias aligned",
      passed: dailyAligned,
      reason: dailyAligned ? `Daily ${signal.direction}` : `Daily ${signal.mtfBias?.daily || "NO_CLEAR_BIAS"} ≠ signal ${signal.direction}`,
    })
    if (dailyAligned) score += 3 // HTF alignment carries more weight

    // Criterion 2: 4H bias aligned (MANDATORY)
    const h4Aligned = signal.mtfBias?.["4h"] === signal.direction
    criteria.push({
      key: "h4_aligned",
      label: "4H bias aligned",
      passed: h4Aligned,
      reason: h4Aligned ? `4H ${signal.direction}` : `4H ${signal.mtfBias?.["4h"] || "NO_CLEAR_BIAS"}`,
    })
    if (h4Aligned) score += 3 // HTF alignment carries more weight
    
    // Criterion 3: 1H alignment (CONFIRMATORY, NOT BLOCKING)
    // 5% LOOSENING: 1H is now +1 score (confirmatory) instead of mandatory gate
    const h1Aligned = signal.mtfBias?.["1h"] === signal.direction
    criteria.push({
      key: "h1_aligned",
      label: "1H alignment (confirmatory)",
      passed: h1Aligned,
      reason: h1Aligned ? `1H ${signal.direction}` : `1H ${signal.mtfBias?.["1h"] || "NO_CLEAR_BIAS"} (non-blocking)`,
    })
    if (h1Aligned) score += 1 // Non-blocking confirmation bonus

    // Criterion 4: ADX strength gate
    // B-tier ADX lowered to 15 (from 18) to allow valid momentum trades
    // when 1H+15M are aligned. A/A+ thresholds are UNCHANGED.
    const adx = signal.indicators?.adx || 0
    let adxThreshold = 15 // Default / Tier B minimum (lowered from 18)
    const setupQuality = signal.setupQuality || "STANDARD"
    if (setupQuality === "A+") adxThreshold = isGold ? 23.5 : 21
    else if (setupQuality === "A") adxThreshold = isGold ? 19 : 17
    else if (setupQuality === "B") adxThreshold = 15
    const adxPassed = adx >= adxThreshold
    criteria.push({
      key: "adx_strength",
      label: `ADX ≥ ${adxThreshold.toFixed(1)} (${setupQuality} threshold)`,
      passed: adxPassed,
      reason: `ADX ${adx.toFixed(1)} ${adxPassed ? "��" : "✗"}`,
    })
    if (adxPassed) score += 1

    // Bonus: ADX at elevated level (0.5 points) - FOR TIER B ONLY
    // Awards partial credit when ADX > 25 on Tier B entries (1H momentum-driven trades)
    // Does NOT apply to A/A+ trades (they need higher ADX baseline already)
    const adxElevated = adx > 25 && setupQuality === "B"
    if (adxElevated) {
      score += 0.5
      criteria.push({
        key: "adx_elevated",
        label: "ADX elevated (0.5 bonus - Tier B)",
        passed: true,
        reason: `ADX ${adx.toFixed(1)} > 25 (strong 1H momentum)`,
      })
    }

    // Criterion 5: ATR volatility filter (softened by ~5%)
    const atr = signal.indicators?.atr || 0
    const atrThreshold = 2.375 // 2.5 * 0.95
    const atrPassed = atr >= atrThreshold
    criteria.push({
      key: "atr_volatility",
      label: `ATR ≥ ${atrThreshold.toFixed(2)} (volatility)`,
      passed: atrPassed,
      reason: `ATR ${atr.toFixed(2)} ${atrPassed ? "✓" : "✗"}`,
    })
    if (atrPassed) score += 1

    // Criterion 6: Momentum confirmation (StochRSI state-based)
    // Lower timeframes used for timing, not permission
    const stochRsi = signal.indicators?.stochRSI
    let stochPassed = false
    let stochReason = "No data"
    if (stochRsi && typeof stochRsi === "object" && "state" in stochRsi) {
      const state = (stochRsi as any).state
      const value = (stochRsi as any).value
      stochPassed = state === "MOMENTUM_UP" || state === "MOMENTUM_DOWN"
      stochReason = value !== null ? `${state} (${value.toFixed(0)})` : "Calculating..."
    }
    criteria.push({
      key: "momentum_confirm",
      label: "StochRSI confirms momentum (timing)",
      passed: stochPassed,
      reason: stochReason,
    })
    if (stochPassed) score += 1

    // Criterion 7: HTF polarity (directional integrity)
    // TIER B ALLOWANCE: HTF NEUTRAL is allowed if Daily+4H align
    const htfTrendMatch = !signal.htfTrend || signal.htfTrend === "NEUTRAL" || signal.htfTrend === signal.direction
    const tierBAllowance = signal.htfTrend === "NEUTRAL" && dailyAligned && h4Aligned
    criteria.push({
      key: "htf_polarity",
      label: "HTF polarity matches direction",
      passed: htfTrendMatch || tierBAllowance,
      reason: htfTrendMatch ? `HTF ${signal.direction}` : tierBAllowance ? `HTF NEUTRAL (Tier B allowed)` : `HTF ${signal.htfTrend} ≠ ${signal.direction}`,
    })
    if (htfTrendMatch || tierBAllowance) score += 1

    // Determine tier based on NEW score thresholds
    // Tier B threshold raised to 4.5 for better quality filtering
    let tier: "NO_TRADE" | "B" | "A" | "A+" = "NO_TRADE"
    if (score >= 7) tier = "A+"
    else if (score >= 6) tier = "A"
    else if (score >= 4.5) tier = "B"

    // Alert level based on tier
    let alertLevel: 0 | 1 | 2 | 3 = 0
    if (tier === "A+") alertLevel = 3
    else if (tier === "A") alertLevel = 2
    else if (tier === "B") alertLevel = 1

    // Blocking reasons: Tier-dependent gating
    const blockedReasons: string[] = []
    
    // A/A+ tiers: Require Daily+4H alignment (strict)
    if (tier === "A" || tier === "A+") {
      if (!dailyAligned) blockedReasons.push("Daily not aligned")
      if (!h4Aligned) blockedReasons.push("4H not aligned")
    }
    
    // B tier: NO Daily/4H requirement - 1H drives the trade
    // Only block if HTF is actively counter-trend (not neutral/mixed)
    if (signal.htfTrend && signal.htfTrend !== "NEUTRAL" && signal.htfTrend !== signal.direction) {
      blockedReasons.push("Counter-trend detected")
    }

    const allowed = tier !== "NO_TRADE" && blockedReasons.length === 0

    if (tier === "B" && allowed) {
      console.log(`[v0] 🔵 TIER B APPROVED: 1H momentum-driven | Daily=${signal.mtfBias?.daily || "?"} 4H=${signal.mtfBias?.["4h"] || "?"} 1H=${signal.mtfBias?.["1h"] || "?"}`)
    }
    
    console.log(`[v0] ENTRY DECISION: ${allowed ? "✓ APPROVED" : "✗ REJECTED"} | Tier ${tier} | Score ${score.toFixed(1)}/9`)
    if (blockedReasons.length > 0) {
      console.log(`[v0] BLOCKED: ${blockedReasons.join(", ")}`)
    }

    return {
      allowed,
      tier,
      score: Math.round(score * 10) / 10,
      criteria,
      blockedReasons,
      alertLevel,
      confidence: signal.confidence || 0,
    }
  }

  private async calculateIndicators(data: Candle[], timeframe: string): Promise<TechnicalIndicators> {
    if (!data || data.length < 14) {
      console.log(`[v0] ${timeframe} Indicators: Insufficient data (${data?.length || 0} candles)`)
      return {
        adx: 0,
        atr: 0,
        rsi: 50,
        stochRSI: 50,
        vwap: 0,
        ema20: 0,
        ema50: 0,
        ema200: 0,
        bollingerUpper: 0,
        bollingerLower: 0,
        chandelierStop: 0,
        chandelierLongStop: 0,
        chandelierShortStop: 0,
        chandelierStop4H: 0,
        macd: { macd: 0, signal: 0, histogram: 0 },
        divergence: { bullish: false, bearish: false, strength: 0 },
        volumeSpike: false,
      }
    }

    try {
      console.log(`[v0] ${timeframe} Calculating indicators: ${data.length} candles`)
      const indicators = await TechnicalAnalysis.calculateAllIndicators(data)
      
      // Validate indicators are not all zero
      const hasValidIndicators = indicators.adx > 0 || indicators.atr > 0 || indicators.rsi !== 50
      if (!hasValidIndicators) {
        console.log(`[v0] ${timeframe} Indicators: All values zero/neutral - using fallback`)
        return {
          adx: 20, // Default ADX
          atr: 2.5, // Default ATR
          rsi: 50,
          stochRSI: 50,
          vwap: data[data.length - 1].close,
          ema20: data[data.length - 1].close,
          ema50: data[data.length - 1].close,
          ema200: data[data.length - 1].close,
          bollingerUpper: 0,
          bollingerLower: 0,
          chandelierStop: 0,
          chandelierLongStop: 0,
          chandelierShortStop: 0,
          chandelierStop4H: 0,
          macd: { macd: 0, signal: 0, histogram: 0 },
          divergence: { bullish: false, bearish: false, strength: 0 },
          volumeSpike: false,
        }
      }
      
      console.log(`[v0] ${timeframe} Indicators Calculated: ADX=${indicators.adx.toFixed(2)} ATR=${indicators.atr.toFixed(2)} RSI=${indicators.rsi.toFixed(2)} | Candle Count=${data.length}`)
      return indicators
    } catch (error) {
      console.error(`[v0] Error calculating indicators for ${timeframe}:`, error)
      return {
        adx: 20, // Fallback ADX
        atr: 2.5, // Fallback ATR
        rsi: 50,
        stochRSI: 50,
        vwap: data[data.length - 1].close,
        ema20: data[data.length - 1].close,
        ema50: data[data.length - 1].close,
        ema200: data[data.length - 1].close,
        bollingerUpper: 0,
        bollingerLower: 0,
        chandelierStop: 0,
        chandelierLongStop: 0,
        chandelierShortStop: 0,
        chandelierStop4H: 0,
        macd: { macd: 0, signal: 0, histogram: 0 },
        divergence: { bullish: false, bearish: false, strength: 0 },
        volumeSpike: false,
      }
    }
  }
}
