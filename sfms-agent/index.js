const path = require('path');
const fs = require('fs');
const { execFileSync, spawn } = require('child_process');
const net = require('net');

const APP_NAME = "SFMS_Agent";
const appDataPath = process.env.APPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Roaming');
const installDir = path.join(appDataPath, 'SFMSAgent');
const targetExePath = path.join(installDir, `${APP_NAME}.exe`);
const vbsLauncherPath = path.join(installDir, `${APP_NAME}_Launcher.vbs`);
const currentExePath = process.execPath;
const logPath = path.join(appDataPath, 'SFMSAgent_bootstrap.log');

function log(message) {
  try {
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${message}\n`);
  } catch (_) {}
}

process.on('uncaughtException', (err) => {
  log(`UNCAUGHT EXCEPTION: ${err.stack || err.message}`);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  log(`UNHANDLED REJECTION: ${reason?.stack || reason}`);
  process.exit(1);
});

// Writes a tiny VBScript that launches the exe with window style 0 (hidden).
// This is what Task Scheduler will actually invoke, instead of the exe
// directly — Windows never allocates a visible console for a wscript-run
// child process launched this way.
function writeVbsLauncher() {
  const content =
    `Set objShell = CreateObject("WScript.Shell")\r\n` +
    `objShell.Run Chr(34) & "${targetExePath}" & Chr(34), 0, False\r\n`;
  fs.writeFileSync(vbsLauncherPath, content);
}

function registerAutoStart() {
  try {
    execFileSync('schtasks', ['/Delete', '/TN', APP_NAME, '/F'], { stdio: 'ignore' });
  } catch (_) { /* task didn't exist — fine */ }

  execFileSync('schtasks', [
    '/Create',
    '/TN', APP_NAME,
    '/TR', `wscript.exe "${vbsLauncherPath}"`,
    '/SC', 'ONLOGON',
    '/RL', 'LIMITED',
    '/F',
  ], { stdio: 'ignore' });
}

function registerProtocolHandler() {
  if (process.platform !== 'win32') return;
  const exePath = process.execPath;

  const commands = [
    `reg add "HKCU\\Software\\Classes\\sfms-agent" /ve /d "URL:SFMS Agent Protocol" /f`,
    `reg add "HKCU\\Software\\Classes\\sfms-agent" /v "URL Protocol" /d "" /f`,
    `reg add "HKCU\\Software\\Classes\\sfms-agent\\shell\\open\\command" /ve /d "\\"${exePath}\\"" /f`,
  ];
  commands.forEach((cmd) => {
    exec(cmd, (error) => {
      if (error) console.error('Protocol registration step failed:', error.message);
    });
  });
}

// If the Agent is already running and the browser fires sfms-agent://start
// again (e.g. the user double-clicks it, or it wasn't actually stopped),
// this second instance should exit quietly instead of crashing on the
// already-bound port.
function isPortInUse(port) {
  return new Promise((resolve) => {
    const tester = net.createConnection({ port, host: '127.0.0.1' });
    tester.once('connect', () => { tester.end(); resolve(true); });
    tester.once('error', () => resolve(false));
  });
}

function removeStaleRunKey() {
  try {
    execFileSync('reg', [
      'delete',
      'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
      '/v', APP_NAME,
      '/f',
    ], { stdio: 'ignore' });
  } catch (_) { /* key didn't exist — fine */ }
}

// 1. SELF-INSTALLATION CHECK
if (path.resolve(currentExePath) !== path.resolve(targetExePath)) {
  log(`Self-install starting. currentExePath=${currentExePath} targetExePath=${targetExePath}`);

  try {
    if (!fs.existsSync(installDir)) {
      fs.mkdirSync(installDir, { recursive: true });
      log('Created install directory.');
    }
    fs.copyFileSync(currentExePath, targetExePath);
    log('Copied exe to AppData successfully.');

    writeVbsLauncher();
    log('Wrote hidden-launch VBS wrapper.');
  } catch (err) {
    log(`FATAL: copy/vbs step failed: ${err.stack || err.message}`);
    process.exit(1);
  }

  try {
    removeStaleRunKey();
    registerAutoStart();
    log('Task Scheduler registration succeeded (via hidden VBS launcher).');
  } catch (err) {
    log(`WARNING: auto-start registration failed (agent will still run this session): ${err.stack || err.message}`);
  }

  try {
    // windowsHide prevents a console window even on this first manual launch's spawn
    const child = spawn(targetExePath, [], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();
    log(`Spawned persistent instance, PID ${child.pid}.`);
  } catch (err) {
    log(`FATAL: failed to spawn persistent instance: ${err.stack || err.message}`);
    process.exit(1);
  }

  log('Self-install complete, exiting bootstrap instance.');
  process.exit(0);
}

// 2. AGENT APP STARTS HERE (running from the correct AppData path)
log('Running as installed instance — starting server.');
process.title = "SFMS Agent";
console.log = function() {};

require('./src/server');