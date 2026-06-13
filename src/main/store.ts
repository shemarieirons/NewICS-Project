import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { app } from 'electron';
import { supabaseSync } from './supabase';
import type {
  AppSnapshot,
  AttendanceSessionRecord,
  ChangeMasterPasswordInput,
  ChangePasswordInput,
  CreateEmployeeInput,
  CurrentUser,
  EmployeeRecord,
  ExportFilters,
  LeaveRequestRecord,
  LoginInput,
  ResetEmployeePasswordInput,
  ReviewLeaveInput,
  Role,
  SubmitLeaveInput,
  WizardSetupInput
} from '../shared/types';

type SettingValue = string | null;

const hashPassword = (value: string): string =>
  crypto.createHash('sha256').update(value.trim()).digest('hex');

const isoNow = (): string => new Date().toISOString();

const employeeDisplayName = (firstName: string, lastName: string): string =>
  `${firstName} ${lastName}`.trim();

const toCsv = (rows: Array<Record<string, string | number | null | boolean>>): string => {
  if (rows.length === 0) {
    return '';
  }

  const headers = Object.keys(rows[0]);
  const escapeValue = (value: string | number | null | boolean): string => {
    const text = value === null ? '' : String(value);
    return `"${text.replaceAll('"', '""')}"`;
  };

  return [headers.join(','), ...rows.map((row) => headers.map((header) => escapeValue(row[header])).join(','))].join(
    '\n'
  );
};

export class AppStore {
  private readonly db: Database.Database;

