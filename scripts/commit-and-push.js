#!/usr/bin/env node
/**
 * Git commit and push script for TradeB
 * Commits all changes and pushes to the current branch
 */

import { execSync } from "child_process"

const commitMessage = "fix: remove B-tier evaluator/tracker dead code and migrate middleware to proxy.js\n\n- Remove BTradeEvaluator and BTradeTracker imports from external-cron and system-diagnostics\n- Remove B-tier stats from system diagnostics endpoint\n- Migrate middleware.ts to proxy.js per Next.js 16 conventions\n- Fix build errors from missing B-trade modules"

try {
  console.log("[v0] Staging changes...")
  execSync("git add -A", { stdio: "inherit" })

  console.log("[v0] Committing changes...")
  execSync(`git commit -m "${commitMessage}"`, { stdio: "inherit" })

  console.log("[v0] Pushing to remote...")
  execSync("git push", { stdio: "inherit" })

  console.log("[v0] ✅ Successfully pushed to GitHub!")
  process.exit(0)
} catch (error) {
  console.error("[v0] ❌ Git operation failed:", error.message)
  process.exit(1)
}
