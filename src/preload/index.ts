import { contextBridge, ipcRenderer } from 'electron';
import type {
  AppSnapshot,
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

const api = {
  getSnapshot: (): Promise<AppSnapshot> => ipcRenderer.invoke('app:snapshot'),
  reportConnectivity: (online: boolean): Promise<AppSnapshot> =>
    ipcRenderer.invoke('sync:reportConnectivity', online),
  completeWizard: (input: WizardSetupInput): Promise<AppSnapshot> =>
    ipcRenderer.invoke('wizard:complete', input),
  login: (input: LoginInput): Promise<AppSnapshot> => ipcRenderer.invoke('auth:login', input),
  logout: (): Promise<AppSnapshot> => ipcRenderer.invoke('auth:logout'),
  createEmployee: (input: CreateEmployeeInput): Promise<AppSnapshot> =>
    ipcRenderer.invoke('employee:create', input),
  deleteEmployee: (employeeId: number): Promise<AppSnapshot> =>
    ipcRenderer.invoke('employee:delete', employeeId),
  clockIn: (): Promise<AppSnapshot> => ipcRenderer.invoke('attendance:clockIn'),
  clockOut: (): Promise<AppSnapshot> => ipcRenderer.invoke('attendance:clockOut'),
  submitLeaveRequest: (input: SubmitLeaveInput): Promise<AppSnapshot> =>
    ipcRenderer.invoke('leave:submit', input),
  reviewLeaveRequest: (input: ReviewLeaveInput): Promise<AppSnapshot> =>
    ipcRenderer.invoke('leave:review', input),
  withdrawLeaveRequest: (input: { requestId: number; employeeId: number }): Promise<AppSnapshot> =>
    ipcRenderer.invoke('leave:withdraw', input),
  changePassword: (input: ChangePasswordInput): Promise<AppSnapshot> =>
    ipcRenderer.invoke('employee:changePassword', input),
  changeMasterPassword: (input: ChangeMasterPasswordInput): Promise<AppSnapshot> =>
    ipcRenderer.invoke('manager:changeMasterPassword', input),
  resetEmployeePassword: (input: ResetEmployeePasswordInput): Promise<AppSnapshot> =>
    ipcRenderer.invoke('manager:resetEmployeePassword', input),
  exportTimeLogsCsv: (filters: ExportFilters): Promise<string> =>
    ipcRenderer.invoke('export:timeLogsCsv', filters),
  exportLeaveRequestsCsv: (filters: ExportFilters): Promise<string> =>
    ipcRenderer.invoke('export:leaveRequestsCsv', filters),
  onSnapshotUpdated: (callback: () => void): (() => void) => {
    const listener = () => callback();
    ipcRenderer.on('app:snapshot-updated', listener);
    return () => {
      ipcRenderer.removeListener('app:snapshot-updated', listener);
    };
  }
};

contextBridge.exposeInMainWorld('ironsApi', api);
