# System Architecture & Data Flow Diagram

## High-Level Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                        TRADING DASHBOARD                    │
│                      (app/page.tsx)                         │
└─────────────┬───────────────────────────────────────────────┘
              │
              ├─► Check localStorage for cached signal
              │   (lastValidSignalXAU)
              │
              ├─► Call fetchSignals()
              │
              └─► Set state: signal, marketClosed, dataSource
                  │
                  ├─► Render <main> UI shell
                  │   ├─ Header with Refresh/Test Telegram buttons
                  │   ├─ Market Status banner (if closed)
                  │   ├─ Synthetic Data warning (if using generated data)
                  │   └─ Content Grid:
                  │       ├─ GoldPriceDisplay
                  │       ├─ GoldSignalPanel
                  │       ├─ MTFBiasViewer
                  │       ├─ IndicatorCards
                  │       └─ EntryChecklist
                  │
                  └─► Show error card if no signal available

                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                   SIGNAL API ENDPOINT                       │
│              (/api/signal/current/route.ts)                 │
└─────────────┬───────────────────────────────────────────────┘
              │
              ├─► Check Market Status (MarketHours.getMarketStatus())
              │   ├─ Is market open?
              │   └─ What is nextOpen time?
              │
              ├─► IF MARKET CLOSED:
              │   ├─ Check lastValidSignals[symbol]
              │   ├─ Return cached signal with metadata
              │   └─ HTTP 200 with cache flag
              │
              ├─► IF MARKET OPEN:
              │   ├─ Fetch market data from OANDA:
              │   │  ├─ 1d candles (100)
              │   │  ├─ 8h candles (150)
              │   │  ├─ 4h candles (200)
              │   │  ├─ 1h candles (200)
              │   │  ├─ 15m candles (200)
              │   │  └─ 5m candles (200)
              │   │
              │   ├─ Extract last candle from each timeframe
              │   │
              │   ├─ Evaluate signal via TradingStrategies
              │   │  ├─ Calculate indicators (ADX, ATR, StochRSI, VWAP)
              │   │  ├─ Build MTF bias
              │   │  ├─ Determine direction (LONG/SHORT/NEUTRAL)
              │   │  └─ Calculate risk/reward
              │   │
              │   ├─ Create enhancedSignal with:
              │   │  ├─ indicators (ADX, ATR, etc.)
              │   │  ├─ mtfBias (Daily, 8h, 4h, 1h, 15m, 5m)
              │   │  ├─ entryPrice, stopLoss, takeProfit1/2
              │   │  ├─ lastCandle (timestamp, close, atr, adx)
              │   │  └─ entryDecision (rules evaluation)
              │   │
              │   ├─ Cache signal:
              │   │  ├─ SignalCache.set()  (in-memory)
              │   │  ├─ lastValidSignals[symbol] = signal  (backup)
              │   │  └─ lastValidTimestamps[symbol] = now  (for market close)
              │   │
              │   └─ Return HTTP 200 with signal data
              │
              └─► ERROR HANDLING:
                  ├─ Fetch fails → HTTP 500
                  ├─ Market closed + no cache → HTTP 503
                  └─ OANDA API unreachable → HTTP 500

                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              RESPONSE STRUCTURE                             │
└─────────────┬───────────────────────────────────────────────┘
              │
              ├─► HTTP 200 (Success)
              │   {
              │     "success": true,
              │     "signal": {
              │       "direction": "LONG",
              │       "confidence": 0.85,
              │       "indicators": {
              │         "adx": 25.4,
              │         "atr": 12.5,
              │         "stochRSI": { "value": 0.72, "state": "OVERBOUGHT" },
              │         "vwap": 2050.25
              │       },
              │       "mtfBias": {
              │         "daily": "LONG",
              │         "4h": "LONG",
              │         "1h": "LONG",
              │         ...
              │       },
              │       "entryDecision": { ... },
              │       "lastCandle": { close: 2050.5, ... }
              │     },
              │     "timestamp": "2026-02-07T12:34:56Z",
              │     "marketClosed": false,
              │     "dataSource": "oanda"
              │   }
              │
              ├─► HTTP 200 (Market Closed with Cache)
              │   {
              │     "success": true,
              │     "signal": {...},
              │     "marketClosed": true,
              │     "marketStatus": "Market closed. Opens Sunday 5:00 PM ET",
              │     "cached": true
              │   }
              │
              └─► HTTP 503 (No Cache Available)
                  {
                    "success": false,
                    "error": "Market closed",
                    "marketClosed": true,
                    "nextOpen": "2026-02-08T22:00:00Z",
                    "details": "No cached signal available..."
                  }

                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│           FRONTEND CACHE & ERROR HANDLING                   │
└─────────────┬───────────────────────────────────────────────┘
              │
              ├─► IF HTTP 200 with signal:
              │   ├─ Update state with fresh data
              │   ├─ Cache to localStorage
              │   └─ Render all UI components
              │
              ├─► IF HTTP 503 / Network Error:
              │   ├─ Catch block triggers
              │   ├─ Check localStorage for lastValidSignalXAU
              │   ├─ Load cached data
              │   ├─ Set marketMessage = "Using cached data (API unavailable)"
              │   └─ Render UI with cached signal
              │
              └─► IF No Cache & No API Data:
                  ├─ Show loading spinner for 3 seconds
                  ├─ Then show error card
                  └─ User can click Refresh to retry

                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│           STORAGE STRUCTURE (localStorage)                  │
