const path = require('path');
const fs = require('fs');
const { execSync, spawn } = require('child_process');

const APP_NAME = "SFMS_Agent";
const appDataPath = process.env.APPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Roaming');
const installDir = path.join(appDataPath, 'SFMSAgent');
const targetExePath = path.join(installDir, `${APP_NAME}.exe`);
const currentExePath = process.execPath;

// 1. SELF-INSTALLATION CHECK (Must run FIRST)
if (path.resolve(currentExePath) !== path.resolve(targetExePath)) {
  try {
    // Create AppData directory
    if (!fs.existsSync(installDir)) {
      fs.mkdirSync(installDir, { recursive: true });
    }

    // Copy .exe to AppData
    fs.copyFileSync(currentExePath, targetExePath);

    // Add to Windows Registry Startup
    const regCommand = `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "${APP_NAME}" /t REG_SZ /d "\\"${targetExePath}\\\"" /f`;
    execSync(regCommand, { stdio: 'ignore' });

    // Spawn the permanent instance from AppData
    spawn(targetExePath, [], {
      detached: true,
      stdio: 'ignore'
    }).unref();

    // Kill the temporary downloaded file immediately
    process.exit(0);
  } catch (err) {
    process.exit(1);
  }
}

// 2. YOUR AGENT APP STARTS HERE (Runs ONLY from AppData)
process.title = "SFMS Agent";
console.log = function() {}; // Silence terminal logs

require('./src/server'); // <--- Load server code ONLY AFTER moving to AppData