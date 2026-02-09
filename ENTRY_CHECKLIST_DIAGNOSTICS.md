# Entry Checklist Diagnostics: Stochastic RSI, VWAP Bias, and Daily Anchor Issues

## Executive Summary

The Entry Checklist has 7 criteria that must be analyzed for proper functioning. When Stochastic RSI, VWAP Bias, or Daily Anchor Level indicators malfunction, they directly impact **Criterion 6 (Momentum confirmation)** and downstream **Criterion 7 (HTF polarity)**. This document provides comprehensive diagnostics for identifying and resolving these issues.

---

## Entry Checklist Criteria Breakdown

### Criterion 1: Daily bias aligned ⭐ MANDATORY
- **Data Source**: `signal.mtfBias?.daily`
- **Requirement**: Must equal `signal.direction` (LONG or SHORT)
- **Weight**: 3 points (HTF = heavy weight)
- **Impact on Checklist**: If fails, blocks A/A+ trades entirely

### Criterion 2: 4H bias aligned ⭐ MANDATORY
- **Data Source**: `signal.mtfBias?.["4h"]`
- **Requirement**: Must equal `signal.direction`
- **Weight**: 3 points (HTF = heavy weight)
- **Impact on Checklist**: If fails, blocks A/A+ trades entirely

### Criterion 3: 1H alignment (CONFIRMATORY)
- **Data Source**: `signal.mtfBias?.["1h"]`
- **Requirement**: Should equal `signal.direction` (non-blocking)
- **Weight**: 1 point (confirmation bonus only)
- **Impact on Checklist**: Missing doesn't block; non-blocking confirmation

### Criterion 4: ADX ≥ Threshold (ADX Strength Gate)
- **Data Source**: `signal.indicators?.adx`
- **Thresholds**:
  - A+: ≥ 23.5 (Gold) or ≥ 21 (other assets)
  - A: ≥ 19 (Gold) or ≥ 17 (other assets)
  - B: ≥ 15
- **Weight**: 1 point if passed
- **Bonus**: +0.5 if ADX > 25 and Tier B
- **Impact on Checklist**: Primary momentum strength filter

### Criterion 5: ATR ≥ 2.375 (Volatility Filter)
- **Data Source**: `signal.indicators?.atr`
- **Threshold**: ≥ 2.375 (softened 5% from original 2.5)
- **Weight**: 1 point if passed
- **Impact on Checklist**: Volatility validation

### Criterion 6: StochRSI Momentum Confirmation ⚠️ **PRONE TO ISSUES**
- **Data Source**: `signal.indicators?.stochRSI`
- **Expected Structure**: `{ value: number | null, state: "CALCULATING" | "MOMENTUM_UP" | "MOMENTUM_DOWN" | "COMPRESSION" }`
- **Pass Condition**: `state === "MOMENTUM_UP" || state === "MOMENTUM_DOWN"`
- **Weight**: 1 point if passed
- **Impact on Checklist**: Timing confirmation (non-blocking but affects score)
- **Known Issues**:
  - Returns `{ value: null, state: "CALCULATING" }` when insufficient candles
  - Never returns fake "50" value - uses structured object only
  - Requires at least `rsiPeriod + stochPeriod` candles (default: 17 candles minimum)

### Criterion 7: HTF Polarity Matches Direction ⭐ CRITICAL
- **Data Source**: `signal.htfTrend`
- **Pass Condition**: `!signal.htfTrend || signal.htfTrend === "NEUTRAL" || signal.htfTrend === signal.direction`
- **Tier B Allowance**: HTF NEUTRAL allowed if Daily+4H align
- **Weight**: 1 point if passed
- **Impact on Checklist**: Directional integrity verification

---

## Scoring System & Tier Thresholds

```
Total Score: Maximum 9 points

Score Breakdown:
- Daily aligned: +3
- 4H aligned: +3
- 1H aligned (confirmatory): +1
- ADX passed: +1 (+ 0.5 bonus if > 25 for Tier B)
- ATR passed: +1
- StochRSI passed: +1
- HTF polarity: +1
_______________________
Maximum: 9 points

Tier Thresholds:
- A+ Tier: Score ≥ 7
- A Tier: Score ≥ 6
- B Tier: Score ≥ 4.5
- NO_TRADE: Score < 4.5
```

---

## Stochastic RSI Issues & Solutions

### Issue 1: StochRSI Shows "Calculating..." for Extended Periods

**Root Cause**: Insufficient historical candles when API starts or after gaps
- Requires minimum 17 candles (14 RSI period + 3 stochastic period)
- May occur when market opens or data feed restarts

**Diagnostic Steps**:
1. Check browser console: `[v0] STOCH RSI STATE: CALCULATING | VALUE: null`
2. Verify candle count in API response: Should show `candle Count=XX`
3. Monitor for: `insufficient candles: <17`

