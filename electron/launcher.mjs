import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const require = createRequire(import.meta.url);
const electronPath = require('electron');

let shuttingDown = false;
let viteProcess;
let electronProcess;

function stopProcess(child) {
  if (child && !child.killed) {
    child.kill('SIGTERM');
  }
}

function shutdown(exitCode = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  stopProcess(viteProcess);
  stopProcess(electronProcess);
  process.exit(exitCode);
}

async function waitForServer(url, timeoutMs = 30000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { cache: 'no-store' });

      if (response.ok) {
        return;
      }
    } catch {
      // Keep waiting until Vite is ready.
    }

    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  }

  throw new Error(`Timed out waiting for ${url}`);
}

async function main() {
  viteProcess = spawn(
    npmCommand,
    ['run', 'dev', '--', '--host', '127.0.0.1', '--strictPort'],
    {
      cwd: projectRoot,
      env: process.env,
      stdio: 'inherit',
    },
  );

  viteProcess.on('exit', (code) => {
    if (!shuttingDown) {
      shutdown(code ?? 1);
    }
  });

  await waitForServer('http://127.0.0.1:5173');

  electronProcess = spawn(electronPath, ['.'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: 'http://127.0.0.1:5173',
    },
    stdio: 'inherit',
  });

  electronProcess.on('exit', (code) => {
    shutdown(code ?? 0);
  });

  process.on('SIGINT', () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));
}

main().catch((error) => {
  console.error(error);
  shutdown(1);
});
