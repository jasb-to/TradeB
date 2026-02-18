# Trading Dashboard - Comprehensive Testing & Deployment Checklist

## Pre-Deployment Verification (v8.1.0)

### Code Review Checklist
- [x] Signal score preservation implemented (lib/strategies.ts lines 824-834)
- [x] Tier assignment uses signalScore instead of recalculation
- [x] Version bumped to 8.1.0 in frontend (app/page.tsx)
- [x] Version bumped to 8.1.0 in API (app/api/signal/current/route.ts)
- [x] buildEntryDecision logging updated to show signal score usage
- [x] Tier thresholds updated (signalScore >= 3 → B, >= 4 → A, >= 5 → A+)
- [x] No regression in entry decision gating logic (criteria still evaluated, just not recalculated)

### Dependencies & Imports
- [x] No new imports added (all existing)
- [x] All signal and entry decision types intact
- [x] No breaking changes to function signatures

## Post-Deployment Verification (Live Testing)

### Step 1: Verify API Signal Evaluation
**Test:** Call `/api/signal/current?symbol=XAU_USD` and check response

**Expected Output:**
```json
{
  "type": "ENTRY",
  "direction": "DOWN",
  "score": 4,
  "tier": "B",
  "indicators": {...},
  "mtfBias": {...},
  "timeframeAlignment": {...}
}
```

**Verification Points:**
- [ ] score is 3-5 (from strict evaluation), not 1-2
- [ ] direction is DOWN or UP (not null or NONE)
- [ ] tier is B or A (not NO_TRADE)
- [ ] mtfBias object populated with Daily/4H/1H values
- [ ] timeframeAlignment maps to mtfBias values
- [ ] Response time < 2 seconds

---

### Step 2: Dashboard UI Display Verification

**Check #1 - Entry Checklist**
- [ ] Score shows 6.0/9 (not 1.0/9)
- [ ] Tier shows B (not NO_TRADE)
- [ ] Criteria count shows 3-4/7 (matching actual)
- [ ] Green checkmarks appear for matching criteria

**Check #2 - Market Regime**
- [ ] Shows "📉 SHORT" or "📈 LONG" (not "TREND")
- [ ] Matches signal.direction value
- [ ] Updates within 30 seconds of new signal

**Check #3 - Multi-Timeframe Alignment**
- [ ] DAILY shows: LONG or SHORT (not blank)
- [ ] 4H shows: LONG or SHORT or NEUTRAL (not blank)
- [ ] 1H shows: LONG or SHORT or NEUTRAL (not blank)
- [ ] 15M shows: LONG or SHORT or NEUTRAL (not blank)
- [ ] 5M shows: LONG or SHORT or NEUTRAL (not blank)
- [ ] All timeframes match signal.mtfBias values

**Check #4 - Stochastic RSI**
- [ ] Shows numeric value (e.g., 45.2) OR "No data"
- [ ] Does NOT show "ERROR DATA ERROR"
- [ ] Value updates with new candles (max 5 min delay)

**Check #5 - Trade Levels Display**
- [ ] Entry price shown (e.g., $4985.01)
- [ ] Stop Loss shown in red (e.g., $5064.22)
- [ ] TP1 shown in green (e.g., $4905.79)
- [ ] TP2 shown in green (e.g., $4852.99)
- [ ] Risk % shown (e.g., 1.59%)

**Check #6 - Signal Card Behavior**
- [ ] Signal card appears when trade signals (Entry ✓)
- [ ] Card DOES NOT flicker (stays on screen)
- [ ] Card remains for 30+ seconds
- [ ] Card only disappears on manual close or browser refresh

---

### Step 3: Alert Dispatch Verification

**Telegram Alert Test:**
1. [ ] Open Telegram chat with bot
2. [ ] Trigger signal: `/api/signal/current?symbol=XAU_USD`
3. [ ] Wait 1-2 seconds
4. [ ] Check Telegram receives message:
   - "🎯 ENTRY SIGNAL: SHORT | XAU/USD | Tier: B"
   - Entry Price: $XXXX.XX
   - Stop Loss: $XXXX.XX
   - TP 1: $XXXX.XX
   - TP 2: $XXXX.XX

