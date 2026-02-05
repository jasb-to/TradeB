HARDENED TRADING SYSTEM - CAPITAL PRESERVATION RULES
════════════════════════════════════════════════════

OVERVIEW
The system now enforces a STRICT state machine that prevents:
✗ Multiple entries from the same setup
✗ Re-entries after stop-loss hits
✗ Stacked trades from repeated alerts
✗ Alerts when a trade is already active

TRADE STATE MACHINE (Per Symbol)
════════════════════════════════

States:
  IDLE       → No trade active, ready for new ENTRY
  IN_TRADE   → Trade is active, NO NEW ENTRIES ALLOWED
  COOLDOWN   → Trade was stopped out, waiting for cooldown to expire

State Transitions:
  IDLE → IN_TRADE      (when ENTRY alert fires and is sent)
  IN_TRADE → COOLDOWN  (when SL is hit - trade lost)
  IN_TRADE → IDLE      (when TP2 hit or manual exit - trade won)
  COOLDOWN → IDLE      (after cooldown duration expires)

COOLDOWN DURATIONS (After Stop Loss Hit)
════════════════════════════════════════
  Gold (XAU_USD):   90 minutes
  Silver (XAG_USD): 60 minutes

During cooldown: NO alerts sent, NO re-entries allowed.

ENTRY WINDOW VALIDITY
════════════════════════════════════════
Each ENTRY alert is valid for a LIMITED time:
  Gold (XAU_USD):   15 minutes
  Silver (XAG_USD): 20 minutes

After expiry: Setup is marked EXPIRED and cannot be alerted on again.
Requires full fresh HTF alignment to create a new valid setup.

SETUP HASH BLACKLISTING
════════════════════════════════════════
Setup Hash = Function of:
  • Symbol (XAU_USD vs XAG_USD)
  • Direction (LONG or SHORT)
  • Strategy (entry type)
  • Entry zone (rounded to $10)
  • HTF alignment (Daily/4H/1H biases)

Rules:
  1. If a setup has EVER fired an alert → Never alert on same setup twice
  2. If a setup resulted in a LOSS → BLACKLIST that setup forever
  3. Same hash within 90min (Gold) or 60min (Silver) → BLOCKED

This prevents:
  • Late entries on stale setups
  • "Trying again" behavior after losses
  • Multiple Telegram alerts for same idea

NO RE-ENTRY WITHOUT NEW HTF ALIGNMENT
════════════════════════════════════════
Even after cooldown expires:
  • A new trade is ONLY allowed if:
    - Daily OR 4H candle has changed since last trade
    - AND MTF score is recalculated from scratch
    - AND new setup hash is different from blacklist

If timeframe candles haven't rolled → BLOCK ENTRY.

ALERT BLOCKING RULES (System Level)
════════════════════════════════════════
Alert is BLOCKED if ANY of these are true:

1. State = IN_TRADE
   └─ Reason: Trade already active for this symbol

2. State = COOLDOWN
   └─ Reason: Cooldown active (X minutes remaining)

3. Same setupHash already alerted
   └─ Reason: Setup already triggered alert in past

4. setupHash in failedSetupHashes
   └─ Reason: This setup previously resulted in a loss

5. Entry window expired
   └─ Reason: Setup is stale (15-20 min validity passed)

6. Signal type not ENTRY or alertLevel < 2
   └─ Reason: Only high-confidence entries allowed

TELEGRAM ALERT CONTENT
════════════════════════════════════════
Every ENTRY alert now explicitly shows:

  🚫 ONE-TRADE-ONLY SETUP
    • NO scaling in
    • NO re-entries after stop loss
    • Only 1 active trade allowed

  ⛔ NO RE-ENTRY IF STOPPED
    Hard Cooldown: 90min (Gold) / 60min (Silver)

  Entry Valid Until: [UTC Timestamp]
  After expiry: Setup automatically invalidated

IMPLEMENTATION FLOW
════════════════════════════════════════

1. Signal Generated
   ↓ (evaluateSignals in strategies.ts)

2. Check State Machine
   ↓ (canAlertSetup in signal-cache.ts)
   ↓ If BLOCKED → Log reason, don't send alert
   ↓ If ALLOWED → Continue

3. Send Telegram Alert
   ↓ (TelegramNotifier.sendSignalAlert)
   ↓ Alert includes expiry time & cooldown rules

