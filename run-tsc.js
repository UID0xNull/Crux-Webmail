const { execSync } = require('child_process');
const fs = require('fs');
try {
  const result = execSync('npx tsc --noEmit', { encoding: 'utf8', maxBuffer: 1024 * 1024 });
  fs.writeFileSync('tsc-errors.txt', result || 'No errors found');
  process.exit(0);
} catch (err) {
  fs.writeFileSync('tsc-errors.txt', err.stdout || err.stderr || 'Unknown error');
  process.exit(1);
}