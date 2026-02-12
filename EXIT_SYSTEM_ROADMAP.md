# EXIT SYSTEM IMPLEMENTATION ROADMAP
**Priority:** BLOCKING - Must complete before production deployment  
**Effort Estimate:** 7-10 hours  
**Timeline:** 2-3 weeks

---

## CURRENT STATE vs. REQUIRED STATE

### Current (Entry-Only)
```
Signal Generation
       ↓
    Entry Alert
       ↓
   [STOPS HERE - USER MANAGES EXIT MANUALLY]
```

### Required (Full Trading)
```
Signal Generation
       ↓
    Entry Alert
       ↓
  Record Trade (Active Trade Table)
       ↓
  Monitor Exit Conditions:
  ├─ TP1 Hit?  → Send Exit Alert
  ├─ TP2 Hit?  → Send Exit Alert
  ├─ SL Hit?   → Send Exit Alert
  └─ Direction Changed? → Send Alert
       ↓
  Close Trade (Update Active Trade Table)
       ↓
  Calculate P&L
```

---

## PHASE 1: ACTIVE TRADE TRACKING (MUST HAVE)

### 1.1 Database Schema

**Option A: Redis (Recommended for Speed)**
```
Key: `trade:${symbol}:${entryTime}`
Value: {
  tradeId: "xau-20260212-091600",
  symbol: "XAU_USD",
  direction: "LONG",
  entryPrice: 5092.02,
  entryTime: 1739345760000,
  entryAlertId: "msg_123456",
  
  stopLoss: 5084.54,
  takeProfit1: 5099.50,
  takeProfit2: 5107.00,
  
  status: "ACTIVE",  // or "CLOSED_TP1", "CLOSED_TP2", "CLOSED_SL"
  exitPrice: null,
  exitTime: null,
  exitReason: null,
  
  pnl: null,
  pnlPips: null,
  winRate: null
}
```

**Option B: PostgreSQL (If persistent storage needed)**
```sql
CREATE TABLE active_trades (
  id SERIAL PRIMARY KEY,
  trade_id VARCHAR(50) UNIQUE NOT NULL,
  symbol VARCHAR(20) NOT NULL,
  direction VARCHAR(10) NOT NULL,
  entry_price DECIMAL(10,2),
  entry_time TIMESTAMP,
  entry_alert_id VARCHAR(100),
  
  stop_loss DECIMAL(10,2),
  take_profit_1 DECIMAL(10,2),
  take_profit_2 DECIMAL(10,2),
  
  status VARCHAR(20),  -- ACTIVE, CLOSED_TP1, CLOSED_TP2, CLOSED_SL
  exit_price DECIMAL(10,2),
  exit_time TIMESTAMP,
  exit_reason VARCHAR(50),
  
  pnl DECIMAL(10,2),
  pnl_pips DECIMAL(10,2),
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_symbol_status ON active_trades(symbol, status);
CREATE INDEX idx_active_trades ON active_trades(status) WHERE status = 'ACTIVE';
```

### 1.2 New Endpoints

**POST /api/active-trades/new**
```typescript
// Called immediately after entry alert sent
Request:
{
  symbol: "XAU_USD",
  direction: "LONG",
  entryPrice: 5092.02,
  stopLoss: 5084.54,
  takeProfit1: 5099.50,
  takeProfit2: 5107.00,
  tier: "B",
  score: 5.5,
  telegramMessageId: "msg_123456"
}

Response:
{
  success: true,
  tradeId: "xau-20260212-091600",
  status: "ACTIVE"
}
```

**POST /api/active-trades/close**
```typescript
// Called when exit condition met
Request:
{
  tradeId: "xau-20260212-091600",
  exitReason: "TP1_HIT",  // or TP2_HIT, SL_HIT, DIRECTION_CHANGE
  exitPrice: 5099.50,
  exitTime: 1739345900000
}

Response:
{
  success: true,
  tradeId: "xau-20260212-091600",
  status: "CLOSED_TP1",
  pnl: 87.48,
  pnlPips: 7.48
}
```

**GET /api/active-trades**
```typescript
// Get all active trades (for UI display)
Response:
{
  activeTrades: [
    {
      tradeId: "xau-20260212-091600",
      symbol: "XAU_USD",
      direction: "LONG",
      entryPrice: 5092.02,
      currentPrice: 5095.50,
      unrealizedPnL: 35.48,
      status: "ACTIVE",
      target: "TP1 @ 5099.50"
    }
  ]
}
```

