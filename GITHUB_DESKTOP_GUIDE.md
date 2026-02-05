# 🖥️ GITHUB DESKTOP: STEP-BY-STEP VISUAL GUIDE

**Complete walkthrough with screenshots descriptions**

---

## PART A: FIRST-TIME SETUP (if code not on GitHub yet)

### Step 1: Install GitHub Desktop

1. Go to: https://desktop.github.com/
2. Click "Download for macOS"
3. Wait for download complete
4. Open "GitHub Desktop.dmg" from Downloads
5. Drag GitHub Desktop to Applications folder
6. Open Applications folder
7. Double-click "GitHub Desktop"
8. Click "Install"

### Step 2: Sign In

In GitHub Desktop:

1. Click "GitHub Desktop" (top menu) → "Preferences"
2. Click "Accounts" tab
3. Click "Sign in" button
4. Enter your GitHub email
5. Enter your GitHub password
6. Click "Sign in"
7. You'll see a browser popup - click "Authorize"
8. Close browser window
9. Close Preferences
10. You're signed in! ✅

**If you don't have a GitHub account:**
- Go to github.com
- Click "Sign up"
- Create account with email/password
- Return and sign in to GitHub Desktop

### Step 3: Add Your Local Repository

In GitHub Desktop:

1. Click "File" menu (top left)
2. Select "Add Local Repository"
3. Click "Choose..." button
4. Navigate to:
   ```
   Users → bilkhumacmini → Documents → VS Projects → TradeB
   ```
5. Click "Open" button
6. You'll see a popup asking about initializing repo
7. Click "Create a Git Repository"
8. Choose "Local setup" (not GitHub)
9. Click "Create Repository"

**Result:** Your folder is now a Git repository ✅

### Step 4: Create First Commit

In GitHub Desktop:

**Left sidebar shows:**
- Current Branch: "No branches"
- Changes section (shows all modified files)

**Bottom left area - Commit section:**

1. Click in "Summary" field (required)
2. Type: `Initial commit: TradeB trading system`
3. Click in "Description" field (optional)
4. Type: `Complete trading system with frontend, backend, strategy, and alerts`
5. Click "Commit to main" button (red button)

**Result:** First commit created ✅

### Step 5: Publish to GitHub

In GitHub Desktop:

1. You'll see "Publish Repository" button (top right, gray box)
2. Click it
3. Set repository options:
   - **Name:** tradeb (already filled)
   - **Description:** XAU/XAG trading system with signals and alerts
   - **Visibility:** Choose:
     - Public = anyone can see code
     - Private = only you can see
4. Click "Publish Repository" button
5. Wait for upload (might take 1-2 min)

**Result:** Your code is now on GitHub! ✅

**Your repo is at:** `https://github.com/YOUR_USERNAME/tradeb`

---

## PART B: EVERYDAY SYNC (pushing updates)

### When You Make Code Changes:

1. **Edit code in VS Code** (as normal)
2. **Switch to GitHub Desktop** (click dock icon)
3. **See automatic detection:**
   - Left sidebar shows "Changes" count
   - List shows which files changed (color coding):
     - Yellow circle = modified
     - Green + = new files
     - Red X = deleted

4. **Commit the changes:**
   ```
   Lower left corner:
   ├─ Summary: (required) - what you changed
   │  Examples:
   │  "Fix signal calculation bug"
   │  "Add XAG support"
   │  "Update risk parameters"
   │  "Improve Telegram alerts"
   │  "Optimize cron job"
   │
   ├─ Description: (optional) - more details
   │
   └─ [Commit to main] button
   ```

5. **Click "Commit to main"** button
6. **Then click "Push origin"** (top right)
   - This sends changes to GitHub

**Result:** Changes synced to GitHub ✅

---

## PART C: DEPLOY TO VERCEL

### Step 1: Go to Vercel

1. Open browser
2. Go to: https://vercel.com
3. Click "Sign up"
4. Click "Continue with GitHub"
5. Authorize Vercel to access GitHub
6. Complete account setup

### Step 2: Import Project

1. In Vercel dashboard, click "Add New..."
2. Select "Project"
3. See list of your GitHub repositories
4. Find and click "tradeb" repo
5. Click "Import" button

### Step 3: Configure Project

Vercel shows configuration screen:

