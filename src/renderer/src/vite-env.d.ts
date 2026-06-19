/// <reference types="vite/client" />

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
} from '../../shared/types';

declare global {
  interface Window {
    ironsApi: {
      getSnapshot: () => Promise<AppSnapshot>;
      reportConnectivity: (online: boolean) => Promise<AppSnapshot>;
      completeWizard: (input: WizardSetupInput) => Promise<AppSnapshot>;
      login: (input: LoginInput) => Promise<AppSnapshot>;
      logout: () => Promise<AppSnapshot>;
      createEmployee: (input: CreateEmployeeInput) => Promise<AppSnapshot>;
      deleteEmployee: (employeeId: number) => Promise<AppSnapshot>;
      clockIn: () => Promise<AppSnapshot>;
      clockOut: () => Promise<AppSnapshot>;
      submitLeaveRequest: (input: SubmitLeaveInput) => Promise<AppSnapshot>;
      reviewLeaveRequest: (input: ReviewLeaveInput) => Promise<AppSnapshot>;
      withdrawLeaveRequest: (input: { requestId: number; employeeId: number }) => Promise<AppSnapshot>;
      changePassword: (input: ChangePasswordInput) => Promise<AppSnapshot>;
      changeMasterPassword: (input: ChangeMasterPasswordInput) => Promise<AppSnapshot>;
      resetEmployeePassword: (input: ResetEmployeePasswordInput) => Promise<AppSnapshot>;
      exportTimeLogsCsv: (filters: ExportFilters) => Promise<string>;
      exportLeaveRequestsCsv: (filters: ExportFilters) => Promise<string>;
      syncNow: () => Promise<AppSnapshot>;
      exitApp: () => Promise<void>;
      showContextMenu: () => Promise<void>;
      onMenuAction: (callback: (action: MenuAction, payload?: { version?: string }) => void) => () => void;
      onSnapshotUpdated: (callback: () => void) => () => void;
    };
  }
}

export {};
