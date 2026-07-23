import { app, BrowserWindow, protocol, session } from 'electron';
import { existsSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');
const distDir = resolve(projectRoot, 'dist');
const devServerUrl = process.env.VITE_DEV_SERVER_URL ?? 'http://127.0.0.1:5173';
const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const allowedPermissions = new Set(['media', 'display-capture']);

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
    },
  },
]);

function isTrustedOrigin(origin) {
  if (typeof origin !== 'string' || origin.length === 0) {
    return false;
  }

  try {
    const parsed = new URL(origin);

    if (parsed.protocol === 'app:') {
      return true;
    }

    return (
      parsed.protocol === 'http:' &&
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') &&
      (parsed.port === '5173' || parsed.port === '')
    );
  } catch {
    return false;
  }
}

function registerProductionProtocol() {
  protocol.handle('app', (request) => {
    const requestUrl = new URL(request.url);
    const pathname = decodeURIComponent(requestUrl.pathname || '/').replace(/^\/+/, '');
    const candidatePath = pathname === '' ? 'index.html' : pathname;
    const filePath = resolve(distDir, candidatePath);
    const indexPath = resolve(distDir, 'index.html');
    const relativePath = relative(distDir, filePath);

    if (relativePath.startsWith('..') || !existsSync(filePath)) {
      return { path: indexPath };
    }

    return { path: filePath };
  });
}

function configurePermissions() {
  const permissionCheckHandler = (_webContents, permission, requestingOrigin, details) => {
    const securityOrigin = details?.securityOrigin ?? requestingOrigin;
    return allowedPermissions.has(permission) && isTrustedOrigin(securityOrigin);
  };

  const permissionRequestHandler = (webContents, permission, callback) => {
    callback(allowedPermissions.has(permission) && isTrustedOrigin(webContents.getURL()));
  };

  session.defaultSession.setPermissionCheckHandler(permissionCheckHandler);
  session.defaultSession.setPermissionRequestHandler(permissionRequestHandler);
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 720,
    backgroundColor: '#0b0d10',
    autoHideMenuBar: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: resolve(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
    },
  });

  if (isDev) {
    void mainWindow.loadURL(devServerUrl);
    return mainWindow;
  }

  void mainWindow.loadURL('app://-/index.html');
  return mainWindow;
}

app.whenReady().then(() => {
  if (!isDev) {
    registerProductionProtocol();
  }

  configurePermissions();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
