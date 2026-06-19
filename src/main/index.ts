import { app, BrowserWindow, Menu, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { supabaseSync } from './supabase.js';
import { AppStore, getDatabasePath } from './store.js';
import type {
  ChangeMasterPasswordInput,
  ChangePasswordInput,
  CreateEmployeeInput,
  ExportFilters,
  LoginInput,
  MenuAction,
  ResetEmployeePasswordInput,
  ReviewLeaveInput,
  SubmitLeaveInput,
  WizardSetupInput
} from '../shared/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;
const store = new AppStore(getDatabasePath());

const sendMenuAction = (action: MenuAction, payload?: { version?: string }): void => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(action, payload);
  }
};

const installAppMenu = (): void => {
  const currentRole = store.snapshot().currentUser?.role;
  const isManager = currentRole === 'manager';

  const menu = Menu.buildFromTemplate([
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'File',
      submenu: [
        { label: 'Export Time Logs', visible: isManager, enabled: isManager, click: () => sendMenuAction('menu:exportTimeLogs') },
        { label: 'Export Leave Requests', visible: isManager, enabled: isManager, click: () => sendMenuAction('menu:exportLeaveRequests') },
        { type: 'separator' },
        { label: 'Logout', click: () => sendMenuAction('menu:logout') },
        {
          label: 'Exit',
          click: () => sendMenuAction('menu:exit')
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Dashboard', click: () => sendMenuAction('menu:dashboard') },
        { label: 'Time History', click: () => sendMenuAction('menu:timeHistory') },
        { label: 'Leave Request', click: () => sendMenuAction('menu:leaveRequest') },
        { label: 'Leave Status', click: () => sendMenuAction('menu:leaveStatus') },
        { type: 'separator' },
        { label: 'Toggle Theme', click: () => sendMenuAction('menu:toggleTheme') }
      ]
    },
    {
      label: 'Tools',
      submenu: [
        { label: 'Sync Now', click: () => sendMenuAction('menu:syncNow') },
        { label: 'System Status', click: () => sendMenuAction('menu:systemStatus') }
      ]
    },
    {
      label: 'Help',
      submenu: [{ label: 'About', click: () => sendMenuAction('menu:about', { version: app.getVersion() }) }]
    }
  ]);

  Menu.setApplicationMenu(menu);
};

const popupNativeContextMenu = (window: BrowserWindow | null): void => {
  if (!window || window.isDestroyed()) {
    return;
  }

  const menu = Menu.buildFromTemplate([
    { role: 'undo' },
    { role: 'redo' },
    { type: 'separator' },
    { role: 'cut' },
    { role: 'copy' },
    { role: 'paste' },
    { role: 'selectAll' }
  ]);

  menu.popup({ window });
};

const broadcastSnapshot = (): void => {
  installAppMenu();

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app:snapshot-updated');
  }
};

const createWindow = (): void => {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1280,
    minHeight: 720,
    backgroundColor: '#0f1117',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  
  mainWindow.setMenuBarVisibility(false);

  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

app.whenReady().then(async () => {
  createWindow();
  installAppMenu();
  await store.initialize();
  // ✅ 1. Sync on startup
  try {
    await store.syncFromCloud();
  } catch (err) {
    console.warn('[Sync] Startup sync failed:', err);
  }

  // ✅ 2. Sync every 5 minutes
  setInterval(async () => {
    try {
      await store.syncFromCloud();
    } catch (err) {
      console.warn('[Sync] Interval sync failed:', err);
    }
  }, 5 * 60 * 1000);

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

ipcMain.handle('app:snapshot', () => store.snapshot());
ipcMain.handle('sync:reportConnectivity', async (_event, online: boolean) => {
  const snapshot = store.reportConnectivity(Boolean(online));

  if (online) {
    try {
      await store.syncFromCloud();
    } catch (err) {
      console.warn('[Sync] Online sync failed:', err);
    }
  }

  broadcastSnapshot();
  return snapshot;
});
ipcMain.handle('wizard:complete', (_event, input: WizardSetupInput) => {
  const snapshot = store.completeWizard(input);
  broadcastSnapshot();
  return snapshot;
});
ipcMain.handle('auth:login', (_event, input: LoginInput) => {
  const snapshot = store.login(input);
  broadcastSnapshot();
  return snapshot;
});
ipcMain.handle('auth:logout', () => {
  const snapshot = store.logout();
  broadcastSnapshot();
  return snapshot;
});
ipcMain.handle('employee:create', (_event, input: CreateEmployeeInput) => {
  const snapshot = store.createEmployee(input);
  broadcastSnapshot();
  return snapshot;
});
ipcMain.handle('employee:delete', (_event, employeeId: number) => {
  const snapshot = store.deleteEmployee(String(employeeId));
  broadcastSnapshot();
  return snapshot;
});
ipcMain.handle('attendance:clockIn', () => {
  const snapshot = store.clockIn();
  broadcastSnapshot();
  return snapshot;
});
ipcMain.handle('attendance:clockOut', () => {
  const snapshot = store.clockOut();
  broadcastSnapshot();
  return snapshot;
});
ipcMain.handle('leave:submit', (_event, input: SubmitLeaveInput) => {
  const snapshot = store.submitLeaveRequest(input);
  broadcastSnapshot();
  return snapshot;
});
ipcMain.handle('leave:review', (_event, input: ReviewLeaveInput) => {
  const snapshot = store.reviewLeaveRequest(input);
  broadcastSnapshot();
  return snapshot;
});
ipcMain.handle('leave:withdraw', (_event, input: { requestId: number; employeeId: number }) => {
  const snapshot = store.withdrawLeaveRequest(String(input.requestId), String(input.employeeId));
  broadcastSnapshot();
  return snapshot;
});
ipcMain.handle('employee:changePassword', (_event, input: ChangePasswordInput) => {
  const snapshot = store.changePassword(input);
  broadcastSnapshot();
  return snapshot;
});
ipcMain.handle('manager:changeMasterPassword', (_event, input: ChangeMasterPasswordInput) => {
  const snapshot = store.changeMasterPassword(input);
  broadcastSnapshot();
  return snapshot;
});
ipcMain.handle('manager:resetEmployeePassword', (_event, input: ResetEmployeePasswordInput) => {
  const snapshot = store.resetEmployeePassword(input);
  broadcastSnapshot();
  return snapshot;
});
ipcMain.handle('export:timeLogsCsv', (_event, filters: ExportFilters) => store.exportTimeLogsCsv(filters));
ipcMain.handle('export:leaveRequestsCsv', (_event, filters: ExportFilters) => store.exportLeaveRequestsCsv(filters));
ipcMain.handle('sync:now', async () => {
  await store.syncFromCloud();
  broadcastSnapshot();
  return store.snapshot();
});
ipcMain.handle('menu:showContextMenu', (event) => {
  popupNativeContextMenu(BrowserWindow.fromWebContents(event.sender));
});
ipcMain.handle('app:exit', () => {
  app.quit();
});
