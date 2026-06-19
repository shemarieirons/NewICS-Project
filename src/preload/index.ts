import { contextBridge, ipcRenderer } from 'electron';
import type {
  AppSnapshot,
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

const normalizeErrorMessage = (channel: string, error: unknown): string => {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const strippedMessage = rawMessage
    .replace(/^Error invoking remote method '.*?':\s*/i, '')
    .replace(/^Error:\s*/i, '')
    .trim();

  const friendlyByPattern: Array<[RegExp, string]> = [
    [/invalid employee credentials/i, 'Invalid credentials.'],
    [/username already exists/i, 'Username already exists.'],
    [/current password is incorrect/i, 'Current password is incorrect.'],
    [/invalid date range/i, 'Please select a valid date range.'],
    [/date joined organization must be a valid/i, 'Please enter a valid date.'],
    [/only managers can/i, 'You do not have permission to perform that action.'],
    [/only employees can/i, 'You do not have permission to perform that action.']
  ];

  for (const [pattern, friendly] of friendlyByPattern) {
    if (pattern.test(strippedMessage)) {
      return friendly;
    }
  }

  if (/sql|sqlite|supabase|remote method|ipc|database/i.test(strippedMessage)) {
    if (channel.startsWith('export:')) {
      return 'Could not export data. Please try again.';
    }

    if (channel.startsWith('sync:')) {
      return 'Sync failed. Please try again.';
    }

    if (channel === 'wizard:complete') {
      return 'Setup could not be completed. Please check your details and try again.';
    }

    return 'Something went wrong. Please try again.';
  }

  if (channel === 'auth:login') {
    return 'Invalid credentials.';
  }

  if (channel === 'leave:submit') {
    return 'Please select a valid date range.';
  }

  return strippedMessage || 'Something went wrong. Please try again.';
};

const invokeSafe = async <T>(channel: string, ...args: unknown[]): Promise<T> => {
  try {
    return await ipcRenderer.invoke(channel, ...args);
  } catch (error) {
    throw new Error(normalizeErrorMessage(channel, error));
  }
};

const api = {
  getSnapshot: (): Promise<AppSnapshot> => invokeSafe('app:snapshot'),
  reportConnectivity: (online: boolean): Promise<AppSnapshot> => invokeSafe('sync:reportConnectivity', online),
  completeWizard: (input: WizardSetupInput): Promise<AppSnapshot> => invokeSafe('wizard:complete', input),
  login: (input: LoginInput): Promise<AppSnapshot> => invokeSafe('auth:login', input),
  logout: (): Promise<AppSnapshot> => invokeSafe('auth:logout'),
  createEmployee: (input: CreateEmployeeInput): Promise<AppSnapshot> => invokeSafe('employee:create', input),
  deleteEmployee: (employeeId: number): Promise<AppSnapshot> => invokeSafe('employee:delete', employeeId),
  clockIn: (): Promise<AppSnapshot> => invokeSafe('attendance:clockIn'),
  clockOut: (): Promise<AppSnapshot> => invokeSafe('attendance:clockOut'),
  submitLeaveRequest: (input: SubmitLeaveInput): Promise<AppSnapshot> => invokeSafe('leave:submit', input),
  reviewLeaveRequest: (input: ReviewLeaveInput): Promise<AppSnapshot> => invokeSafe('leave:review', input),
  withdrawLeaveRequest: (input: { requestId: number; employeeId: number }): Promise<AppSnapshot> =>
    invokeSafe('leave:withdraw', input),
  changePassword: (input: ChangePasswordInput): Promise<AppSnapshot> => invokeSafe('employee:changePassword', input),
  changeMasterPassword: (input: ChangeMasterPasswordInput): Promise<AppSnapshot> =>
    invokeSafe('manager:changeMasterPassword', input),
  resetEmployeePassword: (input: ResetEmployeePasswordInput): Promise<AppSnapshot> =>
    invokeSafe('manager:resetEmployeePassword', input),
  exportTimeLogsCsv: (filters: ExportFilters): Promise<string> => invokeSafe('export:timeLogsCsv', filters),
  exportLeaveRequestsCsv: (filters: ExportFilters): Promise<string> => invokeSafe('export:leaveRequestsCsv', filters),
  syncNow: (): Promise<AppSnapshot> => invokeSafe('sync:now'),
  exitApp: (): Promise<void> => invokeSafe('app:exit'),
  showContextMenu: (): Promise<void> => invokeSafe('menu:showContextMenu'),
  onMenuAction: (callback: (action: MenuAction, payload?: { version?: string }) => void): (() => void) => {
    const listeners: Array<[MenuAction, (_event: Electron.IpcRendererEvent, payload?: { version?: string }) => void]> =
      [
        'menu:exportTimeLogs',
        'menu:exportLeaveRequests',
        'menu:logout',
        'menu:exit',
        'menu:dashboard',
        'menu:timeHistory',
        'menu:leaveRequest',
        'menu:leaveStatus',
        'menu:toggleTheme',
        'menu:syncNow',
        'menu:systemStatus',
        'menu:about'
      ].map((action) => [action, (_event, payload) => callback(action, payload)] as const);

    for (const [action, listener] of listeners) {
      ipcRenderer.on(action, listener);
    }

    return () => {
      for (const [action, listener] of listeners) {
        ipcRenderer.removeListener(action, listener);
      }
    };
  },
  onSnapshotUpdated: (callback: () => void): (() => void) => {
    const listener = () => callback();
    ipcRenderer.on('app:snapshot-updated', listener);
    return () => {
      ipcRenderer.removeListener('app:snapshot-updated', listener);
    };
  }
};

contextBridge.exposeInMainWorld('ironsApi', api);