### Implementation Effort
**Estimate:** 2-3 hours  
**Files to Create:**
- `lib/active-trades-db.ts` - Database interactions
- `app/api/active-trades/new/route.ts` - New trade recording
- `app/api/active-trades/close/route.ts` - Trade closure
- `app/api/active-trades/list/route.ts` - Display active trades

---

## PHASE 2: EXIT SIGNAL MONITORING (MUST HAVE)

### 2.1 Integration into Cron Flow

**Current /api/cron/ flow:**
```typescript
// Current (INCOMPLETE)
async function handleCron() {
  const signal = await generateSignal()
  if (signal.type === "ENTRY") {
    await sendTelegramAlert(signal)
  }
  return { success: true }
}
```

**Required /api/cron/ flow:**
```typescript
// NEW (COMPLETE)
async function handleCron() {
  // STEP 1: Check for exit conditions on active trades
  const activeTrades = await ActiveTradesDB.getActive()
  
  for (const trade of activeTrades) {
    const currentPrice = await getCurrentPrice(trade.symbol)
    
    // Check TP1
    if (trade.direction === "LONG" && currentPrice >= trade.takeProfit1) {
      await handleExit({
        tradeId: trade.tradeId,
        exitReason: "TP1_HIT",
        exitPrice: trade.takeProfit1
      })
    }
    
    // Check TP2
    if (trade.direction === "LONG" && currentPrice >= trade.takeProfit2) {
      await handleExit({
        tradeId: trade.tradeId,
        exitReason: "TP2_HIT",
        exitPrice: trade.takeProfit2
      })
    }
    
    // Check SL
    if (trade.direction === "LONG" && currentPrice <= trade.stopLoss) {
      await handleExit({
        tradeId: trade.tradeId,
        exitReason: "SL_HIT",
        exitPrice: trade.stopLoss
      })
    }
  }
  
  // STEP 2: Generate new entry signals (current logic)
  const signal = await generateSignal()
  if (signal.type === "ENTRY") {
    await sendTelegramAlert(signal)
    // NEW: Record the trade
    await ActiveTradesDB.create({
      symbol: signal.symbol,
      direction: signal.direction,
      entryPrice: signal.entryPrice,
      // ... other fields
    })
  }
  
  return { success: true }
}
```

### 2.2 Exit Alert Format

**Telegram Exit Alert:**
```
🔴 EXIT ALERT - XAU LONG

Exit Reason: TP1 HIT ✅
Tier: B (Momentum-Aligned)
Entry: $5092.02
Exit: $5099.50
P&L: +$87.48 (+7.48 pips)
Win: ✅ PROFIT

Next Setup Monitoring...
```

### 2.3 Direction Change Detection

**Monitor for trade reversal:**
```typescript
// If user in LONG trade, system generates SHORT signal
if (activeTrade.direction === "LONG" && newSignal.direction === "SHORT") {
  // Send direction change alert
  await sendDirectionChangeAlert({
    symbol: "XAU_USD",
    oldDirection: "LONG",
    newDirection: "SHORT",
    message: "Your LONG trade direction has reversed to SHORT. Close LONG trade to avoid loss."
  })
  
  // Optionally auto-close the trade
  if (userSettings.autoCloseOnDirectionChange) {
    await handleExit({
      tradeId: activeTrade.tradeId,
      exitReason: "DIRECTION_CHANGE",
      exitPrice: currentPrice
    })
  }
}
```

### Implementation Effort
**Estimate:** 4-5 hours  
**Files to Modify:**
- `app/api/cron/route.ts` - Add exit monitoring loop
- `lib/exit-signal-manager.ts` - Use existing logic
- `lib/telegram.ts` - Add exit alert formatting
- `app/api/active-trades/close/route.ts` - Handle closure

---

## PHASE 3: 30-SECOND RETRY LOOP (OPTIONAL)

### 3.1 Option A: External Cron Frequency (Recommended)

**Current:** Cron-jobs.org running every 60 minutes  
**Change to:** Every 30 seconds

**Pros:**
- Simple to implement (just change cron frequency)
- No code changes needed
- Works with existing infrastructure

**Cons:**
- Higher API costs (120 calls/hour vs 24 calls/hour)
- More OANDA API rate limiting risk

**Cost Impact:**
- OANDA: ~$30-50/month extra (1800 additional calls/day)
- Telegram: No change

### 3.2 Option B: Internal Retry Loop (Budget-Friendly)

