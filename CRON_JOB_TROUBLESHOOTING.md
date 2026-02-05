# XPTSWITCH Cron Job Troubleshooting Guide

## Issue: No Telegram Alerts Being Sent

### Root Cause Analysis

The system has two components for cron execution:

1. **Internal Cron (`/api/cron`)** - Used by Vercel cron jobs (if configured)
2. **External Cron (`/api/external-cron`)** - Used by cron-job.org (recommended)

**Debug logs show signals ARE being generated but NO alerts are being sent**, indicating the cron job is NOT being invoked.

---

## Verification Checklist

### Step 1: Verify Environment Variables

Visit your Vercel project dashboard and confirm ALL these variables are set:

\`\`\`
✓ CRON_SECRET         - Must match the secret in cron-job.org URL
✓ TELEGRAM_BOT_TOKEN  - Your Telegram bot token
✓ TELEGRAM_CHAT_ID    - Your Telegram chat/group ID
✓ OANDA_API_KEY       - OANDA API key for market data
✓ OANDA_ACCOUNT_ID    - OANDA account ID
\`\`\`

**To check**: Visit `/api/diagnose` in your browser to see which variables are set.

---

### Step 2: Verify Cron-Job.org Configuration

1. **Visit**: https://cron-job.org/en/
2. **Check your cronjobs list** - Find the XPTSWITCH job
3. **Verify the URL** matches this pattern:
   \`\`\`
   https://xptswitch.vercel.app/api/external-cron?secret=YOUR_CRON_SECRET
   \`\`\`
4. **Verify schedule**: Should be set to "Every 10 minutes"
5. **Check status**: Should show "Active" (green check mark)
6. **Check execution history**: Click on the job to see if it's been called recently

**Common Issues**:
- ❌ Domain is wrong (shows `cxswitch` instead of `xptswitch`)
- ❌ Secret parameter missing or mismatched
- ❌ Job is paused/disabled (not active)
- ❌ Schedule not set to every 10 minutes

---

### Step 3: Test the External Cron Endpoint Manually

In your terminal or browser, run:

\`\`\`bash
# Replace YOUR_CRON_SECRET with your actual secret
curl "https://xptswitch.vercel.app/api/external-cron?secret=YOUR_CRON_SECRET"
\`\`\`

**Expected response**:
\`\`\`json
{
  "success": true,
  "timestamp": "2025-01-19T12:34:56.789Z",
  "results": {
    "XAU_USD": {
      "type": "ENTER",
      "direction": "LONG",
      "alertLevel": 3,
      "entryPrice": 4666.59,
      "stopLoss": 4638.51
    },
    "XAG_USD": {
      "type": "ENTER",
      "direction": "LONG",
      "alertLevel": 3,
      "entryPrice": 93.23,
      "stopLoss": 91.64
    }
  },
  "requestId": "abc123",
  "duration": 1234
}
\`\`\`

**Check Vercel logs immediately after running this curl** - you should see:
\`\`\`
[v0] EXTERNAL-CRON STARTED: requestId=abc123
[v0] CRON-JOB AUTH SUCCESS: requestId=abc123
[v0] CRON-JOB PROCESSING 2 symbols
[v0] CRON-JOB Processing XAU_USD
[v0] CRON-JOB signal generated: type=ENTER dir=LONG level=3 shouldAlert=true
[v0] CRON-JOB Sending Telegram for XAU_USD
[v0] CRON-JOB Telegram SENT for XAU_USD: ENTER LONG
[v0] CRON-JOB Processing XAG_USD
[v0] CRON-JOB signal generated: type=ENTER dir=LONG level=3 shouldAlert=true
[v0] CRON-JOB Sending Telegram for XAG_USD
[v0] CRON-JOB Telegram SENT for XAG_USD: ENTER LONG
[v0] EXTERNAL-CRON COMPLETED: requestId=abc123 duration=1234ms
\`\`\`

**If you see these logs**, the endpoint is working correctly. The issue is with cron-job.org not calling it.

**If you see "Unauthorized" error**, the secret in your URL doesn't match `CRON_SECRET` env var.

---

### Step 4: Check Vercel Function Logs

1. **Visit**: https://vercel.com/dashboard/project/xptswitch
2. **Click**: "Monitoring" or "Logs"
3. **Filter** for `/api/external-cron`
4. **Look for recent invocations** - Should see calls every 10 minutes if cron-job.org is working
5. **Check timestamps** - Most recent should be within last 10 minutes

**No logs visible?** The cron job is not being called by cron-job.org.

---

### Step 5: Diagnose Cron-Job.org Issues

If the endpoint works manually but cron-job.org isn't calling it:

1. **Check cron-job.org status page**: https://cron-job.org/status/
2. **Enable email notifications**: Go to cronjob settings → Enable "Send me a notification if execution failed"
3. **Check your email** for failure notifications
4. **Common causes**:
   - Cron job disabled/paused
   - URL has typo
   - Secret expired or changed
   - Cron-job.org service issue

**Solution**: 
- Delete the existing cronjob
- Create a NEW cronjob with correct URL and secret
- Verify it runs within 10 minutes
- Check Vercel logs for [v0] EXTERNAL-CRON logs

---

## Complete Setup Instructions

### For Fresh Setup or Reset

1. **Get your cron secret**:
   \`\`\`bash
   # Generate a strong secret (save this!)
   openssl rand -base64 32
   # Example output: ABC123def456GHI789jklMNO012pqr34=
   \`\`\`

2. **Add environment variable** in Vercel:
   - Go to Project Settings → Environment Variables
   - Add: `CRON_SECRET` = `ABC123def456GHI789jklMNO012pqr34=`
   - Redeploy your project

3. **Verify environment** is live:
   - Visit `/api/diagnose`
   - Should show `CRON_SECRET: ✓ Set`

4. **Create cron-job.org job**:
   - Visit https://cron-job.org/en/
   - Sign in / Register
   - Click "Create cronjob"
   - **URL**: `https://xptswitch.vercel.app/api/external-cron?secret=ABC123def456GHI789jklMNO012pqr34=`
   - **Schedule**: Every 10 minutes
   - **Notifications**: Enable email on failure
   - Click "Save"