**Defaults are usually correct:**
- Project Name: tradeb
- Framework: Next.js (auto-detected)
- Build Command: `npm run build` (auto-filled)
- Output Directory: `.next` (auto-filled)

**Don't change unless needed. Just click "Deploy"**

### Step 4: Wait for Build

You'll see build progress:
```
📦 Building...
✅ Build complete
🚀 Deploying...
✅ Deployment successful
```

Takes about 1-2 minutes.

### Step 5: Set Environment Variables

**IMPORTANT: Do this now or site won't work properly!**

1. In Vercel dashboard (project page)
2. Click "Settings" (left menu)
3. Scroll down and click "Environment Variables"
4. Add each variable by clicking "Add Variable":

   **Variable 1:**
   - Name: `OANDA_API_KEY`
   - Value: `[your OANDA API key from oanda.com]`
   - Click "Add"

   **Variable 2:**
   - Name: `OANDA_ACCOUNT_ID`
   - Value: `[your account ID]`
   - Click "Add"

   **Variable 3:**
   - Name: `TELEGRAM_BOT_TOKEN`
   - Value: `[token from @BotFather]`
   - Click "Add"

   **Variable 4:**
   - Name: `TELEGRAM_CHAT_ID`
   - Value: `[your Telegram chat ID]`
   - Click "Add"

   **Variable 5:**
   - Name: `CRON_SECRET`
   - Value: `[random string like: abc123def456ghi789jkl012mno345pqr]`
   - Click "Add"

5. After adding all 5, click "Save"
6. Vercel auto-redeploys with env vars

### Step 6: Get Your Live Domain

In Vercel:
1. Click "Deployments" tab
2. See latest deployment with ✅ checkmark
3. Click on it
4. Copy the domain at top: `tradeb-XXXX.vercel.app`
5. Click it or paste in browser
6. You'll see your live trading dashboard!

**Your site is now live at:** `https://tradeb-XXXX.vercel.app`

---

## PART D: SETUP TELEGRAM ALERTS

### Step 1: Create Telegram Bot

1. Open Telegram app (on phone or desktop)
2. Search for: `@BotFather`
3. Click "Start" or type `/start`
4. BotFather will ask questions
5. Type: `/newbot`
6. Answer questions:
   - "What's your bot's name?" → "TradeB Bot" (or any name)
   - "Choose a username..." → "tradeb_bot" or "mytrade_bot" etc
7. BotFather gives you: **TELEGRAM_BOT_TOKEN** (save this!)

### Step 2: Get Your Chat ID

1. In Telegram, start chat with your new bot (click its name)
2. Type any message and send it (e.g., "hello")
3. Bot responds
4. Open web browser
5. Go to: `https://api.telegram.org/botTELEGRAM_BOT_TOKEN/getUpdates`
   - Replace `TELEGRAM_BOT_TOKEN` with the actual token
6. You'll see JSON response
7. Look for: `"chat": {"id": 123456789`
8. That number (123456789) is your **TELEGRAM_CHAT_ID**

### Step 3: Add to Vercel Environment Variables

Back in Vercel dashboard:

1. Click "Settings"
2. Click "Environment Variables"
3. Click "Add Variable"
   - Name: `TELEGRAM_BOT_TOKEN`
   - Value: [paste the token from BotFather]
   - Click "Add"
4. Click "Add Variable"
   - Name: `TELEGRAM_CHAT_ID`
   - Value: [paste your chat ID number]
   - Click "Add"
5. Click "Save"

**Result:** Telegram alerts enabled! ✅

### Step 4: Test Telegram

1. Go to: `https://tradeb-XXXX.vercel.app/api/test-telegram`
   - Replace tradeb-XXXX with your actual domain
2. You should see: `{"success": true}`
3. Check Telegram app - you should receive test message!

---

## PART E: SETUP CRON JOBS

### Step 1: Create Cron Account

1. Open browser
2. Go to: https://cron-job.org
3. Click "Sign Up" (or "Login" if existing account)
4. Create account (email, password)
5. Verify email

### Step 2: Create Cronjob

