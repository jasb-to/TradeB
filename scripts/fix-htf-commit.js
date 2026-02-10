import { execSync } from "child_process"

const commitMessage =
  "Fix HTF polarity checklist mismatch - strict A/A+ mode\n\n" +
  "- Explicitly block HTF NONE (undefined) state in entry checklist\n" +
  "- Only show green tick for aligned BULLISH/BEARISH\n" +
  "- Add distinct messaging for NONE vs NEUTRAL vs misaligned states\n" +
  "- Ensure checklist truthfulness matches execution logic\n" +
  "- B-tier disabled, strict mode enforced"

try {
  execSync("git add -A", { cwd: process.cwd(), stdio: "inherit" })
  execSync(`git commit -m "${commitMessage}"`, {
    cwd: process.cwd(),
    stdio: "inherit",
  })
  execSync("git push origin v0/jaspalbilkhu-2038-631ee7ec-4", {
    cwd: process.cwd(),
    stdio: "inherit",
  })
  console.log("[v0] ✅ Changes committed and pushed to GitHub")
} catch (error) {
  console.error("[v0] ❌ Git operation failed:", error)
  process.exit(1)
}
