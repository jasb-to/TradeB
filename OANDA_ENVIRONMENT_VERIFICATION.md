# OANDA Environment Verification Guide

## Root Cause Analysis
Your OANDA instruments endpoint returned:
```json
{
  "success": false,
  "error": "OANDA API returned 400",
  "details": "{\"errorMessage\":\"Invalid value specified for 'accountID'\"}",
  "environment": "live",
  "accountId": "527..."
}
```

This indicates **account ID mismatch** between your OANDA credentials and the API base URL being used.

---

## Step 1: Verify Your OANDA Account Type

### Login to OANDA Dashboard
1. Go to https://www.oanda.com
2. Login to your account
3. Navigate to **Account Settings** or **My Account**

### Determine Account Type
Look for:
- **Practice/Demo Account**: Shows "Demo" or "Practice" badge
- **Live Account**: Shows "Live" badge

### Get Your Account IDs
1. **Practice Account ID**: Usually shown as a number starting with "0" or specific demo format
   - Example: `011-001-12345678-001`
   - Practice API base URL: `https://api-fxpractice.oanda.com`

2. **Live Account ID**: Usually shown as a number without demo designation
   - Example: `12345678`
   - Live API base URL: `https://api-fxtrade.oanda.com`

---

## Step 2: Verify Current Environment Variables

### Check Your Vercel Project Settings
1. Go to Vercel Project Settings → Environment Variables
2. Look for:
   - `OANDA_API_KEY`
   - `OANDA_ACCOUNT_ID`
   - `OANDA_ENVIRONMENT` (optional, defaults to "live")

### Verify the Values
The issue likely is one of:

**Scenario A**: Using practice API key + live URL
- **API Key**: From practice/demo account
- **Account ID**: From live account
- **Fix**: Use matching IDs from same account type

**Scenario B**: Using live API key + practice URL
- **API Key**: From live account
- **Account ID**: From practice account
- **Fix**: Use matching IDs from same account type

**Scenario C**: Expired or incorrect API key
- **Fix**: Generate new API key from OANDA dashboard

---

## Step 3: Correct Environment Variable Setup

### For Practice/Demo Account
```env
OANDA_API_KEY=<your-practice-api-key>
OANDA_ACCOUNT_ID=<your-practice-account-id>
OANDA_ENVIRONMENT=practice
```

**Test URL**: `https://api-fxpractice.oanda.com/v3/accounts/<ACCOUNT_ID>/instruments`

### For Live Account
```env
OANDA_API_KEY=<your-live-api-key>
OANDA_ACCOUNT_ID=<your-live-account-id>
OANDA_ENVIRONMENT=live
```

**Test URL**: `https://api-fxtrade.oanda.com/v3/accounts/<ACCOUNT_ID>/instruments`

---

## Step 4: Update Vercel Environment Variables

1. Go to Vercel Project Settings → Environment Variables
2. Update `OANDA_ACCOUNT_ID` with the correct value for your environment
3. If `OANDA_ENVIRONMENT` is missing, add it (use "practice" or "live")
4. Save changes
5. **Clear build cache**: Settings → General → Clear All → Clear Production Deployments
6. Redeploy from GitHub or use "Redeploy" button

---

## Step 5: Test the Fix

### Test Endpoint
After redeploying, visit:
```
https://traderb.vercel.app/api/oanda/instruments
```

### Expected Success Response
```json
{
  "success": true,
  "environment": "live",
  "accountId": "...",
  "instrumentCount": 150,
  "indices": [
    { "name": "US_NAS_100", "type": "INDEX", "pipLocation": -2 },
    { "name": "US_SPX_500", "type": "INDEX", "pipLocation": -2 }
  ],
  "metals": [
    { "name": "XAU_USD", "type": "METAL", "pipLocation": -2 }
  ]
}
```

### Update Symbol Config
Once you see the correct instrument names, update `/lib/symbol-config.ts`:

```typescript
NAS100USD: {
  oandaName: "US_NAS_100",  // Use exact name from API response
  ...
},
SPX500USD: {
  oandaName: "US_SPX_500",  // Use exact name from API response
  ...
}
```

---

## Step 6: Verify Trading Symbols

After environment fix and config update, test:
- `/api/signal/current?symbol=XAU_USD` - Should work (and was already working)
- `/api/signal/current?symbol=NAS100USD` - Should now return valid signal (not "invalid trading symbol")
- `/api/signal/current?symbol=SPX500USD` - Should now return valid signal (not "invalid trading symbol")

---

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| 400 "Invalid value specified for 'accountID'" | Wrong account ID for environment | Use correct account ID for your API base URL |
| 401 "Unauthorized" | Wrong/expired API key | Generate new API key from OANDA dashboard |
| 403 "Forbidden" | API key lacks permissions | Enable CFD/index trading in OANDA account settings |
| 0 instruments returned | Account doesn't have live data access | Upgrade OANDA account tier if needed |

---

## Summary

The fix requires 3 actions:
1. **Identify** whether you use practice or live OANDA account
2. **Update** Vercel environment variables with matching credentials
3. **Redeploy** and verify with `/api/oanda/instruments` endpoint

Once environment variables are corrected, indices (NAS100USD, SPX500USD) will appear on your dashboard and trading will work immediately.
