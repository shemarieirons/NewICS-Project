export type Role = 'employee' | 'manager';

export interface CurrentUser {
  id: number;
  role: Role;
  displayName: string;
  username: string;
}

export interface EmployeeRecord {
  id: number;
  firstName: string;
  lastName: string;
  username: string;
  dob: string;
  createdAt: string;
  passwordChanged: boolean;
  defaultPassword?: string;
}

export interface AttendanceSessionRecord {
  id: number;
  employeeId: number;
  employeeName: string;
  clockInAt: string;
  clockOutAt: string | null;
  synced: boolean;
}

export interface LeaveRequestRecord {
  id: number;
  employeeId: number;
  employeeName: string;
  type: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  managerComment: string | null;
  createdAt: string;
  updatedAt: string;
  synced: boolean;
}

export interface SyncState {
  connected: boolean;
  pendingActions: number;
  lastSyncedAt: string | null;
  message: string;
}

export interface AppSnapshot {
  wizardComplete: boolean;
  currentUser: CurrentUser | null;
  sync: SyncState;
  employees: EmployeeRecord[];
  attendanceSessions: AttendanceSessionRecord[];
  leaveRequests: LeaveRequestRecord[];
}

export interface WizardSetupInput {
  supabaseUrl: string;
  supabaseAnonKey: string;
  masterPassword: string;
}

export interface LoginInput {
  role: Role;
  username?: string;
  password: string;
}

export interface CreateEmployeeInput {
  firstName: string;
  lastName: string;
  username: string;
  dob: string;
}

export interface SubmitLeaveInput {
  employeeId: number;
  type?: string;
  startDate: string;
  endDate: string;
  reason: string;
}

export interface ReviewLeaveInput {
  requestId: number;
  status: 'approved' | 'rejected';
  comment?: string;
}

export interface ChangePasswordInput {
  employeeId: number;
  currentPassword: string;
  newPassword: string;
}

export interface ChangeMasterPasswordInput {
  currentPassword: string;
  newPassword: string;
}

export interface ResetEmployeePasswordInput {
  employeeId: number;
  newPassword: string;
}

export interface ExportFilters {
  employeeId?: number;
  status?: 'pending' | 'approved' | 'rejected';
  fromDate?: string;
  toDate?: string;
}