1. In cron-job.org, click "Create Cronjob"
2. Fill in the form:

   **Title field:**
   ```
   TradeB Signal Generator
   ```

   **URL field:**
   ```
   https://tradeb-XXXX.vercel.app/api/external-cron?secret=YOUR_CRON_SECRET
   
   Replace:
   - tradeb-XXXX with your actual Vercel domain
   - YOUR_CRON_SECRET with the value you put in CRON_SECRET env var
   
   Example:
   https://tradeb-abc123.vercel.app/api/external-cron?secret=abc123def456ghi789jkl012mno345pqr
   ```

   **Execution time:**
   ```
   Every hour at :00
   
   In "Schedule" field, choose:
   - Day of week: All (Mon-Sun)
   - Hour: Every hour (or select *01:00*, *02:00*, etc)
   - Minute: :00
   
   Or enter cron expression: 0 * * * *
   ```

   **Email on failure:**
   ```
   Your email address
   (you'll get notified if cron fails)
   ```

3. Click "Create" button
4. You'll see confirmation

### Step 3: Test Cronjob

1. In cron-job.org dashboard
2. Find your newly created cronjob
3. Click "Execution" tab
4. See "Test execution" button
5. Click it - it triggers now
6. Wait 10 seconds
7. See result (green ✅ = success, red ❌ = error)

**If success:**
- Vercel received the call
- Signals were calculated
- Telegram alerts sent (if configured)

**If error:**
- Check URL is correct
- Check CRON_SECRET matches
- Check Vercel logs for details

---

## PART F: VERIFY EVERYTHING WORKS

### Checklist

1. **Frontend loads?**
   ```
   Visit: https://tradeb-XXXX.vercel.app
   Should see dashboard with XAU/XAG signals
   Should update every 30 seconds
   ```

2. **API responds?**
   ```
   https://tradeb-XXXX.vercel.app/api/signal/xau
   Should see JSON with signal data
   ```

3. **Telegram works?**
   ```
   https://tradeb-XXXX.vercel.app/api/test-telegram
   Check Telegram app for test message
   Should say "TELEGRAM TEST SUCCESSFUL"
   ```

4. **Cron runs?**
   ```
   Check cron-job.org dashboard
   Should show "Execution successful"
   (or check Vercel logs for /api/external-cron calls)
   ```

5. **No errors in logs?**
   ```
   Vercel → Deployments → Latest → Logs
   Should NOT see any error messages
   Should see signal calculations
   ```

**If all 5 pass:** You're fully operational! ✅

---

## TROUBLESHOOTING GITHUB DESKTOP

### Problem: "Failed to push"

**Solution:**
1. Click "Branch" menu
2. Click "Merge into Current Branch"
3. Select "main"
4. Click "Merge"
5. Try push again

### Problem: "Current Branch has no remote"

**Solution:**
1. Click "Publish Repository" button
2. Set visibility (Public/Private)
3. Click "Publish Repository"

### Problem: "Can't see your commits"

**Solution:**
1. Click "History" tab (left side)
2. See all your commits listed
3. Click on one to see what changed

### Problem: "Want to undo last commit"

**Solution:**
1. Click "History" tab
2. Right-click the commit
3. Select "Revert this commit"
4. Click "Push origin"

### Problem: "GitHub Desktop won't open"

**Solution:**
1. Force quit (Cmd + Option + Esc)
2. Select GitHub Desktop
3. Click "Force Quit"
4. Reopen from Applications folder

---

## QUICK COMMAND REFERENCE

### If you prefer terminal (optional):

```bash
# Initialize repo (first time)
cd "/Users/bilkhumacmini/Documents/VS Projects/TradeB"
git init
git add .
git commit -m "Initial commit: TradeB trading system"

# Add GitHub remote (first time)
git remote add origin https://github.com/YOUR_USERNAME/tradeb.git
git branch -M main
git push -u origin main

# Everyday workflow
git add .
git commit -m "Your change description"
git push origin main
```

---

## VIDEO TUTORIALS (if helpful)

- GitHub Desktop basics: https://www.youtube.com/watch?v=ghXbtblKuc0
- Vercel deployment: https://www.youtube.com/watch?v=H7KdAL0KqGM
- Telegram bot setup: https://www.youtube.com/watch?v=aoz4d0hl9xo

---

## YOU'RE READY! 🎉

You now know how to:
✅ Set up GitHub Desktop
✅ Commit and push code
✅ Deploy to Vercel
✅ Configure environment variables
✅ Setup Telegram alerts
✅ Configure cron jobs
✅ Monitor your system

**Your TradeB system is fully operational!**

Go to: `https://tradeb-XXXX.vercel.app` and start trading! 🚀
