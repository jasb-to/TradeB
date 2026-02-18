# Trading Dashboard Troubleshooting Plan - Complete Analysis

## Executive Summary

**System Version:** 7.0.0-COMPLETE-FIX  
**Status:** Signal evaluation working correctly; Entry decision logic has critical bug causing score recalculation  
**Root Cause:** buildEntryDecision() recalculating score as 1.0 despite signal.score being 3-4 from strict evaluation

---

## Critical Issues & Root Causes

### Issue #1: Market Regime Shows "TREND" Instead of "LONG"/"SHORT"
**Status:** FIXED in code (gold-signal-panel.tsx:93)  
**Root Cause:** Component checking signal.direction; when NULL, displays "TREND"  
**Current State:** signal.direction=DOWN is being passed correctly from API  
**Verification:** `signal.direction === "LONG" ? "📈 LONG" : signal.direction === "SHORT" ? "📉 SHORT" : "TREND"`

---

### Issue #2: Multi-Timeframe Alignment Missing Data (4H/1H/15M/5M Blank)
**Status:** FIXED in code (signal/current/route.ts:369)  
**Root Cause:** timeframeAlignment field not mapped from mtfBias object  
**Current State:** Code includes `timeframeAlignment: mtfBias` mapping  
**Data Flow:** mtfBias object built with all timeframes → timeframeAlignment field → MTFBiasViewer component  
**Verification:** Check MTFBiasViewer component receives timeframeAlignment with Daily/4H/1H/15M/5M values

---

### Issue #3: Stochastic RSI Shows "ERRORDATA ERROR"
**Status:** FIXED in code (indicator-cards.tsx proper null checks)  
**Root Cause:** Null/undefined indicator data not handled; ERROR displayed when missing  
**Current State:** Component checks `stochRsiData.value !== null && stochRsiData.value !== undefined`  
**Expected Behavior:** Shows actual value when present, or "No data" informational message when missing  
**Verification:** Check if stochRsiData is flowing through signal.indicators correctly

---

### Issue #4: Signal Checklist Shows 3/7 Criteria But Trade Executing
**STATUS:** CRITICAL BUG FOUND ⚠️  
**Root Cause:** buildEntryDecision() score recalculation error  
**Evidence from Debug Logs:**
```
RAW SIGNAL: score=4, tier=B, direction=DOWN (from strict-strategy-v7)
↓
buildEntryDecision SCORE: score=1.0 → tier=NO_TRADE
↓
ENTRY DECISION: ✗ REJECTED | Tier NO_TRADE | Score 1.0/9
```
**Problem:** Entry decision is recalculating score FROM SCRATCH instead of using signal.score (4)  
**Impact:** Valid B-tier trades (score 3-4) rejected despite correct initial evaluation  
**Location:** lib/strategies.ts buildEntryDecision() lines ~750-900

---

### Issue #5: No Telegram Alerts Dispatched
**Status:** Blocked by Issue #4  
**Root Cause:** Entry decision returns approved=false due to score recalculation bug  
**Alert Logic:** Requires `!isMarketClosed && entryDecision.approved && type=ENTRY && alertLevel>=2`  
**Current State:** Alert check shows "APPROVED" but then skipped because "Entry decision not approved"  
**Impact:** Telegram notification never sent even for valid setups  
**Verification:** Once Issue #4 fixed, alerts should dispatch automatically

---

### Issue #6: Signal Card Flickering (Not Persistent Until TP/SL)
**Status:** Caused by Issue #4  
**Root Cause:** Score oscillating (3→4→3) due to fresh evaluation each poll; entry decision rejects both states  
**Expected Behavior:** Cache should hold valid trade signal until TP/SL hit  
**Verification:** Once score stabilizes, flickering should stop

---

## Data Flow Analysis

### Current Signal Generation Path (WORKING)
```
DataFetcher loads OANDA candles
↓
StrictStrategyV7.evaluateSignals()
  - HARD_GATE_1: EMA gap ✓, ADX ✓
  - HARD_GATE_2: 1H breakout ✓
  - Selective scoring: 3-4 components met
↓
Returns: type=ENTRY, direction=DOWN, score=3-4, tier=B
✓ CORRECT
```

### Entry Decision Path (BROKEN)
```
Signal passed to buildEntryDecision()
↓
Function recalculates score FROM SCRATCH using criteria evaluation
  - Criterion 1: Daily bias aligned (2 points)
  - Criterion 2: 4H bias aligned (2 points)
  - Criterion 3-7: Various other checks
↓
Score recalculated as 1.0 (only 3/7 criteria pass)
↓
Tier assigned: NO_TRADE (score < 5.0)
✓ BUG: Should USE signal.score=4 instead of recalculating
```

### Issue: buildEntryDecision Should Reference Signal Score
**Current Logic:** Recalculates score independently → often lower than original  
**Correct Logic:** Should validate criteria ONLY to gate approval, then assign tier based on signal.score  
**Fix Required:** Use signal.score instead of recalculating

---

## Specific Fixes Required

### Fix #1: buildEntryDecision Score Calculation
**File:** lib/strategies.ts  
**Lines:** ~831-900  
**Change:**
```typescript
// WRONG (current):
const score = Math.min(Math.round(rawScore * 10) / 10, 9)
const tier = score >= 7.0 ? "A+" : score >= 6.0 ? "A" : score >= 5.0 ? "B" : "NO_TRADE"

// CORRECT (should be):
const score = signal.score ?? 0  // USE SIGNAL SCORE, don't recalculate
const tier = score >= 4 ? "B" : score >= 5 ? "A" : score >= 6 ? "A+" : "NO_TRADE"
```
**Reason:** Signal already calculated correct score; entry decision just validates approval criteria

