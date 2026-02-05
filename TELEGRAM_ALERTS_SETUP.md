# Telegram Alerts Setup & Verification

## Current Status

Signals are displaying on the dashboard but Telegram alerts are not being sent. Here's the complete diagnostic and fix guide.

## Root Causes Identified

1. **Missing TelegramNotifier class** - Fixed ✓ (created `/lib/telegram.ts`)
2. **Import failures breaking cron** - Fixed ✓ (added graceful fallback)
3. **No error logging** - Fixed ✓ (enhanced logging in cron routes)

## Step 1: Verify Environment Variables

Visit this endpoint to check your configuration:
\`\`\`
https://xptswitch.vercel.app/api/cron-status
\`\`\`

Expected output should show:
\`\`\`json
{
  "environment": {
    "cron_secret_set": true,
    "telegram_bot_token_set": true,
    "telegram_chat_id_set": true,
    "oanda_api_key_set": true,
    "oanda_account_id_set": true
  }
}
\`\`\`

**If any show false:**
1. Go to Vercel Dashboard → Settings → Environment Variables
2. Add/verify these variables:
   - `CRON_SECRET` - Any random string (used for auth)
   - `TELEGRAM_BOT_TOKEN` - From BotFather on Telegram
   - `TELEGRAM_CHAT_ID` - Your Telegram chat ID
   - `OANDA_API_KEY` - OANDA API key
   - `OANDA_ACCOUNT_ID` - OANDA account ID
3. Redeploy the application

## Step 2: Test Telegram Connection

Call this endpoint to send a test message:
\`\`\`
https://xptswitch.vercel.app/api/test-telegram
\`\`\`

If successful, you should:
- See HTTP 200 response
- Receive a test message in your Telegram chat
- See `[v0] TELEGRAM MESSAGE SENT` in Vercel logs

## Step 3: Verify Cron Job Status

Check what signals are cached and whether cooldown is active:
\`\`\`
https://xptswitch.vercel.app/api/cron-status
\`\`\`

Look for:
- `cachedSignals` - Shows if signals are cached
- `alertState.cooldownActive` - If true, alerts are in cooldown (wait ~5 minutes)
- `alertState.timeSinceLastAlert` - Time since last alert was sent

## Step 4: Manually Trigger Cron

Test the cron job manually (requires valid CRON_SECRET):

\`\`\`bash
# Internal cron endpoint (requires Bearer token)
curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
  https://xptswitch.vercel.app/api/cron

# External cron endpoint (query parameter auth)
curl https://xptswitch.vercel.app/api/external-cron?secret=YOUR_CRON_SECRET
\`\`\`

Expected logs in Vercel should show:
\`\`\`
[v0] CRON STARTED
[v0] CRON PROCESSING 2 symbols
[v0] CRON XAU_USD: type=ENTER dir=LONG level=3 shouldAlert=true
[v0] CRON XAU_USD: Telegram config - token=true chatId=true
[v0] ALERT QUEUED for XAU_USD
[v0] TELEGRAM SENT for XAU_USD
[v0] CRON COMPLETED
\`\`\`

## Step 5: Check Cron-Job.org Configuration

1. Visit https://cron-job.org/en/
2. Find your job (should be for xptswitch.vercel.app)
3. Verify URL is correct:
   - Should be: `https://xptswitch.vercel.app/api/external-cron?secret=YOUR_CRON_SECRET`
4. Verify schedule: Every 10 minutes (`*/10 * * * *`)
5. Check "Last Events" to see if job is executing successfully (green checkmarks)

## Step 6: Monitor Vercel Logs

Go to Vercel Dashboard → your project → Logs, and look for:

**Good signs:**
- `[v0] CRON STARTED` every 10 minutes
- `[v0] TELEGRAM SENT` when signal conditions are met
- No error messages

**Problem signs:**
- No `[v0] CRON` messages = cron-job.org not calling the endpoint
- `Telegram config - token=false` = environment variables not set
- `cooldown/duplicate` = alert was already sent, waiting for 5-minute cooldown
- Import errors in console = module loading issue

## Alert Decision Logic

Alerts are sent when ALL these conditions are true:
1. Signal is ENTRY type (not NO_TRADE)
2. Signal alertLevel >= 2 (on scale 1-3)
3. Signal confidence > 0%
4. NOT in 5-minute cooldown from previous alert for same symbol
5. Telegram credentials are configured
6. Telegram API is reachable

If alert is skipped, the reason is logged:
- "cooldown/duplicate" = Alert cooldown active
- "no token" = TELEGRAM_BOT_TOKEN not set
- "no chat ID" = TELEGRAM_CHAT_ID not set

## Common Issues & Solutions

### Issue: `[v0] ALERT SKIPPED for XAU_USD: cooldown/duplicate`
**Solution:** This is normal! The system prevents spam by only sending 1 alert per symbol per 5 minutes. If you want another alert, wait 5 minutes or wait for the signal to change (LONG → SHORT or vice versa).

### Issue: `[v0] CRON: Failed to import TelegramNotifier`
**Solution:** This means `/lib/telegram.ts` has a syntax error. Check:
\`\`\`bash
# Verify the file exists and is valid TypeScript
\`\`\`

### Issue: No logs at all in Vercel console
**Solution:** Either:
1. Cron-job.org is not calling the endpoint (check cron-job.org dashboard)
2. Authentication is failing silently
3. Market hours check is preventing execution (runs only during market hours)

### Issue: `shouldAlert=false` even with valid signal
**Solution:** Signal is in cooldown. Check `[v0] CRON-STATUS` endpoint for cooldown status.

## Testing Checklist

- [ ] Environment variables are set (use /api/cron-status)
- [ ] Test telegram endpoint returns success
- [ ] Manual cron trigger works (200 response)
- [ ] Vercel logs show `[v0] CRON` messages
- [ ] Telegram receives test message
- [ ] At least 5 minutes have passed since last alert (no cooldown)
- [ ] Signal shows alertLevel >= 2
- [ ] Market is open (checks during trading hours only)

## Next Steps

1. Verify all environment variables with `/api/cron-status`
2. Test Telegram with `/api/test-telegram`
3. Manually trigger cron and check logs
4. Wait for next scheduled cron execution (every 10 minutes)
5. Verify Telegram receives an alert when signal conditions are met

If still not working after these steps, check Vercel logs for specific error messages.