**Add Node.js setInterval in /api/cron/route.ts:**
```typescript
// Run signal evaluation every 30 seconds internally
setInterval(async () => {
  const signal = await generateSignal()
  
  if (signal.type === "ENTRY") {
    await sendTelegramAlert(signal)
    await ActiveTradesDB.create({...})
  }
  
  // If NO_TRADE, just retry in 30 seconds
}, 30000)  // 30 seconds
```

**Pros:**
- No additional external cron calls
- Lower API costs
- Faster signal generation

**Cons:**
- More server memory usage
- Need to handle server restarts
- Requires process manager (PM2)

### 3.3 Recommendation

**Start with Option A** (increase cron frequency to 30 seconds)
- Simpler
- More reliable
- Easier to maintain
- Cost increase is manageable

**Migrate to Option B later** if budget becomes constraint

---

## IMPLEMENTATION CHECKLIST

### Week 1: Phase 1 (Active Trade Tracking)
- [ ] Choose database: Redis or PostgreSQL
- [ ] Create schema
- [ ] Implement ActiveTradesDB class
- [ ] Create `/api/active-trades/new` endpoint
- [ ] Create `/api/active-trades/close` endpoint
- [ ] Create `/api/active-trades/list` endpoint
- [ ] Test with manual trade entries

### Week 2: Phase 2 (Exit Monitoring)
- [ ] Modify `/api/cron/route.ts` to include exit loop
- [ ] Implement exit condition checking
- [ ] Create exit alert formatting
- [ ] Integrate ExitSignalManager
- [ ] Test TP1/TP2/SL hit detection
- [ ] Test direction change detection

### Week 3: Phase 3 (30-Second Retry)
- [ ] Option A: Increase cron frequency to 30 seconds
- [ ] OR Option B: Add internal setInterval
- [ ] Test signal generation on NO_TRADE
- [ ] Monitor performance metrics

### Week 4: Testing & Deployment
- [ ] End-to-end testing: Entry → TP1 → Exit
- [ ] Paper trading validation
- [ ] Performance testing
- [ ] Production deployment

---

## ESTIMATED COSTS

| Phase | Implementation | OANDA API | Telegram | Total |
|-------|----------------|-----------|----------|-------|
| Phase 1 | 2-3 hrs dev | $0 | $0 | $0 |
| Phase 2 | 4-5 hrs dev | $0 | $0 | $0 |
| Phase 3 | 1-2 hrs dev | +$30-50/mo* | $0 | $30-50/mo |

*Only if you choose Option A (external cron at 30-second intervals)

---

## TESTING STRATEGY

### Manual Testing
```
1. Generate ENTRY signal manually
2. Call POST /api/active-trades/new with trade details
3. Monitor price until TP1 reached
4. Call POST /api/active-trades/close
5. Verify exit alert sent via Telegram
6. Verify P&L calculated correctly
```

### Automated Testing
```
1. Create test data with known price levels
2. Simulate price movements
3. Verify exit triggers correctly
4. Verify alerts sent
5. Verify P&L calculations
```

### Paper Trading
```
1. Run system for 1 week
2. Generate live signals
3. Manually place trades on paper account
4. Verify system calculates exits correctly
5. Compare system exit prices with actual prices
```

---

## DEPLOYMENT SEQUENCE

**Do NOT deploy Phase 1 or 2 to production until:**
- ✅ All 3 phases complete and tested
- ✅ Paper trading successful (1 week)
- ✅ Exit system monitoring correctly
- ✅ Telegram alerts verified

**Why?** If you deploy incomplete exit system, trades will be taken but exits won't work. Better to wait for complete system.

---

## SUCCESS CRITERIA

**System is production-ready when:**
1. ✅ Active trades recorded in database
2. ✅ TP1 hits detected and alerts sent
3. ✅ TP2 hits detected and alerts sent
4. ✅ SL hits detected and alerts sent
5. ✅ Direction changes detected and alerts sent
6. ✅ P&L calculated and displayed
7. ✅ 1 week of paper trading with 90%+ accuracy
8. ✅ All components tested end-to-end

---

## QUESTIONS TO ANSWER BEFORE STARTING

1. **Database:** Redis or PostgreSQL?
2. **Cron frequency:** 30 seconds or 60 minutes?
3. **Auto-close:** Auto-close on direction change or just alert?
4. **TP1/TP2:** Two-tier exit or single TP?
5. **P&L tracking:** Store in database or just for alerts?

---

*Roadmap Created by v0 Implementation Suite*  
*Next: Start with Phase 1 - Active Trade Tracking*