---

### Fix #2: Entry Decision Approval Logic
**File:** lib/strategies.ts buildEntryDecision()  
**Current Issue:** Requires ALL criteria to pass; should allow B-tier without Daily/4H  
**Change:** 
- B-tier entries: Only require 1H alignment + 3+ criteria
- A-tier entries: Require Daily + 4H alignment  
- A+-tier entries: Require full alignment

---

### Fix #3: Multi-Timeframe Data Population
**File:** app/api/signal/current/route.ts  
**Verify:** Line 369 includes `timeframeAlignment: mtfBias`  
**Check:** mtfBias object contains all timeframe data before mapping

---

## Testing Verification Steps

### Step 1: Verify Signal Evaluation (WORKING)
```
[v0] Check debug logs for: "STRICT v7.3 ENTRY: DOWN | Score 3-4"
Expected: Direction and score values present
```

### Step 2: Verify Entry Decision (BROKEN - FIX REQUIRED)
```
[v0] Check debug logs for: "buildEntryDecision SCORE-BASED TIER: score="
Current: Shows score=1.0 (WRONG)
Expected: Should show score=4 (from signal)
```

### Step 3: Verify Tier Assignment
```
Expected Flow:
Signal: tier=B, score=4
Entry Decision: tier=B (using signal.score), approved=true
Alert: Dispatched with B-tier setup
```

### Step 4: Verify UI Display After Fix
- Market Regime: Shows "📉 SHORT" or "📈 LONG" (not TREND)
- Multi-Timeframe: Shows DAILY/4H/1H/15M/5M values (not blank)
- Entry Checklist: Shows correct score and tier matching signal
- Signal Card: Stays on screen until manual close (no flickering)
- Telegram: Alert received within 1-2 seconds of entry approval

---

## Implementation Order

**Priority 1 (CRITICAL):** Fix buildEntryDecision score usage (Issue #4)
- Use signal.score instead of recalculating
- Adjust tier thresholds to match score range (3-6)
- Test: Score should remain 3-4, tier should be B

**Priority 2 (BLOCKED BY P1):** Enable Telegram alerts (Issue #5)
- Will automatically work once P1 is fixed
- Test: Send /api/test-telegram to verify

**Priority 3 (VERIFY):** Multi-timeframe alignment (Issue #2)
- Should already be fixed; verify timeframeAlignment field populates
- Test: Check MTF Alignment section displays all timeframes

**Priority 4 (VERIFY):** Stochastic RSI (Issue #3)
- Should already be fixed; verify indicator data flows through
- Test: Check stochRSI shows value or "No data" (not ERROR)

**Priority 5 (VERIFY):** Market Regime display (Issue #1)
- Should already be fixed; verify direction passes correctly
- Test: Check displays "LONG" or "SHORT" (not TREND)

---

## Deployment Verification

**Before Live Deployment:**
1. Pull latest code from main branch
2. Verify buildEntryDecision uses signal.score (not recalculated)
3. Run local test: `/api/signal/current?symbol=XAU_USD` should return score=3-4, tier=B
4. Check entry checklist shows correct score and tier
5. Trigger test alert: `/api/test-telegram` should send to chat
6. Verify signal persists on UI for 30+ seconds (no flickering)

**Post-Deployment Verification:**
1. Check live dashboard shows direction (LONG/SHORT)
2. Verify multi-timeframe alignment displays all 5 timeframes
3. Check entry checklist matches signal (3-4/7 criteria, tier=B)
4. Confirm Telegram alerts received within 2 seconds
5. Monitor signal stability (should not flicker)

---

## Prevention & Monitoring

**To Prevent Recurrence:**
- Add unit tests for buildEntryDecision score vs signal.score agreement
- Log both scores in entry decision for debugging
- Add assertion: `assert(signal.score === entryDecision.finalScore, "Score mismatch")`
- Monitor: Watch for "score=1.0" in production logs (indicates recalculation bug)

**Monitoring Queries:**
```
// Alert if buildEntryDecision score differs from signal score
if (entryDecision.score !== signal.score) {
  console.error("[ALERT] Score mismatch:", { signal: signal.score, entry: entryDecision.score })
}

// Alert if valid signal rejected
if (signal.tier === "B" && entryDecision.approved === false) {
  console.warn("[ALERT] B-tier signal rejected:", signal)
}
```

---

## Summary

| Issue | Root Cause | Status | Priority | Fix |
|-------|-----------|--------|----------|-----|
| Market Regime | direction=null | Code fixed | 5 | Verify signal.direction flows |
| MTF Alignment | Missing field | Code fixed | 3 | Verify timeframeAlignment maps |
| StochRSI ERROR | Null handling | Code fixed | 4 | Verify indicator data flows |
| Score Mismatch | Recalculation | **BUG FOUND** | 1 | Use signal.score, not recalc |
| No Alerts | Blocked by score | Blocked | 2 | Fix score issue first |
| Flickering | Score oscillation | Blocked | 2 | Fix score issue first |

**Critical Fix:** buildEntryDecision MUST use signal.score instead of recalculating. This single change unblocks all other issues.