**Fix Strategy**:
```javascript
// In API route (xau/route.ts):
console.log(`[v0] Candle count: ${normalizedCandles.length}`)
if (normalizedCandles.length < 17) {
  console.log("[v0] WARNING: Insufficient candles for StochRSI")
  // Still include partial calculation or wait for more data
}
```

### Issue 2: StochRSI Stuck in COMPRESSION State

**Root Cause**: RSI oscillating between min/max without clear directional bias
- Happens during consolidation/sideways market
- Compression = RSI values are clustered (no clear trend)

**Diagnostic Steps**:
1. Check if ADX is low (< 19 for A tier) - suggests consolidation
2. Monitor ATR - if low, confirms flat market
3. Look at recent candles - price ranging without breakout

**Fix Strategy**:
- This is NOT a bug - it's correct indicator behavior
- Treat as warning: market is consolidating, wait for breakout
- Lower ADX + Compression = Poor setup quality

### Issue 3: StochRSI State Misalignment with Actual Momentum

**Root Cause**: Candle data feed gaps or data normalization errors
- API returning candles with incorrect timestamps
- Volume data missing (defaulted to 1, skews calculations)

**Diagnostic Steps**:
1. Verify candle OHLC values in API response
2. Check for gaps in timestamp sequences
3. Monitor: `[v0] RSI values computed: X`

**Fix Strategy**:
```javascript
// Add data validation in TechnicalAnalysis:
const validateCandles = (candles) => {
  if (!candles || candles.length === 0) return false;
  
  // Check for valid OHLC
  for (let c of candles) {
    if (!c.high || !c.low || !c.close || c.high < c.low) {
      console.error("[v0] Invalid candle data:", c);
      return false;
    }
  }
  return true;
};
```

---

## VWAP Bias & Daily Anchor Level Issues

### Issue 1: VWAP Shows "—N/A" Instead of Anchor Price

**Root Cause**: Daily VWAP calculation returns 0 or is not being passed from API
- Daily candles not being fetched correctly
- Daily candles normalized incorrectly (missing OHLC data)
- VWAP calculation returns 0 when all candles are identical

**Diagnostic Steps**:
1. Check console: `[v0] Daily candles normalized: X candles`
2. Verify daily VWAP logs: `[v0] XAU Daily VWAP Calculated: X.XX`
3. Confirm in API response: `indicators.vwap > 0`

**Fix Strategy**:
```javascript
// In xau/route.ts, ensure daily VWAP calculation:
const dailyCandlesNormalized = dataDaily.candles?.map((c) => ({
  open: c.bid?.o || 0,
  high: c.bid?.h || 0,
  low: c.bid?.l || 0,
  close: c.bid?.c || 0,
  volume: c.volume || 1,
})) || [];

// Fallback if no daily VWAP
const finalVWAPValue = typeof vwapValueDaily === "number" && vwapValueDaily > 0
  ? vwapValueDaily
  : currentPrice; // Use current price as fallback anchor
```

### Issue 2: VWAP Bias Shows NEUTRAL When Expecting BULLISH/BEARISH

**Root Cause**: Price is within 0.2% threshold of VWAP (tight consolidation)
- VWAP threshold too tight (1.001 = 0.1% margin)
- Price genuinely in neutral zone relative to daily anchor

**Diagnostic Steps**:
1. Check current price vs VWAP value
2. Calculate: `|currentPrice - VWAP| / VWAP * 100`
3. If < 0.2%, status is NEUTRAL (correct behavior)

**Fix Strategy**:
- NEUTRAL state is correct; not an error
- Combined with low ADX = consolidation (poor setup)
- Combined with high ADX = accumulation phase (potential breakout)

### Issue 3: Daily Anchor Level Not Updating in Real-time

**Root Cause**: VWAP calculated once per session; doesn't update with 1H data
- This is CORRECT behavior - daily anchor is meant to be stable
- But when new daily candle opens (midnight UTC), value should reset

**Diagnostic Steps**:
1. Check timestamp of daily VWAP calculation
2. Verify if within same calendar day
3. Monitor for daily candle transitions

**Fix Strategy**:
- Recalculate daily VWAP when new daily candle detected
- Use `dataDaily.time` to detect boundary transitions
- Cache until next daily candle opens

---

## Entry Checklist Integrity Checks

### Test 1: Complete Checklist Validation
When signal is received, verify all 7 criteria have valid data:

```javascript
// In entry-checklist.tsx:
const validateEntryDecision = (entryDecision) => {
  if (!entryDecision) return { valid: false, reason: "No decision object" };
  
  const criteria = entryDecision.criteria || [];
  
  const checks = {
    dailyAligned: criteria[0]?.passed !== undefined,
    h4Aligned: criteria[1]?.passed !== undefined,
    h1Aligned: criteria[2]?.passed !== undefined,
    adxStrength: criteria[3]?.passed !== undefined,
    atrVolatility: criteria[4]?.passed !== undefined,
    stochRSI: criteria[5]?.passed !== undefined,
    htfPolarity: criteria[6]?.passed !== undefined,
  };
  
  const allPresent = Object.values(checks).every(v => v);
  return {
    valid: allPresent,
    missing: Object.entries(checks)
      .filter(([_, v]) => !v)
      .map(([k, _]) => k),
  };
};
```

