#!/bin/bash

# Push all fixes to GitHub
cd /vercel/share/v0-project

# Stage all changes
git add -A

# Commit with message about the fixes
git commit -m "fix: VWAP bias display and signal loading

- Fixed VWAP bias to properly display daily anchor level with BULLISH/BEARISH/NEUTRAL status
- Added explicit checks for VWAP and price data before calculation
- Improved MTF bias viewer layout with dedicated VWAP anchor section
- Enhanced trade level display with risk percentage and 1R/2R labels
- Added debug logging to signal fetch to track data flow
- Fixed loading state initialization in page component
- Signal data now properly displays current trade entry and levels"

# Push to current branch
git push origin HEAD

echo "✓ Fixes pushed to GitHub successfully"
