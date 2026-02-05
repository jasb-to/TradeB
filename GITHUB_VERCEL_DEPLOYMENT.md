# 🚀 GITHUB DESKTOP & DEPLOYMENT QUICK GUIDE

**Version:** 1.0 | **Date:** February 5, 2026 | **Status:** PRODUCTION READY

---

## 📋 5-MINUTE QUICK START

### Step 1: Open GitHub Desktop (2 min)

```
1. Install from: https://desktop.github.com (if not already installed)
2. Open GitHub Desktop
3. Sign in with GitHub account (create account at github.com if needed)
4. You're ready!
```

### Step 2: Push Code to GitHub (2 min)

**If code is NOT on GitHub yet:**

```
1. In GitHub Desktop: "File" → "Add Local Repository"
2. Navigate to: /Users/bilkhumacmini/Documents/VS Projects/TradeB
3. Click "Add Repository"
4. Enter message: "Initial commit: TradeB trading system"
5. Click "Publish Repository"
6. Choose "Public" (anyone can see) or "Private" (only you)
7. Click "Publish"
```

**If code IS already on GitHub:**

```
1. In GitHub Desktop: "File" → "Clone Repository"
2. Find your "tradeb" repository
3. Click "Clone"
4. Done!
```

### Step 3: Deploy to Vercel (1 min)

```
1. Go to: https://vercel.com/login
2. Sign in with GitHub account
3. Click "Add New..." → "Project"
4. Select "tradeb" repository
5. Click "Import"
6. Click "Deploy"
7. Wait 1-2 minutes for build
```

### Step 4: Set Environment Variables (1 min)

In Vercel Dashboard:

```
1. Click "Settings" → "Environment Variables"
2. Add 5 variables:

   OANDA_API_KEY = [your OANDA API key]
   OANDA_ACCOUNT_ID = [your account ID]
   TELEGRAM_BOT_TOKEN = [your bot token]
   TELEGRAM_CHAT_ID = [your chat ID]
   CRON_SECRET = [random 32-char string like: abc123def456ghi789jkl012mno345pqr]

3. Click "Save"
4. Vercel auto-redeploys
```

**Done! Your site is live at:** `https://tradeb-XXXX.vercel.app`

---

## 🔄 HOW TO SYNC FUTURE CHANGES

### Every time you update code:

```
GitHub Desktop:
1. Make code changes in VS Code
2. GitHub Desktop shows changes automatically
3. Left side: see list of modified files
4. Bottom left: write a message like "Fix signal calculation"
5. Click "Commit to main"
6. Top right: Click "Push origin"
7. Done! Changes synced to GitHub and Vercel auto-redeploys
```

---

## 🤖 SET UP CRON JOBS (10 min)

### External Cron Setup (Recommended)

```
1. Go to: https://cron-job.org
2. Create account (free)
3. Click "Create Cronjob"
4. Fill in:

   Title: TradeB Signal Checker
   
   URL: https://tradeb-XXXX.vercel.app/api/external-cron?secret=abc123def456ghi789jkl012mno345pqr
   (Replace abc123... with your CRON_SECRET from step 4)
   
   Schedule: 0 * * * * (runs hourly at :00)
   Email on failure: your@email.com
   
5. Click "Create"
6. Click "Execution" tab to see test runs
```

---

## 📱 TEST TELEGRAM ALERTS

### Get Bot Token and Chat ID

```
1. Open Telegram
2. Find @BotFather
3. Send: /newbot
4. Follow instructions to create bot
5. BotFather gives you: TELEGRAM_BOT_TOKEN
6. Start chat with your new bot
7. Send any message to your bot
8. Visit: https://api.telegram.org/botYOUR_TOKEN/getUpdates
9. Look for "chat": {"id": NUMBER} 
10. That NUMBER is your TELEGRAM_CHAT_ID
```

### Test Connection

```
1. Go to: https://tradeb-XXXX.vercel.app/api/test-telegram
2. You should get: {"success": true}
3. You'll receive test message in Telegram
4. If not, check environment variables are set correctly
```

---

## 🌐 WHERE CAN YOU VIEW IT?

### Your live domain:

```
https://tradeb-XXXX.vercel.app
```

Replace XXXX with the actual Vercel-assigned URL shown in dashboard.

### What you'll see:

✅ Interactive trading dashboard  
✅ Gold & Silver price displays  
✅ Real-time signal generation  
✅ Entry/exit levels  
✅ Risk management info  
✅ Market status  
✅ Multi-timeframe bias  

### Access from anywhere:

- **Browser:** https://tradeb-XXXX.vercel.app
- **Mobile:** Works on iPhone, Android, tablet
- **Desktop:** Works on Windows, Mac, Linux
- **Access time:** 24/7 (runs on Vercel servers)

### Share with others:

```
You can share the link with:
- Trading partners
- Risk managers
- Team members
- Coaches

Just send them: https://tradeb-XXXX.vercel.app
```

---

## 🔍 MONITORING YOUR DEPLOYMENT

### Check if it's working:

**Option 1: Dashboard**
```
Visit: https://tradeb-XXXX.vercel.app
Should load in < 3 seconds
Shows current XAU/XAG signals
```

**Option 2: Vercel Logs**
```
1. Go to: https://vercel.com/dashboard
2. Click "tradeb" project
3. Click "Deployments"
4. Click latest deployment
5. Click "Logs" to see real-time activity
```

