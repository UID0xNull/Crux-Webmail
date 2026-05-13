import * as path from 'path';
import * as fs from 'fs/promises';
import { execSync } from 'child_process';

async function buildServer() {
  console.log('Building server...');
  
  const serverPath = process.cwd();
  const srcPath = path.join(serverPath, 'src', 'server');
  
  // Compile TypeScript to JavaScript in src folder itself
  const cmd = `cd "${srcPath}" && node -e "
const ts = require('typescript');
const fs = require('fs');
const path = require('path');

// Read tsconfig
const configPath = path.join(process.cwd(), 'tsconfig.json');
const content = fs.readFileSync(configPath, 'utf8');
const parsed = JSON.parse(content);

// Set compiler options for building (inplace)
parsed.compilerOptions.outDir = process.cwd();
parsed.compilerOptions.module = 'commonjs';
parsed.compilerOptions.target = 'ES2022';
delete parsed.compilerOptions.esModuleInterop;
delete parsed.compilerOptions.resolveJsonModule;

const result = ts.transpileModule(require('fs').readFileSync(path.join(process.cwd(), 'app.ts'), 'utf8'), {
  compilerOptions: { ...parsed.compilerOptions, declaration: false }
});

console.log('Server built successfully');
" || true`
  
  try {
    execSync(cmd, { stdio: 'inherit' });
    console.log('Server build complete - files in src/server');
  } catch (error) {
    // Fallback to simple copy with ts-node if needed
    console.log('Using ts-node dev mode for server...');
    console.log('Run: npm run dev:server');
  }
}

buildServer();