import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function commitAndPush() {
  try {
    console.log('[v0] Starting git commit process...');
    
    // Stage all changes
    await execAsync('git add -A', { cwd: '/vercel/share/v0-project' });
    console.log('[v0] ✓ Staged changes');
    
    // Commit with detailed message
    const commitMsg = `Fix: Resolve critical indicator error (ADX=0.0, ATR=0.00) causing deployment failures

- Improved indicator validation logic in indicator-cards.tsx to properly detect real errors vs legitimate zero values
- Added type checking and safety defaults for ADX, ATR, RSI in XAU and XAG signal routes
- Prevents false DATA ERROR alerts during market transitions when indicators briefly reset
- Fixes deployment blocking issue on branch v0/jaspalbilkhu-2038-f1d6169b-2`;
    
    await execAsync(`git commit -m "${commitMsg}"`, { cwd: '/vercel/share/v0-project' });
    console.log('[v0] ✓ Committed changes');
    
    // Push to remote
    await execAsync('git push origin v0/jaspalbilkhu-2038-f1d6169b-2', { cwd: '/vercel/share/v0-project' });
    console.log('[v0] ✓ Pushed to GitHub');
    
    console.log('\n✓ All fixes committed and pushed successfully!');
  } catch (error) {
    console.error('[v0] Git operation failed:', error.message);
    process.exit(1);
  }
}

commitAndPush();