└─────────────┬───────────────────────────────────────────────┘
              │
              └─► Key: "lastValidSignalXAU"
                  Value: {
                    "signal": {
                      "direction": "LONG",
                      "confidence": 0.85,
                      "indicators": {...},
                      "mtfBias": {...},
                      "entryDecision": {...},
                      "lastCandle": {
                        "close": 2050.5,
                        "atr": 12.5,
                        "adx": 25.4,
                        "stochRSI": {...},
                        "vwap": 2050.25,
                        "timestamp": "2026-02-07T12:30:00Z"
                      }
                    },
                    "timestamp": 1707307200000,  // JavaScript timestamp
                    "marketClosed": false,
                    "marketMessage": "Market open",
                    "dataSource": "oanda"
                  }

                  Size: ~45-50KB
                  Persistence: Until user clears browser data
                  Synced: Browser only (not server-synced)
```

## Polling Strategy Timeline

```
WEEKDAY (Monday-Friday) - Market Open
┌─────────────────────────────────────────┐
│ Component Mount                         │
│ ├─ Load cache from localStorage         │
│ ├─ Call fetchSignals() immediately      │
│ └─ Start polling interval: 60 seconds   │
│                                         │
├─ Every 60 seconds:                      │
│  ├─ Call fetchSignals()                 │
│  ├─ Update signal state                 │
│  ├─ Refresh UI components               │
│  └─ Update lastUpdate timestamp         │
│                                         │
└─ User clicks Refresh button:            │
   └─ Call fetchSignals() immediately     │
      (bypasses 60s timer)

WEEKEND (Saturday-Sunday) - Market Closed
┌─────────────────────────────────────────┐
│ Component Mount                         │
│ ├─ Load cache from localStorage         │
│ ├─ Call fetchSignals() immediately      │
│ │  (will get 503 "Market Closed")       │
│ │  (catch block loads cache)            │
│ └─ Start polling interval: 3600 seconds │
│    (1 hour - to check for early open)   │
│                                         │
├─ Every 3600 seconds:                    │
│  ├─ Call fetchSignals()                 │
│  ├─ Usually gets 503 (market still closed)
│  ├─ Cache reloaded if available         │
│  └─ Show "Using cached data" message    │
│                                         │
└─ User clicks Refresh button:            │
   └─ Call fetchSignals() immediately     │
      (checks if market opened early)
```

## Component Dependency Graph

```
GoldTradingDashboard (main page)
├─ Imports:
│  ├─ GoldPriceDisplay
│  ├─ GoldSignalPanel
│  ├─ MTFBiasViewer
│  ├─ IndicatorCards
│  ├─ EntryChecklist
│  └─ useToast hook
│
├─ State:
│  ├─ signalXAU (Signal | null)
│  ├─ signalXAG (Signal | null)
│  ├─ loading (boolean)
│  ├─ marketClosed (boolean)
│  ├─ dataSource ("oanda" | "synthetic")
│  └─ ... (12 total state variables)
│
└─ Effects:
   ├─ useEffect: Mount
   │  ├─ Load cache from localStorage
   │  └─ Call fetchSignals()
   │
   ├─ useEffect: Polling
   │  └─ Interval: 60s or 3600s based on day
   │
   └─ useEffect: Timer
      └─ Increment secondsAgo counter

Child Components:
├─ GoldPriceDisplay
│  ├─ Requires: signal
│  ├─ Shows: current price, 24h change
│  └─ Falls back if no price data
│
├─ GoldSignalPanel
│  ├─ Requires: signal, loading
│  ├─ Shows: Direction, Confidence, MTF Alignment
│  └─ Falls back while loading
│
├─ MTFBiasViewer
│  ├─ Requires: signal.mtfBias
│  ├─ Shows: Daily, 4H, 1H, 15M, 5M bias
│  └─ Shows "ANALYZING..." while loading
│
├─ IndicatorCards
│  ├─ Requires: signal.indicators
│  ├─ Shows: ADX, ATR, StochRSI, VWAP cards
│  └─ ERROR if indicators missing
│
└─ EntryChecklist
   ├─ Requires: signal.entryDecision
   ├─ Shows: 5-7 entry criteria checks
   └─ Shows status of each check
```

## Error Recovery Flow

```
Normal Flow:
API Call → Success → Update State → Render UI

API Error Flow:
API Call → Error → Catch Block
        └─► Check localStorage cache
            ├─ Cache exists:
            │  └─► Load cache → Update State → Render UI
            │      (show "Using cached data" message)
            └─ No cache:
               └─► Show Error Card
                   (User can click Refresh to retry)

Market Closed Flow:
API Call → 503 Response → Catch Block
        └─► Check localStorage cache
            ├─ Cache exists:
            │  └─► Load cache → Update State → Render UI
            │      (show "Market closed until..." message)
            └─ No cache:
               └─► Show Error Card
```

This three-tier caching system ensures the trading dashboard is always available with the most recent market data, even during API outages or market closures.
