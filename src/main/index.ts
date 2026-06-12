import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { supabaseSync } from './supabase';
import { AppStore, getDatabasePath } from './store';
import type {
  ChangeMasterPasswordInput,
  ChangePasswordInput,
  CreateEmployeeInput,
  ExportFilters,
  LoginInput,
  ResetEmployeePasswordInput,
  ReviewLeaveInput,
  SubmitLeaveInput,
  WizardSetupInput
} from '../shared/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;
const store = new AppStore(getDatabasePath());

const broadcastSnapshot = (): void => {
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
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

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

app.whenReady().then(() => {
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

ipcMain.handle('app:snapshot', () => store.snapshot());
ipcMain.handle('sync:reportConnectivity', (_event, online: boolean) => {
  const snapshot = store.reportConnectivity(Boolean(online));
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
  const snapshot = store.deleteEmployee(employeeId);
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
  const snapshot = store.withdrawLeaveRequest(input.requestId, input.employeeId);
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
