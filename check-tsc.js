const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const tscPath = path.join(__dirname, 'node_modules', 'typescript', 'lib', 'tsc.js');

console.log('Running tsc from:', tscPath);
console.log('File exists:', fs.existsSync(tscPath));

const { spawnSync } = require('child_process');

const result = spawnSync('node', [tscPath, '--noEmit'], {
  cwd: __dirname,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
  maxBuffer: 10 * 1024 * 1024
});

const output = (result.stdout || '') + (result.stderr || '');
fs.writeFileSync(path.join(__dirname, 'tsc-result.txt'), output || 'SUCCESS: No compilation errors');

console.log('Exit code:', result.status);
process.exit(result.status || 0);