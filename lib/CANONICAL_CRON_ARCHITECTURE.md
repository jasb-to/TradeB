# CANONICAL CRON ARCHITECTURE

## Overview

The system now uses a **single, canonical cron execution path** to eliminate false-positive status reports and ensure diagnostics always align with reality.

## Architecture

### 1. ONLY Entry Point: `/api/external-cron`

**Path:** `GET /api/external-cron?secret=YOUR_SECRET`

This is the **ONLY** endpoint that should receive cron-jobs.org requests.

**Responsibilities:**
- Authenticate via query parameter `?secret=`
- Check market hours
- Execute signal generation for XAU_USD and XAG_USD
- Record CronHeartbeat for both symbols (success OR failure)
- Return 200 OK response
- Trigger NearMissTracker and BTradeTracker

**Guarantees:**
- It is IMPOSSIBLE for external-cron to return 200 OK without recording heartbeats
- Both symbols record execution state simultaneously
- Heartbeats are recorded BEFORE the response is sent
- Market-closed scenarios still record execution (cron ran successfully, market just closed)

### 2. Deprecated Endpoints (Traffic Redirects)

#### `/api/cron`
- Proxies requests to `/api/external-cron`
- Returns whatever external-cron returns
- Logs deprecation warning
- Ensures backward compatibility with old cron-jobs.org URLs

#### `/api/cron/signal-xau` and `/api/cron/signal-xag`
- Returns HTTP 410 (Gone)
- Explains that endpoints are deprecated
- Directs to `/api/external-cron`

### 3. Diagnostics Source: `/api/system-diagnostics`

**Path:** `GET /api/system-diagnostics`

This endpoint derives health status ONLY from CronHeartbeat:

\`\`\`typescript
// Heartbeat-based health determination
const isCronHealthy = timeSinceLastCron < 10 * 60 * 1000  // Last ran within 10 minutes
const systemOperational = isCronHealthy && hasRecentActivity

// IMPOSSIBLE FOR:
// - Cron to return 200 OK without systemOperational being updatable
// - systemOperational to be false while heartbeats show recent execution
// - Mismatch between cron-jobs.org 200 OK and /api/system-diagnostics status
\`\`\`

## Execution Flow

\`\`\`
cron-jobs.org
    ↓
GET /api/external-cron?secret=abc123xyz789
    ↓
[Auth] Verify secret
    ↓
[Market Check] Is market open?
    ↓
├─ YES → Process XAU & XAG signals, record heartbeats, return 200
├─ NO  → Record heartbeats anyway, return 200 with marketClosed flag
    ↓
CronHeartbeat.recordExecution("XAU_USD")
CronHeartbeat.recordExecution("XAG_USD")
    ↓
Return 200 OK with signal data
    ↓
/api/system-diagnostics reads heartbeats:
  - Finds last execution time
  - Checks 10-minute threshold
  - Reports systemOperational: true/false
\`\`\`

## Key Invariants

1. **One-Way Guarantee:** If `external-cron` returns 200 OK → heartbeats are recorded
2. **No Orphaned Executions:** No 200 OK response without heartbeat recording
3. **Fresh Data Guarantee:** `systemOperational=true` means signals are < 10 minutes old
4. **Symmetry:** Both XAU_USD and XAG_USD heartbeats are recorded together

## Configuration for cron-jobs.org

Use **ONLY this URL:**

\`\`\`
https://xptswitch.vercel.app/api/external-cron?secret=YOUR_SECRET
\`\`\`

Do NOT use:
- ~~`/api/cron`~~ (deprecated, proxies to external-cron anyway)
- ~~`/api/cron/signal-xau`~~ (deprecated, returns 410)
- ~~`/api/cron/signal-xag`~~ (deprecated, returns 410)

## Migration Notes

If you have existing cron-jobs.org jobs pointing to `/api/cron` or signal-specific endpoints:

1. They will continue working (proxied to `/api/external-cron`)
2. You can update them to point directly to `/api/external-cron?secret=...`
3. Update at your convenience - backward compat is maintained

## Verification

Check `/api/system-diagnostics` after cron runs:

\`\`\`json
{
  "systemOperational": true,
  "cronExecution": {
    "lastExternalCronHitAt": "2026-02-04T20:15:00.000Z",
    "timeSinceLastCronMs": 45000,
    "isCronHealthy": true
  },
  "perSymbolExecution": {
    "XAU_USD": {
      "lastRunAt": "2026-02-04T20:15:00.000Z",
      "runsLast60m": 12,
      "lastRunCompleted": true,
      "status": "SUCCESS"
    },
    "XAG_USD": {
      "lastRunAt": "2026-02-04T20:15:00.000Z",
      "runsLast60m": 12,
      "lastRunCompleted": true,
      "status": "SUCCESS"
    }
  }
}
\`\`\`

If `systemOperational: true` but no recent heartbeats, there's a configuration error.
