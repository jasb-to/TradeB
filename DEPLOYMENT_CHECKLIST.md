# Deployment Checklist & System Architecture

## Environment Variables Required

**CRITICAL - Must be set in Vercel Project Settings:**

```
OANDA_ACCOUNT_ID=<your-oanda-account-id>
OANDA_API_KEY=<your-oanda-api-key>
TELEGRAM_BOT_TOKEN=<your-telegram-bot-token>
TELEGRAM_CHAT_ID=<your-telegram-chat-id>
```

If any of these are missing:
- Signal API will return 500 errors
- No market data will be fetched
- Telegram alerts won't send

## Data Persistence & Caching Architecture

### **Three-Layer Caching Strategy:**

#### Layer 1: Backend In-Memory Cache (route.ts)
- **Storage**: `lastValidSignals` object (lines 11-14)
- **Duration**: Server lifetime (resets on redeploy)
- **Use Case**: Fast fallback when market closed

#### Layer 2: SignalCache Class
- **Storage**: In-process LRU cache
- **Duration**: Server lifetime
- **Use Case**: Runtime cache during market hours

#### Layer 3: Frontend localStorage
- **Storage**: Browser localStorage
- **Duration**: Persistent (survives refresh)
- **Payload**: 
  ```json
  {
    "signal": {...},
    "timestamp": 1707307200000,
    "marketClosed": false,
    "marketMessage": "Market open",
    "dataSource": "oanda"
  }
  ```

### **Last Candle Close Retrieval:**

**When Market is Open:**
1. Fetch latest 1h candle (line 64: `last1hCandle`)
2. Extract close, ATR, ADX, StochRSI from last candle
3. Store in `lastCandle` object (lines 182-189)
4. Cache to browser storage immediately

**When Market is Closed:**
1. Return cached signal from `lastValidSignals[symbol]` (lines 101-114)
2. Cached signal includes all last candle data
3. Frontend loads from localStorage on component mount (lines 106-121)

**On API Downtime (503 errors):**
1. Frontend catch block triggers (line 85)
2. Load from localStorage immediately (lines 88-100)
3. Set `marketMessage = "Using cached data (API unavailable)"`
4. Render all UI components with cached signal

## Deployment Verification Steps

### Pre-Deployment
```bash
# 1. Build locally
npm run build

# 2. Verify no errors
# Should see "✓ exported successfully"

# 3. Check for missing imports
npm run lint
```

### Post-Deployment (Vercel)
```
1. ✅ Verify environment variables are set in Project Settings > Environment Variables
2. ✅ Check Function logs for errors:
   - Vercel > Deployments > Function logs
   - Look for "[v0]" prefixed logs
3. ✅ Test API directly:
   - curl https://your-project.vercel.app/api/signal/current?symbol=XAU_USD
   - Should return signal data or 503 with cache message
4. ✅ Test frontend caching:
   - Open app
   - Check browser console for "[v0] Loaded cached signal..."
   - Disconnect network
   - UI should still show cached data
5. ✅ Verify Telegram integration:
   - Click "Test Telegram" button
   - Should receive test message in chat
```

## Common Deployment Issues & Solutions

### Issue: "OANDA_API_KEY is not defined"
- **Cause**: Environment variable not set in Vercel
- **Fix**: 
  1. Go to Vercel > Project Settings > Environment Variables
  2. Add OANDA_API_KEY, OANDA_ACCOUNT_ID
  3. Redeploy (use "Redeploy" button, don't git push)

### Issue: 503 Service Unavailable
- **Cause**: OANDA API unreachable or market closed with no cache
- **Expected During**: Weekends, market holidays, OANDA outages
- **Fix**: App uses cached data automatically
- **Check**: Look for "[v0] Market closed - returning cached signal" in logs

### Issue: No Indicator Cards / MTF Analysis
- **Cause**: Signal object exists but indicators.stochRSI is null
- **Expected**: During early candle formation (first 5-10 minutes of new candle)
- **Fix**: App shows error card temporarily, refreshes when indicators calculate
- **Verify**: Check API response includes `indicators: {...}` object

### Issue: Blank Page / No UI Rendering
- **Cause**: Component render error, not caught
- **Prevention**: `<main>` shell always renders (line 189)
- **Check**: Open browser DevTools > Console for React errors

## Caching Behavior Timeline

```
Friday 5:00 PM ET (Market Close)
├─ Last candle closed
├─ Signal evaluated with final indicators
├─ Stored in lastValidSignals[XAU_USD]
├─ Stored in backend cache
└─ Cached to browser localStorage

Friday 5:00 PM - Sunday 10:59 PM (Market Closed)
├─ API returns 503 "Market Closed"
├─ Frontend loads from localStorage automatically
├─ All UI components render with cached data
├─ Every 60 minutes: API call checks for early market open
└─ Polling interval: 3600000ms (1 hour)

Sunday 11:00 PM (Market Opens)
├─ API fetches new candles from OANDA
├─ Fresh signal evaluated
├─ New data cached
├─ Frontend polling switches to 60s interval
└─ UI updates with live market data

Monday-Friday (Market Open)
├─ Polling every 60 seconds
├─ Signal cached continuously
├─ Last candle always available
└─ Telegram alerts sent on signal changes
```

## Log Monitoring

**Watch for these log patterns:**

✅ **Healthy Logs:**
```
[v0] API Request for XAU_USD - Market Status: { isOpen: true, ... }
[v0] Data loaded: Daily=100, 4H=200, 1H=200, 15M=200, 5M=200 (source: OANDA)
[v0] Market closed - returning cached signal for XAU_USD
[v0] Loaded cached signal from localStorage on mount
[v0] Recovered from API error using cached data
```

⚠️ **Warning Logs (Expected):**
```
[v0] Signal fetch error: Signal API returned error: 503 503
[v0] Market closed and no cached signal available for XAU_USD
[v0] Initial cache load error: SyntaxError: Unexpected token...
```

❌ **Error Logs (Action Required):**
```
Error: Cannot find name 'OANDA_API_KEY'
Error fetching candle data: 401 Unauthorized
Error: fetch failed (ECONNREFUSED)
Parsing ecmascript source code failed
```

## Performance Targets

- **API Response Time**: <2s during market hours, <1s with cache
- **Frontend Cache Load**: <100ms (localStorage read)
- **UI Render Time**: <500ms (all components)
- **Polling Interval**: 60s weekdays, 3600s weekends
- **Storage Size**: ~50KB per cached signal

## Rollback Procedure

If deployment causes issues:

1. Go to Vercel > Deployments
2. Find previous working deployment
3. Click "... > Redeploy"
4. Wait for verification
5. Check logs for success

## Support Resources

- **OANDA API Status**: https://fxlab.oanda.com/
- **Vercel Function Logs**: Project > Deployments > Function Logs
- **GitHub Actions**: Check latest push for build errors