**Option 3: API Endpoints**
```
https://tradeb-XXXX.vercel.app/api/signal/xau
https://tradeb-XXXX.vercel.app/api/signal/xag
https://tradeb-XXXX.vercel.app/api/cron-status
https://tradeb-XXXX.vercel.app/api/diagnostics
```

---

## 🛑 TROUBLESHOOTING

### "Deployment Failed"
```
1. Check Vercel logs (Deployments tab)
2. Most common: Missing environment variables
3. Solution: Add all 5 env vars to Vercel Settings
4. Click Deploy again
```

### "Site won't load"
```
1. Wait 2-3 minutes (first deploy can be slow)
2. Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
3. Check Vercel logs for errors
4. If error shows "Missing OANDA_API_KEY" - add to env vars
```

### "Telegram alerts not sending"
```
1. Check TELEGRAM_BOT_TOKEN is set in Vercel
2. Check TELEGRAM_CHAT_ID is set in Vercel
3. Make sure you messaged bot first (enables chat)
4. Check bot is not muted in Telegram
5. Test: https://tradeb-XXXX.vercel.app/api/test-telegram
```

### "Cron job not running"
```
1. Check cron-job.org shows "Execution successful"
2. Check URL has correct CRON_SECRET
3. Check CRON_SECRET env var matches
4. Check Vercel logs for /api/external-cron entries
5. Wait until next scheduled time
```

---

## 📊 AFTER DEPLOYMENT CHECKLIST

- [ ] GitHub repo created and code pushed
- [ ] Vercel project deployed and build successful
- [ ] All 5 environment variables set in Vercel
- [ ] Frontend loads at https://tradeb-XXXX.vercel.app
- [ ] Can see XAU/XAG signals on dashboard
- [ ] Telegram test message received
- [ ] Cron job created and scheduled
- [ ] Vercel logs show no errors
- [ ] Market status shows correctly (open/closed)

---

## 🎯 WHAT'S RUNNING WHERE?

```
┌─────────────────────────────────────────────────────────┐
│ YOUR LOCAL COMPUTER                                     │
│ ├─ VS Code (code editing)                             │
│ ├─ Git (version control)                              │
│ └─ GitHub Desktop (GitHub sync)                       │
└─────────────────────────────────────────────────────────┘
                        ↓ (git push)
┌─────────────────────────────────────────────────────────┐
│ GITHUB (github.com)                                     │
│ └─ tradeb repository (your code backup)               │
└─────────────────────────────────────────────────────────┘
                        ↓ (auto-connect)
┌─────────────────────────────────────────────────────────┐
│ VERCEL (vercel.com)                                     │
│ ├─ Next.js frontend (dashboard at tradeb-XXXX.vercel.app)
│ ├─ API routes (signal generation, cron jobs)          │
│ ├─ Environment variables (API keys, tokens)           │
│ └─ Build system (auto-builds on every push)           │
└─────────────────────────────────────────────────────────┘
         ↓ (scheduled calls)        ↓ (user visits)
    ┌──────────────┐            ┌──────────────┐
    │ cron-job.org │            │ Your Browser │
    │ (scheduler)  │            │ (or mobile)  │
    └──────────────┘            └──────────────┘
         ↓                            ↓
    Every hour: triggers API    See live signals,
    to get latest signals       prices, updates
```

---

## 💡 PRO TIPS

### 1. Auto-Updates
```
Every time you:
1. Make code changes locally
2. Push to GitHub via GitHub Desktop
→ Vercel auto-builds and deploys (takes 1-2 min)
→ No manual deploy needed!
```

### 2. View Live Logs
```
While cron job runs:
1. Go to Vercel Deployments
2. Click latest deployment
3. Click "Logs" tab
4. Watch in real-time as signals are calculated
5. See Telegram messages being sent
```

### 3. Test Before Deploy
```
Locally in terminal:
npm run build
npm run dev

Visit http://localhost:3000
Test changes before pushing to GitHub
```

### 4. Environment Variable Safety
```
NEVER put API keys in code!
ALWAYS use environment variables:
- Local: .env.local (in .gitignore)
- Production: Vercel Settings tab
```

---

## 🎓 GITHUB DESKTOP TIPS

### View all your changes:
```
Changes tab (left side) shows:
- Red X = deleted
- Yellow circle = modified
- Green + = added
- Blue = renamed
```

### Write good commit messages:
```
Good: "Fix signal lag in 15M timeframe"
Good: "Add risk management checks"
Bad: "update"
Bad: "asdf"
```

### Undo a commit:
```
1. History tab
2. Right-click commit
3. Select "Revert this commit"
4. Push origin
```

### See what changed:
```
1. Changes tab
2. Click filename
3. See line-by-line changes (red=removed, green=added)
```

---

## 📞 SUPPORT RESOURCES

- **Vercel Docs:** https://vercel.com/docs
- **Next.js Docs:** https://nextjs.org/docs
- **GitHub Desktop Help:** https://docs.github.com/en/desktop
- **OANDA API:** https://developer.oanda.com
- **Telegram Bot API:** https://core.telegram.org/bots

---

## ✅ YOU'RE ALL SET!

Your TradeB trading system is:
- ✅ Fully built and tested
- ✅ Ready to deploy to GitHub
- ✅ Ready to deploy to Vercel
- ✅ Ready for live trading

**Next step:** Follow the "5-Minute Quick Start" above to get live!

**Questions?** Check the Comprehensive System Audit document for detailed info.

**Happy trading! 🚀**
