# File-Based Trade Lifecycle System

## Overview

The trade lifecycle engine is a **file-based, database-free system** that persists active trades using JSON files stored in `/data/trades/`. This system monitors entries, exits (TP1/TP2), stop losses, and structural invalidations in real-time.

## Architecture

### Storage Structure

```
/data/trades/
├── XAU_USD_1707429382_a1b2c3d4.json
├── XAU_USD_1707429383_e5f6g7h8.json
└── XAG_USD_1707429384_i9j0k1l2.json
```

Each file stores a single trade's complete lifecycle data using atomic writes (temp → rename).

### Trade File Structure

```json
{
  "id": "uuid",
  "symbol": "XAU_USD",
  "direction": "BUY",
  "entry": 2034.25,
  "stopLoss": 2024.10,
  "tp1": 2042.00,
  "tp2": 2050.00,
  "tier": "A",
  "status": "OPEN",
  "tp1Hit": false,
  "tp2Hit": false,
  "slHit": false,
  "invalidated": false,
  "openedAt": 1707429382,
  "lastChecked": null,
  "closedAt": null,
  "closeReason": null
}
```

## Entry Trigger Flow

When `/api/signal/current` returns an ENTRY with `entryDecision.approved === true`:

1. **Signal Route** receives entry approval
2. **Trade File Created** automatically in `/data/trades/`
3. **File Logged** with `[LIFECYCLE] Trade created: XAU_USD BUY A Tier`
4. **Trade Persisted** with entry price, SL, TP1, TP2

## Exit Monitoring

### /api/trades/scan

Runs every 15 minutes (via cron) or manually. Fetches current market price and evaluates:

**Stop Loss Check**
- BUY: `currentPrice <= stopLoss` → close trade, set `slHit = true`, `status = CLOSED`
- SELL: `currentPrice >= stopLoss` → close trade, set `slHit = true`, `status = CLOSED`

**TP1 Check**
- BUY: `currentPrice >= tp1` → set `tp1Hit = true`, move `stopLoss = entry` (breakeven)
- SELL: `currentPrice <= tp1` → set `tp1Hit = true`, move `stopLoss = entry` (breakeven)

**TP2 Check**
- BUY: `currentPrice >= tp2` → set `tp2Hit = true`, set `status = CLOSED`
- SELL: `currentPrice <= tp2` → set `tp2Hit = true`, set `status = CLOSED`

**Structural Invalidation Check**
- Re-runs only structural bias logic (not full scoring)
- If `structuralTier < originalTier` or direction flips: sets `invalidated = true`
- Does NOT auto-close; alerts only

### Duplicate Alert Prevention

Each trade flag acts as a guard:
- `tp1Hit === true` → TP1 alert already sent, won't send again
- `slHit === true` → SL alert already sent, won't send again
- `invalidated === true` → invalidation alert already sent, won't send again

System is idempotent: running scan multiple times won't duplicate alerts.

## Endpoints

### `/api/signal/current?symbol=XAU_USD`
**Entry Generation**
- Evaluates all signals
- Creates trade file on approval
- Returns enhanced signal with entry decision

### `/api/trades/scan`
**Exit Monitoring**
- Reads all open trades from `/data/trades/`
- Checks market prices against TP1/TP2/SL
- Updates trade files atomically
- Returns: `{ scanned, tpHits, slHits, invalidations }`

### `/api/trades/status?status=open|all`
**Trade Viewing**
- Lists all open or all trades
- Shows daysOpen and riskReward ratio
- Useful for dashboard display

### `/api/cron/trade-scan`
**Automated Scanning**
- Called by Vercel Cron every 15 minutes
- Requires `CRON_SECRET` bearer token
- Triggers `/api/trades/scan` internally

## File Safety

**Atomic Writes**
- Write to temp file: `{filename}.tmp`
- Rename on success: `{filename}.tmp` → `{filename}.json`
- Prevents partial writes on crash

**Error Handling**
- Corrupted JSON files are skipped with error log
- Single bad file won't crash entire scan
- Continues processing remaining trades

**Logging**
```
[LIFECYCLE] Trade created: XAU_USD BUY A Tier at 2034.25
[LIFECYCLE] TP1 hit: XAU_USD BUY at 2042.10 (TP1: 2042.00)
[LIFECYCLE] SL hit: XAU_USD BUY at 2024.05 (SL: 2024.10)
[LIFECYCLE] Structure invalidated: XAU_USD BUY
[LIFECYCLE] Checking XAU_USD
[LIFECYCLE] Scan complete: 3 scanned, 1 TP1 hit, 1 SL hit, 0 invalidations
```

## Cron Setup (Vercel)

Add to `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/cron/trade-scan",
      "schedule": "*/15 * * * *"
    }
  ]
}
```

Or configure at: https://vercel.com/dashboard/projects/{project}/crons

## Usage Example

**1. Signal triggers entry:**
```
GET /api/signal/current?symbol=XAU_USD
→ entryDecision.approved = true
→ Trade file created: XAU_USD_1707429382_a1b2c3d4.json
```

**2. Check active trades:**
```
GET /api/trades/status?status=open
→ Returns: { count: 1, trades: [...] }
```

**3. Scan for exits (manual):**
```
GET /api/trades/scan
→ Returns: { scanned: 1, tpHits: 0, slHits: 0, invalidations: 0 }
```

**4. View all closed trades:**
```
GET /api/trades/status?status=all
→ Returns: { count: 5, trades: [open, closed, ...] }
```

## Deployment

1. Ensure `/data/trades/` is created on startup (automatic)
2. Add `data/trades/` to `.gitignore` (prevents committing trade data)
3. Deploy cron configuration to Vercel
4. Set `CRON_SECRET` in environment variables

## Next Features

- Telegram alerts for TP1/TP2/SL hits with price notifications
- Dashboard UI showing active trades with real-time P&L
- Trade history analytics (win rate, avg profit, max drawdown)
- Manual trade close endpoint for override scenarios
- CSV export of closed trades for auditing

## Troubleshooting

**No trades being created:**
- Check `entryDecision.approved` in API response
- Verify entry prices are set correctly

**Scans not detecting exits:**
- Verify market prices are fetching correctly
- Check trade file timestamps (lastChecked)
- Ensure SL/TP levels are realistic

**Corrupted trade files:**
- Delete specific `.json` file from `/data/trades/`
- Scan will skip and log error
- Trade will be gone next cron run

**Missing market data:**
- Check OANDA connection
- Verify DataFetcher is initialized correctly
- Check logs for fetch errors
