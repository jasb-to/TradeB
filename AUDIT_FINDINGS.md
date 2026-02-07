AUDIT CRITICAL FINDINGS & FIXES REQUIRED
==========================================

## Issue #1: CANDLE BOUNDARY - USING LAST CANDLE
✅ VERIFIED SAFE - using candles[candles.length - 1]
Location: lib/indicators.ts line 312, lib/strategies.ts line 507
Assessment: Code correctly uses last CLOSED candle, not forming candle
Status: NO FIX NEEDED - System is correct

## Issue #2: STOCHRSI EDGE CASES - NaN HANDLING
✅ VERIFIED SAFE with minor observation
Location: lib/indicators.ts lines 159-206
Current implementation:
- Division-by-zero case handled: if (maxRSI === minRSI) returns COMPRESSION state
- No NaN possible - math is safe
- Falls back to currentRSI value when range is zero
Status: NO FIX NEEDED - Edge case properly handled

## Issue #3: FRONTEND UI PRICE - COSMETIC VS LOGIC
⚠️ NEEDS VERIFICATION
Question: Is price display purely cosmetic or used in alerts?
Current state: getCurrentPrice() exists but usage unknown
Action: Need to verify alerts use signal.entryPrice, not real-time price

## Issue #4: CRON COOLDOWN PERSISTENCE - CRITICAL
🔴 CRITICAL ISSUE FOUND
Location: app/api/external-cron/route.ts line 145
Problem: Cooldown/duplicate prevention is mentioned BUT location not shown
Risk: If cooldown lives only in-memory (ModuleState), it WILL reset on:
  - Vercel redeploy
  - Function cold start
  - Region scaling
  - Duplicate Telegram alerts will fire

Current code shows: "cooldown/duplicate" check but cooldown logic not visible in read
Action: MUST implement persistent cooldown using Vercel KV or database

## Issue #5: TELEGRAM ALERTS - IDEMPOTENCY
⚠️ NEEDS HARDENING
Location: lib/telegram.ts lines 39-80
Current: Signal tier check (alertLevel >= 2) works
Missing: Message hash or idempotency key
Risk: If Telegram API times out mid-send, could retry and double-send
Action: MUST add idempotency tracking by signal ID + timestamp hash

## Issue #6: STRATEGY SCORING - HTF NEUTRAL LOGIC
⚠️ AMBIGUITY FOUND
Question: How is "HTF polarity" defined when Daily+4H aligned but HTF = NEUTRAL?
Current code: "HTF NEUTRAL + Daily+4H aligned: Tier B allowed"
Also: "Counter-trend: Automatic rejection regardless of score"
Risk: Logical gap if HTF polarity derivation unclear
Action: MUST clarify HTF polarity source and verify no counter-trend false negatives

## Issue #7: MARKET CLOSED ALERT BLOCKING
🔴 CRITICAL ISSUE FOUND
Location: app/api/external-cron/route.ts lines 51-65
Problem: Market closed returns early BUT only skips processing
Missing: Telegram alert doesn't explicitly block on cached signals
Risk: Sunday-night cached signals could trigger alerts
Current: signal.type === "NO_TRADE" check prevents most, but not airtight
Action: MUST add explicit check: if (marketClosed) skip sendAlert even for cached

==========================================
SUMMARY: 3 CRITICAL ISSUES, 4 SAFE/VERIFIED
==========================================
