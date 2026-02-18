# TRADE PERSISTENCE SOLUTION - v9.1.0

## Problem Statement

**Issue:** Signal card displays "NO TRADE" despite trade briefly appearing then disappearing (flickering)

**Root Cause:** Trade persistence attempted but failed due to missing Vercel KV environment variables:
```
Error: @vercel/kv: Missing required environment variables KV_REST_API_URL and KV_REST_API_TOKEN
```

**Impact:**
- Trade created successfully
- UI displays trade momentarily
- Trade lost immediately (not persisted)
- Fresh evaluation returns NO_TRADE
- Signal card flickers between ENTRY and NO_TRADE

---

## Solution Architecture

### **Two-Tier Persistence System**

```
                    ┌─────────────────────┐
                    │  Signal Evaluation  │
                    │   (Strict v7.3)     │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │ entryDecision.allow │
                    │      = true?        │
                    └──────────┬──────────┘
                               │ YES
                    ┌──────────▼──────────┐
                    │  Create Trade       │
                    │  Persistence        │
                    └──────────┬──────────┘
                               │
            ┌──────────────────┴──────────────────┐
            │                                     │
     ┌──────▼──────┐                      ┌─────▼──────┐
     │ Vercel KV   │                      │  In-Memory │
     │  (Primary)  │                      │ (Fallback) │
     └──────┬──────┘                      └─────┬──────┘
            │ KV configured?                    │ KV not configured
            │ ✓ Production                      │ ✓ Preview/Local
            └──────────────────┬──────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │  Trade Persisted    │
                    │   (Active State)    │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │  Fresh Evaluation   │
                    │  (Every 30 seconds) │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │ Check Active Trade? │
                    └──────────┬──────────┘
                               │ YES
                    ┌──────────▼──────────┐
                    │  Override Signal    │
                    │   type = ENTRY      │
                    │  (Keep displaying)  │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │   Monitor TP/SL     │
                    │  (Every 1 minute)   │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │  Close Trade When   │
                    │   TP or SL Hit      │
                    └─────────────────────┘
```

---

## Implementation Details

### **1. In-Memory Persistence (`lib/in-memory-trades.ts`)**

```typescript
// Stores trades in Node.js process memory
// Persists for lifetime of server process
// Sufficient for preview/testing environments

const activeTrades = new Map<string, Trade>()

InMemoryTrades.createTrade(symbol, direction, entry, sl, tp1, tp2, tier)
InMemoryTrades.getActiveTrade(symbol)
InMemoryTrades.closeTrade(symbol, status, currentPrice)
InMemoryTrades.checkTradeExit(symbol, currentPrice)
```

**Advantages:**
- Zero configuration required
- Works in preview and local environments
- No external dependencies
- Fast read/write operations

**Limitations:**
- Lost on server restart (acceptable for preview)
- Not shared across multiple server instances
- Memory limited to server process

---

### **2. Signal Route Trade Override (`app/api/signal/current/route.ts`)**

**Flow:**

```typescript
// 1. Fresh evaluation runs
const signal = await strategies.evaluateSignals(...)

// 2. Entry decision evaluated
const entryDecision = strategies.buildEntryDecision(signal)

// 3. If approved, create trade
if (entryDecision.allowed && signal.type === "ENTRY") {
  try {
    await createTrade(...) // Vercel KV
  } catch (kvError) {
    await InMemoryTrades.createTrade(...) // Fallback
  }
}

// 4. CHECK ACTIVE TRADE - Override signal if trade exists
const activeTrade = await InMemoryTrades.getActiveTrade(symbol)
if (activeTrade) {
  signal.type = "ENTRY"
  signal.direction = activeTrade.direction
  signal.entryPrice = activeTrade.entry
  // ... override all trade fields
}

// 5. Return signal (shows active trade even if fresh eval is NO_TRADE)
return NextResponse.json(signal)
```

---

### **3. Trade Monitoring (`app/api/monitor-active-trades/route.ts`)**

**Purpose:** Check active trades every minute and close when TP/SL is hit

```typescript
GET /api/monitor-active-trades

// For each active trade:
1. Fetch current price from OANDA
2. Check if TP1, TP2, or SL hit
3. Close trade if target reached
4. Update trade status (TP1_HIT, TP2_HIT, SL_HIT)
```

**Monitoring Logic:**

```typescript
// BUY trades
if (currentPrice >= tp2) → CLOSE (TP2_HIT)
else if (currentPrice >= tp1) → UPDATE (TP1_HIT, half position closed)
else if (currentPrice <= sl) → CLOSE (SL_HIT)

// SELL trades
if (currentPrice <= tp2) → CLOSE (TP2_HIT)
else if (currentPrice <= tp1) → UPDATE (TP1_HIT, half position closed)
else if (currentPrice >= sl) → CLOSE (SL_HIT)
```

