import { exec } from "child_process"
import { promisify } from "util"

const execAsync = promisify(exec)

export async function POST() {
  try {
    // Stage all changes
    await execAsync("git add .")

    // Get current branch
    const { stdout: branch } = await execAsync("git rev-parse --abbrev-ref HEAD")
    const currentBranch = branch.trim()

    // Commit with timestamp
    const timestamp = new Date().toISOString()
    await execAsync(`git commit -m "Auto-push: ${timestamp}" || true`)

    // Push to current branch
    await execAsync(`git push origin ${currentBranch}`)

    return Response.json({
      success: true,
      message: `Changes pushed to ${currentBranch}`,
      branch: currentBranch,
    })
  } catch (error) {
    console.error("[v0] GitHub push error:", error)
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to push changes",
      },
      { status: 500 }
    )
  }
}
