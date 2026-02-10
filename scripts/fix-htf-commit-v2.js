import { execSync } from "child_process"
import path from "path"

const projectDir = "/vercel/share/v0-project"

try {
  // Change to project directory and execute git commands
  console.log("[v0] Starting git operations in:", projectDir)

  // Add all changes
  execSync("git add -A", { cwd: projectDir, stdio: "inherit" })

  // Commit with message
  execSync(
    'git commit -m "fix: Align HTF polarity checklist - explicit handling of NONE, NEUTRAL, and mismatch states"',
    { cwd: projectDir, stdio: "inherit" }
  )

  // Push to current branch
  execSync("git push origin HEAD", { cwd: projectDir, stdio: "inherit" })

  console.log("[v0] ✅ Git operations completed successfully")
} catch (error) {
  console.error("[v0] ❌ Git operation failed:", error.message)
  process.exit(1)
}