---

## Testing Procedures

### **Local Testing**

1. **Verify In-Memory Persistence:**
   ```bash
   # Check system status
   curl http://localhost:3000/api/system/status
   
   # Should show: persistence: "in-memory"
   ```

2. **Create Test Trade:**
   - Wait for signal with score ≥ 3
   - Verify trade appears in UI
   - Refresh page multiple times
   - **Expected:** Trade persists across refreshes

3. **Monitor Trade Lifecycle:**
   ```bash
   # Manually trigger monitoring
   curl http://localhost:3000/api/monitor-active-trades
   
   # Check active trades
   curl http://localhost:3000/api/system/status
   ```

4. **Verify Persistence Duration:**
   - Keep page open for 5-10 minutes
   - Refresh periodically
   - **Expected:** Trade remains until TP/SL hit

---

### **Production Testing (with Vercel KV)**

1. **Configure Vercel KV:**
   ```bash
   # Vercel Dashboard → Storage → Create KV Database
   # Environment variables auto-added:
   # - KV_REST_API_URL
   # - KV_REST_API_TOKEN
   ```

2. **Verify KV Persistence:**
   ```bash
   curl https://your-domain.vercel.app/api/system/status
   
   # Should show: persistence: "vercel-kv"
   ```

3. **Test Multi-Instance Persistence:**
   - Open multiple browser tabs
   - All tabs show same active trade
   - **Expected:** KV shared across all instances

---

## Diagnostic Logging

### **Key Log Messages:**

```
[TRADE_PERSIST] Vercel KV not configured, using in-memory fallback
[TRADE_PERSIST] In-Memory: Trade persisted - XAU_USD LONG B

[TRADE_OVERRIDE] Active trade found: XAU_USD BUY B @ 4985.01
[TRADE_OVERRIDE] Signal overridden to show active trade - type=ENTRY tier=B

[TRADE_MONITOR] Found 1 active trades
[TRADE_MONITOR] XAU_USD: current=4992.50 entry=4985.01 sl=4974.34 tp1=4991.79 tp2=4999.79
[IN_MEMORY_TRADE] Closed: XAU_USD TP1_HIT @ 4991.79 | Active=0
```

### **Debug Flow:**

1. **Signal flickering?**
   - Check: `[TRADE_PERSIST]` - Was trade persisted?
   - Check: `[TRADE_OVERRIDE]` - Is override working?

2. **Trade not showing?**
   - Check: `entryDecision.allowed` - Was entry approved?
   - Check: `[CONSISTENCY_CHECK]` - Was type enforced?

3. **Trade not closing?**
   - Check: `/api/monitor-active-trades` - Is monitoring running?
   - Check: `[IN_MEMORY_TRADE] Closed:` - Did closure trigger?

---

## Performance Considerations

### **Memory Usage:**

```typescript
// Each trade: ~500 bytes
// 100 active trades: ~50 KB
// 1000 trade history: ~500 KB
// Total: < 1 MB (negligible)
```

### **Query Performance:**

```typescript
// In-Memory operations:
activeTrades.get(symbol)     // O(1) - instant
activeTrades.set(symbol, trade) // O(1) - instant

// Vercel KV operations:
kv.get(key)  // ~10-50ms (network latency)
kv.set(key, value) // ~10-50ms
```

---

## Migration Path

### **Phase 1: Preview (Current)**
- In-memory persistence active
- Sufficient for development and testing
- Zero configuration required

### **Phase 2: Production (Future)**
- Add Vercel KV environment variables
- System automatically switches to KV
- No code changes required
- In-memory remains as fallback

---

## Known Limitations & Solutions

| Limitation | Impact | Solution |
|------------|--------|----------|
| In-memory lost on restart | Trades disappear after deploy | Use Vercel KV in production |
| Not shared across instances | Edge deployment issues | Use Vercel KV (shared storage) |
| No persistence guarantee | Preview restarts lose state | Acceptable for preview environment |
| History limited to 100 | Old trades not accessible | Vercel KV stores unlimited history |

---

## API Endpoints

### **GET /api/system/status**
Returns system health and active trade count

### **GET /api/monitor-active-trades**
Monitors and closes trades when TP/SL hit (cron job)

### **GET /api/signal/current?symbol=XAU_USD**
Returns signal with active trade override if exists

---

## Success Criteria

✅ **Trade Persistence:** Once ENTRY signal approved, trade persists across page refreshes  
✅ **No Flickering:** Signal card shows consistent ENTRY state until TP/SL hit  
✅ **Automatic Closure:** Trade closes when TP or SL reached  
✅ **Fallback Works:** In-memory persistence functions without Vercel KV  
✅ **Production Ready:** System ready for Vercel KV when configured  

---

**Status:** COMPLETE - v9.1.0-TRADE-PERSISTENCE deployed and operational
