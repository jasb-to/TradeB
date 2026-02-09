import subprocess
import sys
import os

try:
    # Use current working directory which should be the project root
    cwd = os.getcwd()
    print(f"[v0] Working directory: {cwd}")
    
    # Stage all changes
    print("[v0] Staging all changes...")
    subprocess.run(["git", "add", "."], cwd=cwd, check=True)
    
    # Check if there are changes to commit
    result = subprocess.run(
        ["git", "diff", "--cached", "--quiet"],
        cwd=cwd
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
            cwd=cwd,
            check=True
        )
        
        # Push to GitHub
        print("[v0] Pushing to GitHub...")
        subprocess.run(
            ["git", "push", "origin", "v0/jaspalbilkhu-2038-ab520cb6-3"],
            cwd=cwd,
            check=True
        )
        print("[v0] Successfully pushed to GitHub!")
    else:
        print("[v0] No changes to commit")
        
except subprocess.CalledProcessError as e:
    print(f"[v0] Git error: {e}", file=sys.stderr)
    sys.exit(1)
except Exception as e:
    print(f"[v0] Unexpected error: {e}", file=sys.stderr)
    sys.exit(1)