**Alert Requirements:**
- [ ] Message received within 2 seconds of API call
- [ ] All price levels correct
- [ ] Tier correctly shows "B" (not "NO_TRADE")
- [ ] Direction correctly shows "SHORT" or "LONG"

**If Alert Not Received:**
- [ ] Check debug logs for "ALERT SKIPPED" reason
- [ ] Should NOT see "Entry decision not approved"
- [ ] Should see "Telegram sent successfully"

---

### Step 4: Data Flow Verification

**Check Debug Logs For:**
```
[v0] buildEntryDecision USING_SIGNAL_SCORE: signalScore=4/6 → displayScore=6.0/9 → tier=B
```

**Should NOT see:**
```
[v0] buildEntryDecision SCORE-BASED TIER: score=1.0 → tier=NO_TRADE
[v0] ENTRY DECISION: ✗ REJECTED | Tier NO_TRADE | Score 1.0/9
[v0] ALERT SKIPPED reason=Entry decision not approved
```

---

### Step 5: System Version Verification

**Check Page Shows:**
- [ ] Footer displays "System: 8.1.0-CRITICAL-SCORE-FIX"
- [ ] "Production-Ready XAU/USD Strategy Execution" displayed
- [ ] No error messages in browser console

---

## Regression Testing

### Previous Issues Should Be Resolved

| Issue | Before | After | Verified |
|-------|--------|-------|----------|
| Market Regime TREND | Shows TREND | Shows SHORT/LONG | [ ] |
| MTF Alignment Blank | 4H/1H/15M/5M blank | All populated | [ ] |
| StochRSI ERROR | Displays ERROR | Shows value or No data | [ ] |
| Score Mismatch | 1.0/9 | 6.0/9 (for score=4) | [ ] |
| No Alerts | Skipped | Sent to Telegram | [ ] |
| Signal Flickering | Flashes on/off | Stable 30+ sec | [ ] |
| Tier Wrong | NO_TRADE | B (correct) | [ ] |
| Direction Null | Shows TREND | Shows SHORT/LONG | [ ] |

---

## Rollback Plan (If Issues Found)

**If signal score shows incorrect values:**
1. Revert to v8.0.0: `git revert HEAD`
2. Redeploy from tag v8.0.0
3. Verify system reverts to previous state
4. Post-mortem: Analyze why score fix failed

**Critical Indicators to Watch:**
- Any score showing as 1.0 (indicates regression)
- Any tier showing NO_TRADE with active trade setup (indicates bug)
- Any "Entry decision not approved" in logs (indicates rejection logic broken)

---

## Performance Metrics

**Expected Response Times:**
- API signal evaluation: 100-300ms
- Alert dispatch: 500-1000ms
- UI update: <100ms
- Dashboard load: <2 seconds

**Alert to Dashboard Lag:**
- Alert sent at T+0
- Dashboard updated by T+1 second
- Maximum acceptable: T+5 seconds

---

## Monitoring & Alerts

### Production Monitoring Setup
```typescript
// Alert if score mismatch detected
if (signalScore !== entryDecision.score) {
  sendAlert("CRITICAL: Score mismatch detected")
}

// Alert if valid signal rejected
if (signal.tier === "B" && entryDecision.approved === false) {
  sendAlert("WARNING: B-tier signal rejected unexpectedly")
}

// Alert if old score recalculation detected
if (buildEntryDecisionScore === 1.0 && signal.score > 3) {
  sendAlert("CRITICAL: Old score recalculation detected - REVERT")
}
```

### Dashboard Health Checks
- [ ] Automated check every 5 minutes: API signal evaluation
- [ ] Automated check every 30 seconds: UI displays correct data
- [ ] Automated alert test: Every hour send test Telegram
- [ ] Manual review: Check debug logs for anomalies

---

## Sign-Off

- [ ] All pre-deployment checks completed
- [ ] All post-deployment checks completed  
- [ ] No regressions detected
- [ ] All 7 issues resolved
- [ ] Ready for production monitoring
- [ ] Rollback plan documented

**Approved by:** [Team Lead]  
**Deployment Date:** 2026-02-18  
**Version:** 8.1.0-CRITICAL-SCORE-FIX  
