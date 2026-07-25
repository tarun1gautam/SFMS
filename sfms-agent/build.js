const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const rceditModule = require('rcedit');
const rcedit = [
  rceditModule,
  rceditModule?.default,
  rceditModule?.rcedit,
  rceditModule?.default?.default,
].find(candidate => typeof candidate === 'function');

if (!rcedit) {
  console.error('rcedit module shape:', rceditModule);
  throw new Error(
    `Could not resolve rcedit as a callable function. Module keys: ${Object.keys(rceditModule || {}).join(', ') || '(none)'}`
  );
}

const exePath = path.resolve(__dirname, 'dist', 'SFMS_Agent.exe');

function stopRunningProcesses() {
  try {
    execSync('taskkill /f /im SFMS_Agent.exe', { stdio: 'ignore' });
  } catch (e) {
    // Process wasn't running
  }
}

async function applyRceditWithRetry(filePath, options, retries = 5, delayMs = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      await rcedit(filePath, options);
      return;
    } catch (err) {
      const isLockError = err.code === 'EBUSY' || err.code === 'EPERM';
      if (!isLockError || i === retries - 1) throw err;
      console.log(`⚠️ File locked. Retrying in ${delayMs / 1000}s... (${i + 1}/${retries})`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function build() {
  console.log('0. Stopping any active SFMS_Agent processes...');
  stopRunningProcesses();

  console.log('1. Compiling executable with pkg...');
  const distDir = path.dirname(exePath);
  if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });

  execSync('pkg . --targets node18-win-x64 --output dist/SFMS_Agent.exe', { stdio: 'inherit' });

  console.log('✅ Build completed successfully (metadata step skipped).');
}

build().catch((err) => {
  console.error('❌ Build failed:', err);
  process.exit(1);
});