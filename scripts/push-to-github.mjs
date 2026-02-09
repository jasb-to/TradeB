import { execSync } from 'child_process';

try {
  console.log('Adding all changes...');
  execSync('git add .', { stdio: 'inherit' });
  
  console.log('Creating commit...');
  execSync('git commit -m "fix: reconcile tier and score consistency in entry decisions"', { stdio: 'inherit' });
  
  console.log('Pushing to GitHub...');
  execSync('git push origin v0/jaspalbilkhu-2038-ab520cb6-3', { stdio: 'inherit' });
  
  console.log('✓ Changes pushed to GitHub successfully');
} catch (error) {
  console.error('Error pushing to GitHub:', error.message);
  process.exit(1);
}
