import subprocess
import sys

try:
    # Stage all changes
    print("[v0] Staging all changes...")
    subprocess.run(["git", "add", "."], cwd="/vercel/share/v0-project", check=True)
    
    # Check if there are changes to commit
    result = subprocess.run(
        ["git", "diff", "--cached", "--quiet"],
        cwd="/vercel/share/v0-project"
    )
    
    if result.returncode != 0:
        # Changes exist, commit them
        print("[v0] Committing changes...")
        subprocess.run(
            [
                "git",
                "commit",
                "-m",
                "Fix: Ensure tier/score consistency in entry decisions"
            ],
            cwd="/vercel/share/v0-project",
            check=True
        )
        
        # Push to GitHub
        print("[v0] Pushing to GitHub...")
        subprocess.run(
            ["git", "push", "origin", "v0/jaspalbilkhu-2038-ab520cb6-3"],
            cwd="/vercel/share/v0-project",
            check=True
        )
        print("[v0] ✓ Successfully pushed to GitHub!")
    else:
        print("[v0] No changes to commit")
        
except subprocess.CalledProcessError as e:
    print(f"[v0] Error: {e}", file=sys.stderr)
    sys.exit(1)
except Exception as e:
    print(f"[v0] Unexpected error: {e}", file=sys.stderr)
    sys.exit(1)