  private activeUser: CurrentUser | null = null;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.bootstrap();
    this.initializeSupabaseFromSettings();
  }

  private bootstrap(): void {
    // Add device_id tracking
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );
      CREATE TABLE IF NOT EXISTS employees (
        id TEXT PRIMARY KEY,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        username TEXT NOT NULL UNIQUE,
        dob TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        device_id TEXT NOT NULL,
        version_clock INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS attendance_sessions (
        id TEXT PRIMARY KEY,
        employee_id TEXT NOT NULL,
        employee_name TEXT,
        clock_in_at TEXT NOT NULL,
        clock_out_at TEXT,
        synced INTEGER NOT NULL DEFAULT 1,
        device_id TEXT NOT NULL,
        version_clock INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS leave_requests (
        id TEXT PRIMARY KEY,
        employee_id TEXT NOT NULL,
        employee_name TEXT,
        type TEXT NOT NULL DEFAULT 'Other',
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        reason TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        manager_comment TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        synced INTEGER NOT NULL DEFAULT 1,
        device_id TEXT NOT NULL,
        version_clock INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS sync_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action_type TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);

    try {
      this.db.exec("ALTER TABLE leave_requests ADD COLUMN type TEXT DEFAULT 'Other'");
    } catch {
      // Ignore if column already exists
    }
    try {
      this.db.exec('ALTER TABLE attendance_sessions ADD COLUMN employee_name TEXT');
    } catch {
    }
    
    try {
      this.db.exec('ALTER TABLE leave_requests ADD COLUMN employee_name TEXT');
    } catch {
    }
    this.ensureSetting('device_id', randomUUID());
    this.ensureSetting('wizard_complete', '0');
    this.ensureSetting('supabase_url', '');
    this.ensureSetting('supabase_key', '');
    this.ensureSetting('master_password_hash', '');
    this.ensureSetting('network_online', '1');
    this.ensureSetting('last_synced_at', '');
  }

  private ensureSetting(key: string, value: string): void {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value?: SettingValue } | undefined;
    if (!row) {
      this.db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(key, value);
    }
  }

  private setSetting(key: string, value: string): void {
    this.db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
      key,
      value
    );
  }

  private async initializeSupabaseFromSettings(): Promise<void> {
    const url = this.getSetting('supabase_url');
    const key = this.getSetting('supabase_key');
  
    if (!url || !key) {
      console.log('[Supabase] No saved config found');
      return;
    }
  
    console.log('[Supabase] Restoring saved config...');
  
    const ok = await supabaseSync.initialize(url, key);
  
    console.log('[Supabase] Restore result:', ok);
  }

  public getSetting(key: string): string {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value?: SettingValue } | undefined;
    return row?.value ?? '';
  }

  private isWizardComplete(): boolean {
    return this.getSetting('wizard_complete') === '1';
  }

  private isOnline(): boolean {
    return this.getSetting('network_online') === '1';
  }

  private queueAction(actionType: string, payload: Record<string, unknown>): void {
    this.db
      .prepare('INSERT INTO sync_queue (action_type, payload, created_at) VALUES (?, ?, ?)')
      .run(actionType, JSON.stringify(payload), isoNow());
  }

  private async flushQueue(): Promise<void> {
    const rows = this.db
      .prepare('SELECT id, action_type, payload FROM sync_queue')
      .all() as Array<{ id: number; action_type: string; payload: string }>;
    
    if (rows.length > 0) {
      const deviceId = this.getSetting('device_id');
      
      const queuedActions = rows.map((row) => ({
        id: String(row.id),
        actionType: row.action_type,
        entityType: row.action_type.split(':')[0],
        entityId: '',
        payload: {
          ...JSON.parse(row.payload),
          device_id: deviceId // Add device tracking
        },
        createdAt: isoNow()
      }));
      
      await supabaseSync.processQueue(queuedActions);
      this.db.prepare('DELETE FROM sync_queue').run();
      this.setSetting('last_synced_at', isoNow());
    }
  }

  private async maybeSync(actionType: string, payload: Record<string, unknown>): Promise<void> {
    if (this.isOnline()) {
      if (supabaseSync.isConnected()) {
        this.queueAction(actionType, payload);
        // CRITICAL: Flush queue then pull from cloud to confirm
        await this.flushQueue();
        await this.pullFromSupabase(); // <-- Pull after push
        this.setSetting('last_synced_at', isoNow());
        return;
      }
    }
    this.queueAction(actionType, payload);
  }

  private syncing = false;

  public async syncFromCloud(): Promise<void> {
    if (this.syncing) return;
    this.syncing = true;

    try {
      if (!supabaseSync.isConnected()) {
        console.warn('[AppStore] Supabase not connected, skipping sync');
        return;
      }

      await this.pullFromSupabase();
      this.setSetting('last_synced_at', isoNow());

      console.log('[AppStore] Cloud sync completed');
    } catch (error) {
      console.warn('[AppStore] Sync failed:', error);
    } finally {
      this.syncing = false;
    }
  }
  private async pullFromSupabase(): Promise<void> {
    if (!supabaseSync.isConnected()) {
      console.warn('[AppStore] Supabase not connected, skipping pull');
      return;
    }
  
    try {
      // ======================
      // Fetch employees
      // ======================
      const employees = await supabaseSync.fetchRecords('employees');
      for (const emp of employees as Array<Record<string, unknown>>) {
        this.db
          .prepare(
            `INSERT INTO employees (
              id,
              first_name,
              last_name,
              username,
              dob,
              password_hash,
              created_at,
              device_id,
              version_clock
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              first_name = excluded.first_name,
              last_name = excluded.last_name,
              username = excluded.username,
              dob = excluded.dob,
              password_hash = excluded.password_hash,
              created_at = excluded.created_at,
              device_id = excluded.device_id,
              version_clock = excluded.version_clock`
          )
          .run(
            emp.id,
            emp.first_name,
            emp.last_name,
            emp.username,
            emp.dob,
            emp.password_hash,
            emp.created_at,
            emp.device_id || '',
            emp.version_clock || 1
          );
      }
  
      // ======================
      // Fetch attendance
      // ======================
      const attendance = await supabaseSync.fetchRecords('attendance_sessions');
      for (const att of attendance as Array<Record<string, unknown>>) {
        this.db
          .prepare(
            `INSERT INTO attendance_sessions (
              id,
              employee_id,
              employee_name,
              clock_in_at,
              clock_out_at,
              synced,
              device_id,
              version_clock
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              employee_id = excluded.employee_id,
              employee_name = excluded.employee_name,
              clock_in_at = excluded.clock_in_at,
              clock_out_at = excluded.clock_out_at,
              synced = excluded.synced,
              device_id = excluded.device_id,
              version_clock = excluded.version_clock`
          )
          .run(
            att.id,
            att.employee_id,
            att.employee_name,
            att.clock_in_at,
            att.clock_out_at,
            att.synced ? 1 : 0,
            att.device_id || '',
            att.version_clock || 1
          );
      }
  
      // ======================
      // Fetch leave requests
      // ======================
      const leaves = await supabaseSync.fetchRecords('leave_requests');
      for (const leave of leaves as Array<Record<string, unknown>>) {
        this.db
          .prepare(
            `INSERT INTO leave_requests (
              id,
              employee_id,
              employee_name,
              type,
              start_date,
              end_date,
              reason,
              status,
              manager_comment,
              created_at,
              updated_at,
              synced,
              device_id,
              version_clock
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              employee_id = excluded.employee_id,
              employee_name = excluded.employee_name,
              type = excluded.type,
              start_date = excluded.start_date,
              end_date = excluded.end_date,
              reason = excluded.reason,
              status = excluded.status,
              manager_comment = excluded.manager_comment,
              created_at = excluded.created_at,
              updated_at = excluded.updated_at,
              synced = excluded.synced,
              device_id = excluded.device_id,
              version_clock = excluded.version_clock`
          )
          .run(
            leave.id,
            leave.employee_id,
            leave.employee_name,
            leave.type,
            leave.start_date,
            leave.end_date,
            leave.reason,
            leave.status,
            leave.manager_comment,
            leave.created_at,
            leave.updated_at,
            leave.synced ? 1 : 0,
            leave.device_id || '',
            leave.version_clock || 1
          );
      }
  
      console.log('[AppStore] Successfully pulled data from Supabase');
    } catch (error) {
      console.warn(
        '[AppStore] Error pulling from Supabase:',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  private getQueueCount(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS count FROM sync_queue').get() as { count: number };
    return row.count;
  }

  private getEmployees(): EmployeeRecord[] {
    const rawEmployees = this.db
      .prepare(
        `SELECT id, first_name AS firstName, last_name AS lastName, username, dob, password_hash, created_at AS createdAt
         FROM employees
         ORDER BY created_at DESC`
      )
      .all() as Array<{
        id: string; // <-- UUID now
        firstName: string;
        lastName: string;
        username: string;
        dob: string;
        password_hash: string;
        createdAt: string;
      }>;
  
    return rawEmployees.map((emp) => {
      const dobParts = emp.dob.split('-');
      const dayOfBirth = Number(dobParts[2] || 0);
      const generatedPassword = `${emp.firstName.trim()[0]}${emp.lastName.trim()[0]}${dayOfBirth}`.toLowerCase();
      const isDefault = emp.password_hash === hashPassword(generatedPassword);
      return {
        id: emp.id,
        firstName: emp.firstName,
        lastName: emp.lastName,
        username: emp.username,
        dob: emp.dob,
        createdAt: emp.createdAt,
        passwordChanged: !isDefault,
        defaultPassword: isDefault ? generatedPassword : undefined
      };
    });
  }

  private getAttendanceSessions(): AttendanceSessionRecord[] {
    return this.db
      .prepare(
        `SELECT s.id,
                s.employee_id AS employeeId,
                s.employee_name AS employeeName,
                s.clock_in_at AS clockInAt,
                s.clock_out_at AS clockOutAt,
                s.synced = 1 AS synced
         FROM attendance_sessions s
         ORDER BY s.clock_in_at DESC`
      )
      .all() as AttendanceSessionRecord[];
  }

  private getLeaveRequests(): LeaveRequestRecord[] {
    return this.db
      .prepare(
        `SELECT r.id,
                r.employee_id AS employeeId,
                r.employee_name AS employeeName,
                r.type,
                r.start_date AS startDate,
                r.end_date AS endDate,
                r.reason,
                r.status,
                r.manager_comment AS managerComment,
                r.created_at AS createdAt,
                r.updated_at AS updatedAt,
                r.synced = 1 AS synced
         FROM leave_requests r
         ORDER BY r.created_at DESC`
      )
      .all() as LeaveRequestRecord[];
  }

  private getCurrentUser(): CurrentUser | null {
    return this.activeUser;
  }

  private buildSnapshot(): AppSnapshot {
    const queueCount = this.getQueueCount();
    const online = this.isOnline();
    const connected = this.isWizardComplete() && online && queueCount === 0;

    return {
      wizardComplete: this.isWizardComplete(),
      currentUser: this.getCurrentUser(),
      sync: {
        connected,
        pendingActions: queueCount,
        lastSyncedAt: this.getSetting('last_synced_at') || null,
        message: connected
          ? 'Cloud-first sync ready'
          : !this.isWizardComplete()
            ? 'Complete the setup wizard to connect Supabase'
            : online
              ? queueCount > 0
                ? 'Sync pending for local actions'
                : 'Connected and synchronized'
              : 'Offline mode: local queue active'
      },
      employees: this.getEmployees(),
      attendanceSessions: this.getAttendanceSessions(),
      leaveRequests: this.getLeaveRequests()
    };
  }

  public snapshot(): AppSnapshot {
    return this.buildSnapshot();
  }

  public async reportConnectivity(online: boolean): Promise<AppSnapshot> {
    this.setSetting('network_online', online ? '1' : '0');
    if (online) {
      await this.flushQueue();
    }

    return this.buildSnapshot();
  }

  public async completeWizard(input: WizardSetupInput): Promise<AppSnapshot> {
    if (this.isWizardComplete()) {
      throw new Error('Installation has already been completed. Use application settings to change configuration.');
    }

    if (!input.supabaseUrl.trim() || !input.supabaseAnonKey.trim()) {
      throw new Error('Supabase URL and API key are required.');
    }

    if (!input.masterPassword.trim()) {
      throw new Error('Master password is required.');
    }

    this.setSetting('supabase_url', input.supabaseUrl.trim());
    this.setSetting('supabase_key', input.supabaseAnonKey.trim());
    this.setSetting('master_password_hash', hashPassword(input.masterPassword));

    console.log('[AppStore] Initializing Supabase with URL:', input.supabaseUrl.trim());
    const initResult = await supabaseSync.initialize(input.supabaseUrl.trim(), input.supabaseAnonKey.trim());
    console.log('[AppStore] Supabase init result:', initResult);

    this.setSetting('wizard_complete', '1');
    this.setSetting('last_synced_at', isoNow());
    await this.pullFromSupabase();
    await this.flushQueue();

    return this.buildSnapshot();
  }

  public login(input: LoginInput): AppSnapshot {
    if (input.role === 'manager') {
      const masterPasswordHash = this.getSetting('master_password_hash');
      if (!masterPasswordHash || masterPasswordHash !== hashPassword(input.password)) {
        throw new Error('Invalid manager master password.');
      }

      this.activeUser = {
        id: '0',
        role: 'manager',
        displayName: 'Manager',
        username: 'manager'
      };
      return this.buildSnapshot();
    }

    if (!input.username?.trim()) {
      throw new Error('Employee username is required.');
    }

    const employee = this.db
      .prepare('SELECT id, first_name, last_name, username, password_hash FROM employees WHERE username = ?')
      .get(input.username.trim()) as
      | { id: string; first_name: string; last_name: string; username: string; password_hash: string }
      | undefined;

    if (!employee || employee.password_hash !== hashPassword(input.password)) {
      throw new Error('Invalid employee credentials.');
    }

    this.activeUser = {
      id: employee.id,
      role: 'employee',
      displayName: employeeDisplayName(employee.first_name, employee.last_name),
      username: employee.username
    };

    return this.buildSnapshot();
  }

  public logout(): AppSnapshot {
    this.activeUser = null;
    return this.buildSnapshot();
  }

  public async createEmployee(input: CreateEmployeeInput): Promise<AppSnapshot> {
    if (!this.activeUser || this.activeUser.role !== 'manager') {
      throw new Error('Only managers can create employees.');
    }
    if (!input.firstName.trim() || !input.lastName.trim() || !input.username.trim() || !input.dob.trim()) {
      throw new Error('All employee fields are required.');
    }
  
    const dobParts = input.dob.split('-');
    const dayOfBirth = Number(dobParts[2]);
    const generatedPassword = `${input.firstName.trim()[0]}${input.lastName.trim()[0]}${dayOfBirth}`.toLowerCase();
    const createdAt = isoNow();
    const empId = randomUUID(); // <-- UUID instead of auto-increment
    const deviceId = this.getSetting('device_id');
  
    this.db
      .prepare(
        `INSERT INTO employees (id, first_name, last_name, username, dob, password_hash, created_at, device_id, version_clock)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        empId,
        input.firstName.trim(),
        input.lastName.trim(),
        input.username.trim(),
        input.dob.trim(),
        hashPassword(generatedPassword),
        createdAt,
        deviceId,
        1
      );
  
    const employee = this.db.prepare(`SELECT * FROM employees WHERE id = ?`).get(empId);
    await this.maybeSync('employee:create', employee as Record<string, unknown>);
    return this.buildSnapshot();
  }

  public async deleteEmployee(employeeId: string): Promise<AppSnapshot> {
    if (!this.activeUser || this.activeUser.role !== 'manager') {
      throw new Error('Only managers can delete employees.');
    }

    if (this.activeUser.id === employeeId) {
      throw new Error('You cannot delete your own account.');
    }

    this.db.prepare('DELETE FROM employees WHERE id = ?').run(employeeId);
    await this.maybeSync('employee:delete', { id: employeeId });
    return this.buildSnapshot();
  }

  public async clockIn(): Promise<AppSnapshot> {
    if (!this.activeUser || this.activeUser.role !== 'employee') {
      throw new Error('Only employees can clock in.');
    }
  
    const openSession = this.db
      .prepare('SELECT id FROM attendance_sessions WHERE employee_id = ? AND clock_out_at IS NULL ORDER BY clock_in_at DESC LIMIT 1')
      .get(this.activeUser.id) as { id: string } | undefined;
  
    if (openSession) {
      throw new Error('You are already clocked in.');
    }
  
    const clockInTime = isoNow();
    const sessionId = randomUUID(); // <-- UUID
    const deviceId = this.getSetting('device_id');
  
    this.db
      .prepare(
        'INSERT INTO attendance_sessions (id, employee_id, employee_name, clock_in_at, synced, device_id, version_clock) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        sessionId,
        this.activeUser.id,
        this.activeUser.displayName,
        clockInTime,
        this.isOnline() ? 1 : 0,
        deviceId,
        1
      );
  
    const session = this.db.prepare(`SELECT * FROM attendance_sessions WHERE id = ?`).get(sessionId);
    await this.maybeSync('attendance:clockIn', session as Record<string, unknown>);
    return this.buildSnapshot();
  }

  // FIXED clockOut method for store.ts
// Change: { id: number } → { id: string }

  public async clockOut(): Promise<AppSnapshot> {
    if (!this.activeUser || this.activeUser.role !== 'employee') {
      throw new Error('Only employees can clock out.');
    }

    const openSession = this.db
      .prepare('SELECT id FROM attendance_sessions WHERE employee_id = ? AND clock_out_at IS NULL ORDER BY clock_in_at DESC LIMIT 1')
      .get(this.activeUser.id) as { id: string } | undefined;

    if (!openSession) {
      throw new Error('No active clock-in session was found.');
    }

    const clockOutTime = isoNow();
    this.db.prepare('UPDATE attendance_sessions SET clock_out_at = ?, synced = ? WHERE id = ?').run(
      clockOutTime,
      this.isOnline() ? 1 : 0,
      openSession.id
    );

    const session = this.db
      .prepare(`SELECT * FROM attendance_sessions WHERE id = ?`)
      .get(openSession.id);

    await this.maybeSync('attendance:clockOut', session as Record<string, unknown>);
    return this.buildSnapshot();
  }

  public async submitLeaveRequest(input: SubmitLeaveInput): Promise<AppSnapshot> {
    if (!this.activeUser || this.activeUser.role !== 'employee') {
      throw new Error('Only employees can submit leave requests.');
    }
  
    const now = isoNow();
    const leaveId = randomUUID(); // <-- UUID
    const deviceId = this.getSetting('device_id');
  
    this.db
      .prepare(
        `INSERT INTO leave_requests (id, employee_id, employee_name, type, start_date, end_date, reason, status, created_at, updated_at, synced, device_id, version_clock)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`
      )
      .run(
        leaveId,
        input.employeeId,
        this.activeUser.displayName,
        input.type || 'Other',
        input.startDate,
        input.endDate,
        input.reason.trim(),
        now,
        now,
        this.isOnline() ? 1 : 0,
        deviceId,
        1
      );
  
    const leaveRequest = this.db.prepare(`SELECT * FROM leave_requests WHERE id = ?`).get(leaveId);
    await this.maybeSync('leave:submit', leaveRequest as Record<string, unknown>);
    return this.buildSnapshot();
  }

  public async reviewLeaveRequest(input: ReviewLeaveInput): Promise<AppSnapshot> {
    if (!this.activeUser || this.activeUser.role !== 'manager') {
      throw new Error('Only managers can review leave requests.');
    }

    const updatedAt = isoNow();
    this.db
      .prepare(
        `UPDATE leave_requests
         SET status = ?, manager_comment = ?, updated_at = ?, synced = ?
         WHERE id = ?`
      )
      .run(input.status, input.comment?.trim() || null, updatedAt, this.isOnline() ? 1 : 0, input.requestId);

    const leaveRequest = this.db
      .prepare(`SELECT * FROM leave_requests WHERE id = ?`)
      .get(input.requestId);

    await this.maybeSync('leave:review', leaveRequest as Record<string, unknown>);
    return this.buildSnapshot();
  }

  public async withdrawLeaveRequest(requestId: string, employeeId: string): Promise<AppSnapshot> {
    if (!this.activeUser || this.activeUser.role !== 'employee' || this.activeUser.id !== employeeId) {
      throw new Error('Only the owning employee can withdraw a leave request.');
    }
  
    const request = this.db
      .prepare('SELECT status FROM leave_requests WHERE id = ? AND employee_id = ?')
      .get(requestId, employeeId) as { status: string } | undefined;
  
    if (!request) {
      throw new Error('Leave request not found.');
    }
  
    if (request.status !== 'pending') {
      throw new Error('Only pending leave requests can be withdrawn.');
    }
  
    const updatedAt = isoNow();
    this.db.prepare('UPDATE leave_requests SET status = ?, updated_at = ?, synced = ? WHERE id = ?').run(
      'withdrawn',
      updatedAt,
      this.isOnline() ? 1 : 0,
      requestId
    );
  
    const leaveRequest = this.db.prepare(`SELECT * FROM leave_requests WHERE id = ?`).get(requestId);
  
    await this.maybeSync('leave:withdraw', leaveRequest as Record<string, unknown>);
    return this.buildSnapshot();
  }

  public async changePassword(input: ChangePasswordInput): Promise<AppSnapshot> {
    if (!this.activeUser || this.activeUser.role !== 'employee' || this.activeUser.id !== input.employeeId) {
      throw new Error('Only the signed-in employee can change this password.');
    }
  
    if (!input.newPassword.trim()) {
      throw new Error('New password is required.');
    }
  
    const employee = this.db
      .prepare('SELECT password_hash FROM employees WHERE id = ?')
      .get(input.employeeId) as { password_hash: string } | undefined;
  
    if (!employee || employee.password_hash !== hashPassword(input.currentPassword)) {
      throw new Error('Current password is incorrect.');
    }
  
    this.db.prepare(
      'UPDATE employees SET password_hash = ? WHERE id = ?'
    ).run(hashPassword(input.newPassword), input.employeeId);
  
    const updatedEmployee = this.db
      .prepare('SELECT * FROM employees WHERE id = ?')
      .get(input.employeeId);
  
    await this.maybeSync(
      'employee:changePassword',
      updatedEmployee as Record<string, unknown>
    );
  
    return this.buildSnapshot();
  }

  public async changeMasterPassword(input: ChangeMasterPasswordInput): Promise<AppSnapshot> {
    if (!this.activeUser || this.activeUser.role !== 'manager') {
      throw new Error('Only managers can change the master password.');
    }

    if (!input.newPassword.trim()) {
      throw new Error('New password is required.');
    }

    const masterPasswordHash = this.getSetting('master_password_hash');
    if (!masterPasswordHash || masterPasswordHash !== hashPassword(input.currentPassword)) {
      throw new Error('Current master password is incorrect.');
    }

    this.setSetting('master_password_hash', hashPassword(input.newPassword));
    return this.buildSnapshot();
  }

  public async resetEmployeePassword(input: ResetEmployeePasswordInput): Promise<AppSnapshot> {
    if (!this.activeUser || this.activeUser.role !== 'manager') {
      throw new Error('Only managers can reset employee passwords.');
    }

    if (!input.newPassword.trim()) {
      throw new Error('New password is required.');
    }

    const employee = this.db.prepare('SELECT id FROM employees WHERE id = ?').get(input.employeeId) as { id: string } | undefined;
    if (!employee) {
      throw new Error('Employee not found.');
    }

    this.db
      .prepare('UPDATE employees SET password_hash = ? WHERE id = ?')
      .run(hashPassword(input.newPassword), input.employeeId);

    const updatedEmployee = this.db.prepare(`SELECT * FROM employees WHERE id = ?`).get(input.employeeId);

    await this.maybeSync('employee:resetPassword', updatedEmployee as Record<string, unknown>);
    return this.buildSnapshot();
  }

  public exportTimeLogsCsv(filters: ExportFilters): string {
    const clauses: string[] = [];
    const params: Array<string | number> = [];
  
    // CHANGED: removed typeof check, now just checks if exists
    if (filters.employeeId) {
      clauses.push('s.employee_id = ?');
      params.push(filters.employeeId);
    }
  
    if (filters.fromDate) {
      clauses.push('date(s.clock_in_at) >= date(?)');
      params.push(filters.fromDate);
    }
  
    if (filters.toDate) {
      clauses.push('date(s.clock_in_at) <= date(?)');
      params.push(filters.toDate);
    }
  
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = this.db
      .prepare(
        `SELECT s.id,
                s.employee_name AS employeeName,
                s.clock_in_at AS clockInAt,
                s.clock_out_at AS clockOutAt,
                s.synced = 1 AS synced
         FROM attendance_sessions s
         ${where}
         ORDER BY s.clock_in_at DESC`
      )
      .all(...params) as Array<{ id: string; employeeName: string; clockInAt: string; clockOutAt: string | null; synced: number }>;
  
    return toCsv(
      rows.map((row) => ({
        id: row.id,
        employeeName: row.employeeName,
        clockInAt: row.clockInAt,
        clockOutAt: row.clockOutAt ?? '',
        synced: row.synced === 1
      }))
    );
  }

  public exportLeaveRequestsCsv(filters: ExportFilters): string {
    const clauses: string[] = [];
    const params: Array<string | number> = [];
  
    // CHANGED: removed typeof check, now just checks if exists
    if (filters.employeeId) {
      clauses.push('r.employee_id = ?');
      params.push(filters.employeeId);
    }
  
    if (filters.status) {
      clauses.push('r.status = ?');
      params.push(filters.status);
    }
  
    if (filters.fromDate) {
      clauses.push('date(r.created_at) >= date(?)');
      params.push(filters.fromDate);
    }
  
    if (filters.toDate) {
      clauses.push('date(r.created_at) <= date(?)');
      params.push(filters.toDate);
    }
  
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = this.db
      .prepare(
        `SELECT r.id,
                r.employee_name AS employeeName,
                r.type,
                r.start_date AS startDate,
                r.end_date AS endDate,
                r.reason,
                r.status,
                COALESCE(r.manager_comment, '') AS managerComment,
                r.created_at AS createdAt,
                r.updated_at AS updatedAt
         FROM leave_requests r
         ${where}
         ORDER BY r.created_at DESC`
      )
      .all(...params) as Array<{
        id: string;
        employeeName: string;
        type: string;
        startDate: string;
        endDate: string;
        reason: string;
        status: string;
        managerComment: string;
        createdAt: string;
        updatedAt: string;
      }>;
  
    return toCsv(rows);
  }
}

export const getDatabasePath = (): string => path.join(app.getPath('userData'), 'irons-workforce-tracker.sqlite');