import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

console.log('[v0] Starting git push process...');
console.log('[v0] Project root:', projectRoot);

try {
  // Change to project directory
  process.chdir(projectRoot);
  
  // Get current branch
  const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
  console.log('[v0] Current branch:', currentBranch);
  
  // Stage all changes
  console.log('[v0] Staging changes...');
  execSync('git add -A', { encoding: 'utf-8' });
  
  // Check if there are changes to commit
  const status = execSync('git status --porcelain', { encoding: 'utf-8' }).trim();
  
  if (!status) {
    console.log('[v0] No changes to commit');
    process.exit(0);
  }
  
  // Create commit
  const commitMessage = 'fix: VWAP bias display, signal loading, and trade level enhancements';
  console.log('[v0] Creating commit:', commitMessage);
  execSync(`git commit -m "${commitMessage}"`, { encoding: 'utf-8' });
  
  // Push to remote
  console.log('[v0] Pushing to remote on branch:', currentBranch);
  execSync(`git push origin ${currentBranch}`, { encoding: 'utf-8' });
  
  console.log('[v0] Successfully pushed fixes to GitHub!');
  process.exit(0);
} catch (error) {
  console.error('[v0] Error during git push:', error.message);
  process.exit(1);
}