### Test 2: Tier Consistency Check
Verify score-to-tier mapping is correct:

```javascript
const validateTierConsistency = (score, tier) => {
  const validTiers = {
    "A+": score >= 7,
    "A": score >= 6 && score < 7,
    "B": score >= 4.5 && score < 6,
    "NO_TRADE": score < 4.5,
  };
  
  return validTiers[tier] || false;
};
```

### Test 3: Blocking Reasons Validation
Ensure blockedReasons align with tier and score:

```javascript
const validateBlockingReasons = (entryDecision) => {
  const { allowed, tier, blockedReasons } = entryDecision;
  
  // If allowed is true, blockedReasons should be empty
  if (allowed && blockedReasons.length > 0) {
    console.error("[v0] INCONSISTENCY: Marked allowed but has blocked reasons");
    return false;
  }
  
  // If tier is A/A+, should have Daily+4H checks
  if ((tier === "A" || tier === "A+") && !blockedReasons.includes("Daily not aligned")) {
    if (entryDecision.criteria[0]?.passed === false) {
      console.error("[v0] INCONSISTENCY: A tier but missing Daily block");
      return false;
    }
  }
  
  return true;
};
```

---

## Real-time Data Synchronization Issues

### Problem 1: Indicators Out of Sync with Price

**Cause**: API polling slower than data feed updates
- 30-second poll interval vs live ticks
- Indicators calculated on stale candle data

**Solution**:
- Increase poll frequency during high volatility (ADX > 25)
- Cache previous indicator values for comparison
- Alert on indicator divergence from price

### Problem 2: Multi-timeframe Bias Misalignment

**Cause**: Daily/4H/1H candles closing at different times
- Daily candle closes at UTC midnight
- 4H candle closes every 4 hours
- 1H candle closes every hour

**Solution**:
- Verify all timeframes calculated on compatible closing times
- Use server time for all calculations, not client time
- Add timestamp validation in backend

### Problem 3: Stale Data After Market Close

**Cause**: Signal data not refreshed when market reopens
- API returns cached data from previous session
- New daily candle VWAP not calculated

**Solution**:
- Clear cache on market open detection
- Force recalculation of daily-level indicators
- Monitor `marketClosed` flag for transitions

---

## Recommended Monitoring Dashboard

Add to your admin/debug view:

```
REAL-TIME INDICATOR HEALTH

Stochastic RSI:
  ├─ Candle Count: 45/17 minimum ✓
  ├─ State: MOMENTUM_UP ✓
  ├─ Value: 85.3
  ├─ Last Updated: 2 seconds ago ✓
  └─ Data Errors: 0

VWAP Anchor:
  ├─ Daily VWAP: $2045.32
  ├─ Current Price: $2046.78
  ├─ Bias: BULLISH (0.07%)
  ├─ Last Updated: 1 hour ago ✓ (expected for daily)
  └─ Data Errors: 0

Entry Checklist:
  ├─ Criteria 1-7: All present ✓
  ├─ Score: 8.0/9
  ├─ Tier: A+
  ├─ Allowed: true
  ├─ Blocked Reasons: 0
  └─ Last Calculated: 2 seconds ago ✓
```

---

## Summary of Critical Fixes

1. **StochRSI**: Always returns structured object; check `.state` field, not value
2. **VWAP**: Calculate from daily candles (not 1H); fallback to current price if unavailable
3. **Daily Anchor**: Update when daily candle boundary crosses; stable within day
4. **Entry Checklist**: All 7 criteria must have data; score must map correctly to tier
5. **Data Sync**: Verify timestamps across all timeframes; cache and detect stale data

---

## Quick Troubleshooting Flowchart

```
Entry Checklist shows 6/7?
├─ Which criterion fails?
├─ Criterion 6 (StochRSI)?
│  ├─ Check: [v0] STOCH RSI STATE console log
│  ├─ If "CALCULATING": Wait for 17+ candles
│  ├─ If "COMPRESSION": This is correct; market consolidating
│  └─ If state !== MOMENTUM_* and still failing: Data integrity issue
│
├─ Criterion 7 (HTF Polarity)?
│  ├─ Check: HTF trend vs signal direction
│  ├─ If HTF NEUTRAL + Daily+4H aligned = Tier B allowed (correct)
│  └─ If HTF opposite direction = Block applied (correct)
│
├─ VWAP showing "—N/A"?
│  ├─ Check: [v0] Daily candles normalized: XX candles
│  ├─ If 0 candles: Daily data not fetched
│  ├─ If > 0 but N/A still shows: Fallback logic issue
│  └─ Fix: Ensure finalVWAPValue assignment in indicators object
│
└─ All criteria show but score wrong?
   ├─ Verify score calculation manually
   ├─ Check tier threshold logic (7/6/4.5)
   └─ Confirm weights in buildEntryDecision()
```