4. Record Alert Sent
   ↓ (recordAlertSent)
   ↓ Update lastAlertedSetupHash
   ↓ Set state to IN_TRADE

5. Trade Plays Out
   ↓ (ActiveTradeTracker monitors TP/SL)
   ↓ SL Hit → Trade closes with LOSS
   ↓ TP2 Hit → Trade closes with WIN

6. Report Result
   ↓ (POST /api/trade/result)
   ↓ If LOSS → recordLoss + activate COOLDOWN
   ↓ If WIN → recordWin + return to IDLE

GOLD-SPECIFIC SAFETY FILTER
════════════════════════════════════════
For XAUUSD ONLY, block ENTRY alerts if ANY:
  • Current Daily ATR > 80% of 20-day average
    └─ Gold is too volatile to trade safely
  • Entry occurs after NY session high already printed
    └─ Avoid late-momentum entries
  • ADX is falling while price is extending
    └─ Momentum divergence = weakening trend

SYSTEM GUARANTEES
════════════════════════════════════════
✓ ONE trade per symbol at a time (no stacking)
✓ NO alerts during IN_TRADE or COOLDOWN states
✓ NO re-entry without fresh HTF alignment
✓ NO stale setups (15-20 min validity window)
✓ NO blacklisted setups (permanent after loss)
✓ 90/60 minute hard cooldown after stop loss
✓ Explicit rules in every Telegram alert

CAPITAL PRESERVATION PRIORITIES
════════════════════════════════════════
1. Safety > Frequency
   → Fewer trades, better discipline
   → Block everything when in doubt

2. One Setup = One Trade
   → No "retrying" the same idea
   → No scaling in/adding to losers
   → No pyramid schemes

3. Loss Prevention
   → Blacklist losing setups permanently
   → Force full HTF candle refresh to retry
   → Hard cooldowns prevent desperation trading

4. Discipline Enforcement
   → Rules are SYSTEM-enforced, not user-discretion
   → User cannot override state machine
   → All decisions logged with reasons

EXAMPLE SCENARIOS
════════════════════════════════════════

Scenario 1: Multiple Entries Same Setup
  Trade 1: XAU LONG @ 4867.26 (Alert sent, state=IN_TRADE)
  Trade 2: XAU LONG @ 4856.05 (Same setup, different price)
  ✓ BLOCKED: "Same setup already alerted"

Scenario 2: Re-entry After Stop Loss
  Trade 1: XAU LONG, SL hit @ 4835.64 (state=COOLDOWN for 90min)
  Wait 5 minutes
  Trade 2: XAU LONG signal fires again
  ✓ BLOCKED: "Cooldown active (85 minutes remaining)"

Scenario 3: Entry Window Expiry
  Trade 1: ENTRY alert sent @ 14:30 UTC (valid until 14:45)
  Wait 20 minutes
  Trade 2: Same setup signal still generating
  ✓ BLOCKED: "Entry window expired"

Scenario 4: Blacklisted Setup (Previous Loss)
  Trade 1: XAU LONG setupHash=ABC123, SL hit (LOSS)
  ↓ setupHash ABC123 added to failedSetupHashes
  Trade 2: Same HTF alignment, same setupHash=ABC123
  ✓ BLOCKED: "This setup previously resulted in a loss"

Scenario 5: Win Clears State (Allowed Retry)
  Trade 1: XAU LONG, TP2 hit (WIN, state=IDLE)
  Wait 5 minutes
  Trade 2: New XAU LONG signal (Daily candle rolled, new setup)
  ✓ ALLOWED: "All conditions met"

MONITORING & DEBUGGING
════════════════════════════════════════
All decisions logged with full context:
  [v0] XAU Alert Check: BLOCKED - Cooldown active (87 minutes remaining)
  [v0] XAU Alert Check: APPROVED - All conditions met
  [v0] XAU → IN_TRADE | Entry window valid for 15min
  [v0] XAU → COOLDOWN (90min) | Reason: Stop loss hit
  [v0] Loss recorded - blacklisting setupHash ABC123

Check logs in /api/cron or API responses for full audit trail.

════════════════════════════════════════
CAPITAL PRESERVATION IS THE ONLY GOAL.
If in doubt: DO NOTHING.
════════════════════════════════════════
