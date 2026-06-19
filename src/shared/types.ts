export type Role = 'employee' | 'manager';

export type MenuAction =
  | 'menu:exportTimeLogs'
  | 'menu:exportLeaveRequests'
  | 'menu:logout'
  | 'menu:exit'
  | 'menu:dashboard'
  | 'menu:timeHistory'
  | 'menu:leaveRequest'
  | 'menu:leaveStatus'
  | 'menu:toggleTheme'
  | 'menu:syncNow'
  | 'menu:systemStatus'
  | 'menu:about';

export interface CurrentUser {
  id: string;
  role: Role;
  displayName: string;
  username: string;
}

export interface EmployeeRecord {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  dateJoined: string;
  createdAt: string;
  passwordChanged: boolean;
  defaultPassword?: string;
}

export interface AttendanceSessionRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  clockInAt: string;
  clockOutAt: string | null;
  synced: boolean;
}

export interface LeaveRequestRecord {
  id: string;
  employeeId: string;
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
  dateJoined: string;
}

export interface SubmitLeaveInput {
  employeeId: string;
  type?: string;
  startDate: string;
  endDate: string;
  reason: string;
}

export interface ReviewLeaveInput {
  requestId: string;
  status: 'approved' | 'rejected';
  comment?: string;
}

export interface ChangePasswordInput {
  employeeId: string;
  currentPassword: string;
  newPassword: string;
}

export interface ChangeMasterPasswordInput {
  currentPassword: string;
  newPassword: string;
}

export interface ResetEmployeePasswordInput {
  employeeId: string;
  newPassword: string;
}

export interface ExportFilters {
  employeeId?: string;
  status?: 'pending' | 'approved' | 'rejected';
  fromDate?: string;
  toDate?: string;
}