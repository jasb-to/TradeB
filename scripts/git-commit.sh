#!/bin/bash

# Git commit script for TradeB fixes
cd /vercel/share/v0-project

# Stage all changes
git add -A

# Commit with descriptive message
git commit -m "Fix: Resolve critical indicator error (ADX=0.0, ATR=0.00) causing deployment failures

- Improved indicator validation logic in indicator-cards.tsx to properly detect real errors vs legitimate zero values
- Added type checking and safety defaults for ADX, ATR, RSI in XAU and XAG signal routes
- Prevents false DATA ERROR alerts during market transitions when indicators briefly reset
- Fixes deployment blocking issue on branch v0/jaspalbilkhu-2038-f1d6169b-2"

# Push to remote branch
git push origin v0/jaspalbilkhu-2038-f1d6169b-2

echo "✓ Changes committed and pushed to GitHub"
