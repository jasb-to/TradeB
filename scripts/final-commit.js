import { execSync } from "child_process"
import fs from "fs"
import path from "path"

const gitCommands = [
  "git add -A",
  'git commit -m "fix: StochRSI bias scoring - use momentum state instead of overbought/oversold thresholds + add exit alerts integrity audit"',
  "git push origin v0/jaspalbilkhu-2038-631ee7ec-4"
]

console.log("[v0] Starting git commit and push...")

try {
  for (const cmd of gitCommands) {
    console.log(`[v0] Executing: ${cmd}`)
    const output = execSync(cmd, { cwd: "/vercel/share/v0-project", encoding: "utf-8" })
    console.log(output)
  }
  console.log("[v0] ✅ Successfully committed and pushed to GitHub")
} catch (error) {
  console.error("[v0] ❌ Git error:", error instanceof Error ? error.message : String(error))
  process.exit(1)
}