5. **Verify execution** (wait up to 10 minutes):
   - Check cron-job.org job status
   - Check Vercel logs for `[v0] EXTERNAL-CRON` messages
   - Check that Telegram alerts are received
   - Visit `/api/diagnose` to see cached signals

---

## Execution Flow (How It Works)

\`\`\`
cron-job.org
    ↓ (every 10 minutes)
Calls: https://xptswitch.vercel.app/api/external-cron?secret=...
    ↓
[v0] EXTERNAL-CRON STARTED
    ↓
Verify secret (CRON_SECRET env var)
    ↓ (if failed → 401 Unauthorized)
Check market hours (if closed → return early)
    ↓
For each symbol (XAU_USD, XAG_USD):
  - Fetch candles from OANDA
  - Evaluate signals using strategies
  - Cache signal
  - Check if alert should send
  - Send Telegram notification (if conditions met)
    ↓
[v0] EXTERNAL-CRON COMPLETED
\`\`\`

---

## Alert Decision Logic

Alerts are sent when:
1. ✓ `signal.type === "ENTER"` (not NO_TRADE)
2. ✓ `signal.alertLevel >= 2` (requires level 2 or 3, based on confidence)
3. ✓ Not in 5-minute cooldown (prevents alert spam)
4. ✓ Telegram credentials configured
5. ✓ Not during market closure

**If alert is skipped**, logs show reason:
\`\`\`
[v0] ALERT SKIPPED for XAG_USD: cooldown/duplicate
\`\`\`

---

## Monitoring & Maintenance

### Daily Checks

- Visit `/api/diagnose` endpoint
- Verify `configurationStatus.isValid === true`
- Check that last alerts were within last hour
- Visit cron-job.org to confirm job ran recently

### If Alerts Stop

1. Check Vercel logs for `[v0] EXTERNAL-CRON` entries
2. If no logs: Cron-job.org not calling endpoint
3. If logs show "ALERT SKIPPED": Check cooldown status or alert decision logic
4. If logs show "Telegram FAILED": Check Telegram credentials or bot connectivity

### Performance Metrics

- Each cron execution takes ~1-3 seconds
- Signal generation: ~500ms per symbol
- Telegram notification: ~200-500ms
- Cache: 30 seconds (new signal every 10 min from cron)

---

## Emergency Procedures

### Manually Trigger Cron

\`\`\`bash
curl "https://xptswitch.vercel.app/api/external-cron?secret=YOUR_SECRET"
\`\`\`

### Reset Alert Cooldown

Visit `/api/diagnose` and note the cron secret. No UI exists to reset cooldown, but it expires automatically after 5 minutes.

### Verify All Configs

\`\`\`bash
curl "https://xptswitch.vercel.app/api/diagnose"
\`\`\`

Response shows all configuration status and issues.

---

## Support & Next Steps

If alerts still aren't sending after following this guide:

1. **Collect logs**: 
   - Screenshots of `/api/diagnose` output
   - Vercel Function Logs for `/api/external-cron`
   - Cron-job.org execution history

2. **Test Telegram directly**:
   - Visit `/api/test-telegram` endpoint
   - Should receive a test message in your Telegram chat

3. **Check signal generation**:
   - Signals ARE being generated (confirmed in debug logs)
   - Checklists display conditions (MTF, ADX, indicators)
   - Trade details show Entry, Stop, TP1, TP2

4. **Summary**: System is generating valid signals. Issue is isolated to cron job invocation or alert dispatch.
