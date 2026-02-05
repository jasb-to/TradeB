# SILVER RISK HARDENING - COMPLETE IMPLEMENTATION

## Overview
Silver (XAG/USD) operates as a **background-only strategy** with hardened risk controls to prevent overtrading and emotional execution. No UI exposure, Telegram-only alerts.

---

## REQUIREMENT 1: ONE TRADE RULE (MANDATORY)

### Implementation
- **Maximum 1 active trade per direction** (LONG or SHORT)
- **Lock active**: Trades lock the direction from entry alert until TP2 or SL is hit
- **Lock duration**: 24 hours maximum (auto-expires if unresolved)
- **Bias reset required**: Before re-entry, HTF bias must FLIP or become NEUTRAL

### Code Location
- `lib/silver-cache.ts`: `lockDirection()`, `isDirectionLocked()`, `releaseDirectionLock()`, `hasBiasReset()`
- `lib/silver-strategy.ts`: ONE TRADE RULE check before ENTRY signal

### Logging
\`\`\`
[v0] SILVER: Locked LONG trade at $29.45  // Entry alert sent
[v0] SILVER: Released LONG lock - TP2 hit  // Or: - SL hit
[v0] SILVER BLOCKED: LONG already active (ONE TRADE RULE)  // Rejection
\`\`\`

---

## REQUIREMENT 2: SESSION FILTER (MANDATORY)

### Implementation
- **Trading window**: 07:00 UTC – 17:00 UTC (ONLY)
- **Enforcement**: All entry signals rejected outside this window
- **No alerts sent**: Rejected quietly on server logs
- **Message format**: Shows current hour and next session

### Code Location
- `lib/silver-cache.ts`: `isSessionAllowed()`, `getSessionStatus()`
- `lib/silver-strategy.ts`: Session check at evaluation start (fail-fast)
- `app/api/signal/xag/route.ts`: Session validation before alerts

### Logging
\`\`\`
[v0] SILVER NO_TRADE: REJECTED: Outside session (20:00 UTC, next session tomorrow 07:00 UTC)
[v0] SILVER NO_TRADE: REJECTED: Outside session (05:30 UTC, next session 07:00 UTC)
[v0] SILVER: ALLOWED: Inside trading session (12:00 UTC)
\`\`\`

---

## REQUIREMENT 3: NO RE-ENTRIES FOR SAME BIAS

### Implementation
- **One alert per setup period**: No duplicate alerts for same direction
- **Cooldown period**: 1 hour between alerts for the same direction
- **Same setup check**: Uses setup hash to prevent spam

### Code Location
- `lib/silver-cache.ts`: `canSendEntryAlert()` – Cooldown logic
- `lib/silver-notifier.ts`: Entry alert tracking

### Logging
\`\`\`
[v0] SILVER: Entry alert recorded - A+ LONG
[v0] SILVER ENTRY ALERT BLOCKED: Cooldown: 45min until next LONG alert
\`\`\`

---

## REQUIREMENT 4: "GET READY" TELEGRAM ALERT (OPTIONAL, CONTROLLED)

### Trigger Conditions
- **Threshold**: ≥80% of A-tier conditions met (NOT 100%)
- **What's checked**:
  - 40% MTF alignment (Daily+4H or 4H+1H)
  - 30% ADX recovery (ADX ≥ 18)
  - 20% ATR adequate (ATR ≥ 0.25)
  - 10% 1H confirmation (1H ≠ NEUTRAL)

### Alert Content
- Direction (LONG/SHORT)
- Condition percentage
- List of MISSING conditions (e.g., "Waiting for 1H close")
- Session status

### Cooldown
- **30-minute window** between GET READY alerts for same direction
- **Never sends during outside hours** (respects session filter)

### Code Location
- `lib/silver-cache.ts`: `canSendGetReadyAlert()`, `recordGetReadyAlert()`
- `lib/silver-strategy.ts`: Setup condition percentage calculation
- `lib/silver-notifier.ts`: `sendSilverGetReadyAlert()`
- `app/api/signal/xag/route.ts`: GET READY alert dispatch

### Logging
\`\`\`
[v0] SILVER GET_READY: 80% conditions met
[v0] SILVER: Sending GET READY alert
[v0] SILVER: Get-ready alert recorded - LONG setup forming
Get-ready cooldown: 28min for LONG
\`\`\`

---

## REQUIREMENT 5: ENTRY ALERTS (ONLY A OR A+)

### Trigger Conditions
- **Setup tier**: A or A+ ONLY (never sub-A)
- **Direction lock**: No existing active trade in this direction
- **Session**: 07:00–17:00 UTC
- **Cooldown**: 1 hour since last alert for same direction

### Alert Content
- Setup tier (A+ PREMIUM or A SOLID)
- Direction and emoji
- Entry, SL, TP1, TP2 prices
- ADX, ATR, MTF alignment summary
- ONE TRADE RULE reminder

### Code Location
- `lib/silver-cache.ts`: `canSendEntryAlert()`, `recordEntryAlert()`
- `lib/silver-notifier.ts`: `sendSilverAlert()`
- `app/api/signal/xag/route.ts`: Entry alert validation

### Logging
\`\`\`
[v0] SILVER: Entry alert approved
[v0] SILVER: Sending entry alert - all rules passed
[v0] SILVER: Entry alert recorded - A+ LONG
[v0] SILVER ENTRY ALERT BLOCKED: BLOCKED: LONG trade already active (one trade per direction rule)
\`\`\`

---

## REQUIREMENT 6: ISOLATION FROM GOLD

### Implementation
- **Separate state**: `SilverCache` is completely separate from Gold cache
- **Separate notifier**: `SilverNotifier` vs. `TelegramNotifier`
- **Separate strategy**: `SilverStrategy` vs. Gold strategy
- **No shared logic**: Zero cross-contamination
- **No UI**: Silver has zero dashboard components

### Code Locations
- `lib/silver-cache.ts` – Silver state
- `lib/silver-strategy.ts` – Silver logic
- `lib/silver-notifier.ts` – Silver alerts
- `app/api/signal/xag/route.ts` – Silver route (completely isolated)

---

## REQUIREMENT 7: LOGGING (SERVER-SIDE ONLY)

### All Logs Are Server-Side
- **Rejection reasons**: Clearly stated with context
- **Trade locks**: Logged when direction is locked/released
- **Session filters**: Shows why outside-hours entries blocked
- **Alert status**: APPROVED vs BLOCKED reasons

### Example Log Flow
\`\`\`
[v0] SILVER: ADX=19.5 ATR=0.28 Price=28.45
[v0] SILVER BIAS: Daily=LONG 4H=LONG 1H=NEUTRAL 15M=NEUTRAL 5M=NEUTRAL
[v0] SILVER MTF: Daily+4H=true 4H+1H=false Aligned=true Direction=LONG
[v0] SILVER GET_READY: 80% conditions met
[v0] SILVER: GET READY alert approved
[v0] SILVER: Sending GET READY alert
[v0] SILVER A ENTRY: LONG @28.45 SL=28.17 TP1=28.73 RR=1.68:1
[v0] SILVER: Entry alert approved
[v0] SILVER: Sending entry alert - all rules passed
[v0] SILVER: Entry alert recorded - A LONG
[v0] SILVER: Locked LONG trade at $28.45
\`\`\`

---

## TRADE CLOSURE & BIAS RESET

### When TP2 is Hit
- Direction lock is RELEASED
- New entry for same direction is now allowed (after cooldown expires)
- GET READY alerts can resume for opposite direction

### When SL is Hit
- Direction lock REMAINS (test failure)
- **Bias MUST reset** before re-entry allowed
- Reset = HTF bias flips (LONG→SHORT or SHORT→LONG) OR becomes NEUTRAL
- Alert: "🛑 Risk management triggered - Position closed. Bias reset required before next LONG entry"

### Example Scenario
\`\`\`
16:30 UTC: LONG entry alert sent, trade locked
16:45 UTC: Stop loss hit, loss recorded
17:15 UTC: Daily bias flips to SHORT, 4H still LONG = NO re-entry yet
17:45 UTC: 4H flips to SHORT too = Bias reset complete
18:00 UTC: (Outside session, no new entries anyway)
Next morning 07:00 UTC: SHORT setup available, can send alert

OR if outside session:

16:30 UTC: LONG entry alert sent
16:45 UTC: Stop loss hit
17:00 UTC: Session ends (no more alerts until tomorrow 07:00)
\`\`\`

---

## PRODUCTION READINESS CHECKLIST

✅ ONE TRADE RULE: Enforced per direction  
✅ SESSION FILTER: 07:00–17:00 UTC only  
✅ NO RE-ENTRIES: 1 hour cooldown per direction  
✅ GET READY: Optional, controlled 30-min cooldown  
✅ ENTRY ALERTS: A/A+ only, full rule enforcement  
✅ ISOLATION: Complete separation from Gold  
✅ LOGGING: Server-side comprehensive audit trail  
✅ NO UI: Background strategy, Telegram-only  

---

## ALERT EXAMPLES

### GET READY Alert
\`\`\`
📈 SILVER (XAG/USD) - GET READY
═══════════════════════════════════════
Setup Forming: 85% of conditions met

Direction: LONG UP ↑

⏳ WAITING FOR:
  • 1H confirmation

📌 Alert will send when all A-tier conditions met

⏰ Time: 2026-01-21T12:30:00.000Z
═══════════════════════════════════════
\`\`\`

### ENTRY Alert
\`\`\`
📈 SILVER (XAG/USD) - A SOLID SETUP
═══════════════════════════════════════
Setup Tier: ⭐ A SOLID
Multi-Timeframe: 4H+1H LONG

Direction: LONG UP ↑
Confidence: 85%
Strategy: Breakout + MTF Alignment

📊 TRADE LEVELS:
Entry: $29.45
Stop Loss: $29.17
TP1 (EXIT TARGET): $29.73
TP2 (Reference): $30.01

⚠️ Risk:Reward: 1.68:1

📌 AGGRESSIVE EXIT: Full position closes at TP1
   No scaling, no hesitation - quick profit capture

🚫 ONE TRADE RULE ENFORCED:
   Only 1 active LONG trade allowed

⏰ Time: 2026-01-21T12:35:00.000Z
═══════════════════════════════════════
\`\`\`

### Stop Loss Alert
\`\`\`
🛑 SILVER (XAG/USD) STOP LOSS HIT
═══════════════════════════
Direction: LONG

📊 Trade Summary:
Entry: $29.45
Stop Loss: $29.17
Exit: $29.16

📉 Loss: -0.99% (-$0.29)
Setup: A LONG Setup

🛑 Risk management triggered - Position closed
⏳ Bias reset required before next LONG entry

⏰ Time: 2026-01-21T12:42:00.000Z
═══════════════════════════
\`\`\`
