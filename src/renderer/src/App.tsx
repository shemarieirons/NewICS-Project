import { useEffect, useMemo, useState } from 'react';
import type {
  AppSnapshot,
  AttendanceSessionRecord,
  CurrentUser,
  LeaveRequestRecord,
  Role
} from '../../shared/types.js';

type Screen = 'boot' | 'wizard' | 'login' | 'app';
type EmployeeTab = 'dashboard' | 'history' | 'leave_request' | 'leave_status' | 'account_settings';
type ManagerTab = 'dashboard' | 'add_employee' | 'leave_requests' | 'time_log' | 'system_status' | 'account_settings';

type ActivityItem = {
  id: string;
  timestamp: string;
  label: string;
  detail: string;
  category: 'attendance' | 'leave';
};
type ThemeMode = 'dark' | 'light';

const THEME_STORAGE_KEY = 'irons-theme';

type Notice = {
  kind: 'success' | 'error' | 'info';
  text: string;
};

const emptySnapshot = (): AppSnapshot => ({
  wizardComplete: false,
  currentUser: null,
  sync: {
    connected: false,
    pendingActions: 0,
    lastSyncedAt: null,
    message: 'Starting up...'
  },
  employees: [],
  attendanceSessions: [],
  leaveRequests: []
});

const formatDateTime = (value: string | null): string => {
  if (!value) {
    return '—';
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
};

const formatDate = (value: string): string =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium'
  }).format(new Date(`${value}T00:00:00`));

const downloadCsv = (filename: string, csv: string): void => {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

const defaultWizard = {
  supabaseUrl: '',
  supabaseAnonKey: '',
  masterPassword: ''
};

const defaultEmployeeForm = {
  firstName: '',
  lastName: '',
  username: '',
  dateJoined: ''
};

const defaultLeaveForm = {
  type: 'Annual Leave',
  startDate: '',
  endDate: '',
  reason: ''
};

export default function App(): JSX.Element {
  const [snapshot, setSnapshot] = useState<AppSnapshot>(emptySnapshot());
  const [screen, setScreen] = useState<Screen>('boot');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [role, setRole] = useState<Role>('employee');
  const [wizard, setWizard] = useState(defaultWizard);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [employeeForm, setEmployeeForm] = useState(defaultEmployeeForm);
  const [leaveForm, setLeaveForm] = useState(defaultLeaveForm);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [leaveFilters, setLeaveFilters] = useState({ fromDate: '', toDate: '', status: '' as LeaveRequestRecord['status'] | '' });
  const [timeFilters, setTimeFilters] = useState({ fromDate: '', toDate: '', employeeId: '' });
  const [selectedLeaveId, setSelectedLeaveId] = useState('');
  const [selectedLeaveStatus, setSelectedLeaveStatus] = useState<'approved' | 'rejected'>('approved');
  const [selectedLeaveComment, setSelectedLeaveComment] = useState('');
  const [employeeTab, setEmployeeTab] = useState<EmployeeTab>('dashboard');
  const [managerTab, setManagerTab] = useState<ManagerTab>('dashboard');
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return saved === 'light' ? 'light' : 'dark';
  });
  const [masterPasswordForm, setMasterPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [employeeResetForm, setEmployeeResetForm] = useState({ employeeId: '', newPassword: '', confirmPassword: '' });
  const [activityExpanded, setActivityExpanded] = useState(false);
  const [activityFilters, setActivityFilters] = useState({ category: '' as '' | 'attendance' | 'leave', fromDate: '', toDate: '' });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    let unsubscribe = (): void => {};

    const boot = async (): Promise<void> => {
      try {
        const current = await window.ironsApi.getSnapshot();
        setSnapshot(current);
        setScreen(current.wizardComplete ? (current.currentUser ? 'app' : 'login') : 'wizard');
      } catch (error) {
        setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Unable to start the app.' });
        setScreen('wizard');
      } finally {
        setLoading(false);
      }

      unsubscribe = window.ironsApi.onSnapshotUpdated(async () => {
        const current = await window.ironsApi.getSnapshot();
        setSnapshot(current);
        setScreen(current.wizardComplete ? (current.currentUser ? 'app' : 'login') : 'wizard');
      });
    };

    void boot();

    const report = (): void => {
      void window.ironsApi.reportConnectivity(navigator.onLine).then((current) => setSnapshot(current));
    };

    window.addEventListener('online', report);
    window.addEventListener('offline', report);

    return () => {
      unsubscribe();
      window.removeEventListener('online', report);
      window.removeEventListener('offline', report);
    };
  }, []);

  useEffect(() => {
    if (!snapshot.currentUser) {
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    }
  }, [snapshot.currentUser]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      const isCommandOrControl = event.ctrlKey || event.metaKey;
      if (!isCommandOrControl) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const isTypingField = Boolean(target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

      if (event.key.toLowerCase() === 'l' && !event.shiftKey) {
        event.preventDefault();
        void handleLogout();
        return;
      }

      if (event.key.toLowerCase() === 'd' && !event.shiftKey) {
        event.preventDefault();
        if (snapshot.currentUser?.role === 'employee') {
          setEmployeeTab('dashboard');
        } else if (snapshot.currentUser?.role === 'manager') {
          setManagerTab('dashboard');
        }
        return;
      }

      if (event.key.toLowerCase() === 't' && event.shiftKey) {
        event.preventDefault();
        setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
        return;
      }

      if (event.key.toLowerCase() === 'v' && isTypingField) {
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [snapshot.currentUser]);

  useEffect(() => {
    const handleContextMenu = (event: MouseEvent): void => {
      event.preventDefault();
      void window.ironsApi.showContextMenu();
    };

    window.addEventListener('contextmenu', handleContextMenu);
    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
    };
  }, []);

  useEffect(() => {
    const removeListener = window.ironsApi.onMenuAction((action, payload) => {
      if (action === 'menu:logout') {
        void handleLogout();
        return;
      }

      if (action === 'menu:dashboard') {
        if (snapshot.currentUser?.role === 'employee') {
          setEmployeeTab('dashboard');
        } else if (snapshot.currentUser?.role === 'manager') {
          setManagerTab('dashboard');
        }
        return;
      }

      if (action === 'menu:timeHistory' && snapshot.currentUser?.role === 'employee') {
        setEmployeeTab('history');
        return;
      }

      if (action === 'menu:leaveRequest' && snapshot.currentUser?.role === 'employee') {
        setEmployeeTab('leave_request');
        return;
      }

      if (action === 'menu:leaveStatus' && snapshot.currentUser?.role === 'employee') {
        setEmployeeTab('leave_status');
        return;
      }

      if (action === 'menu:toggleTheme') {
        setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
        return;
      }

      if (action === 'menu:syncNow') {
        void window.ironsApi.syncNow().then((current) => setSnapshot(current));
        return;
      }

      if (action === 'menu:systemStatus') {
        if (snapshot.currentUser?.role === 'manager') {
          setManagerTab('system_status');
        }
        return;
      }

      if (action === 'menu:exportTimeLogs') {
        if (snapshot.currentUser?.role === 'manager') {
          void handleExportTimeLogs();
        }
        return;
      }

      if (action === 'menu:exportLeaveRequests') {
        if (snapshot.currentUser?.role === 'manager') {
          void handleExportLeaveRequests();
        }
        return;
      }

      if (action === 'menu:about') {
        const version = payload?.version ? ` v${payload.version}` : '';
        showNotice('info', `Irons Workforce Tracker${version}`);
        return;
      }

      if (action === 'menu:exit') {
        void window.ironsApi.exitApp();
      }
    });

    return removeListener;
  }, [snapshot.currentUser]);

  const managerEmployees = snapshot.employees;
  const currentEmployee = useMemo(() => {
    if (snapshot.currentUser?.role !== 'employee') {
      return null;
    }

    return snapshot.employees.find((employee) => employee.id === snapshot.currentUser?.id) ?? null;
  }, [snapshot.currentUser, snapshot.employees]);

  const activeTimeSessions = useMemo(() => {
    if (snapshot.currentUser?.role !== 'employee') {
      return snapshot.attendanceSessions;
    }

    return snapshot.attendanceSessions.filter((session) => session.employeeId === snapshot.currentUser?.id);
  }, [snapshot.attendanceSessions, snapshot.currentUser]);

  const employeeLeaveRequests = useMemo(() => {
    if (snapshot.currentUser?.role !== 'employee') {
      return [];
    }

    return snapshot.leaveRequests.filter((request) => request.employeeId === snapshot.currentUser?.id);
  }, [snapshot.currentUser, snapshot.leaveRequests]);

  const openSession = useMemo(
    () => activeTimeSessions.find((session) => !session.clockOutAt) ?? null,
    [activeTimeSessions]
  );

  const recentActivity = useMemo((): ActivityItem[] => {
    if (snapshot.currentUser?.role !== 'employee') {
      return [];
    }

    const items: ActivityItem[] = [];

    for (const session of activeTimeSessions) {
      items.push({
        id: `clock-in-${session.id}`,
        timestamp: session.clockInAt,
        label: 'Clocked in',
        detail: formatDateTime(session.clockInAt),
        category: 'attendance'
      });

      if (session.clockOutAt) {
        items.push({
          id: `clock-out-${session.id}`,
          timestamp: session.clockOutAt,
          label: 'Clocked out',
          detail: formatDateTime(session.clockOutAt),
          category: 'attendance'
        });
      }
    }

    for (const request of employeeLeaveRequests) {
      items.push({
        id: `leave-submit-${request.id}`,
        timestamp: request.createdAt,
        label: 'Leave request submitted',
        detail: `${request.type} (${formatDate(request.startDate)} to ${formatDate(request.endDate)})`,
        category: 'leave'
      });

      if (request.status !== 'pending' && request.updatedAt !== request.createdAt) {
        items.push({
          id: `leave-status-${request.id}`,
          timestamp: request.updatedAt,
          label: `Leave request ${request.status}`,
          detail: `${request.type} (${formatDate(request.startDate)} to ${formatDate(request.endDate)})`,
          category: 'leave'
        });
      }
    }

    return items.sort((left, right) => right.timestamp.localeCompare(left.timestamp));
  }, [activeTimeSessions, employeeLeaveRequests, snapshot.currentUser?.role]);

  const filteredRecentActivity = useMemo(() => {
    return recentActivity.filter((item) => {
      if (activityFilters.category && item.category !== activityFilters.category) {
        return false;
      }

      const itemDate = item.timestamp.slice(0, 10);
      if (activityFilters.fromDate && itemDate < activityFilters.fromDate) {
        return false;
      }

      if (activityFilters.toDate && itemDate > activityFilters.toDate) {
        return false;
      }

      return true;
    });
  }, [activityFilters.category, activityFilters.fromDate, activityFilters.toDate, recentActivity]);

  const visibleRecentActivity = activityExpanded ? filteredRecentActivity : filteredRecentActivity.slice(0, 2);

  const filteredTimeSessions = useMemo(() => {
    return snapshot.attendanceSessions.filter((session) => {
      if (snapshot.currentUser?.role === 'employee' && session.employeeId !== snapshot.currentUser.id) {
        return false;
      }

      if (timeFilters.employeeId && session.employeeId !== timeFilters.employeeId) {
        return false;
      }

      const sessionDate = session.clockInAt.slice(0, 10);
      if (timeFilters.fromDate && sessionDate < timeFilters.fromDate) {
        return false;
      }

      if (timeFilters.toDate && sessionDate > timeFilters.toDate) {
        return false;
      }

      return true;
    });
  }, [snapshot.attendanceSessions, snapshot.currentUser?.id, snapshot.currentUser?.role, timeFilters.employeeId, timeFilters.fromDate, timeFilters.toDate]);

  const filteredLeaveRequests = useMemo(() => {
    return snapshot.leaveRequests.filter((request) => {
      if (snapshot.currentUser?.role === 'employee' && request.employeeId !== snapshot.currentUser.id) {
        return false;
      }

      if (leaveFilters.status && request.status !== leaveFilters.status) {
        return false;
      }

      if (leaveFilters.fromDate && request.createdAt.slice(0, 10) < leaveFilters.fromDate) {
        return false;
      }

      if (leaveFilters.toDate && request.createdAt.slice(0, 10) > leaveFilters.toDate) {
        return false;
      }

      return true;
    });
  }, [leaveFilters.fromDate, leaveFilters.status, leaveFilters.toDate, snapshot.currentUser, snapshot.leaveRequests]);

  const pendingLeaveRequests = useMemo(
    () => snapshot.leaveRequests.filter((request) => request.status === 'pending'),
    [snapshot.leaveRequests]
  );

  const selectedLeaveRequest = pendingLeaveRequests.find((request) => String(request.id) === selectedLeaveId) ?? null;

  useEffect(() => {
    if (selectedLeaveId && !pendingLeaveRequests.some((request) => String(request.id) === selectedLeaveId)) {
      setSelectedLeaveId('');
    }
  }, [pendingLeaveRequests, selectedLeaveId]);

  const showNotice = (kind: Notice['kind'], text: string): void => {
    setNotice({ kind, text });
    window.setTimeout(() => setNotice((current) => (current?.text === text ? null : current)), 3500);
  };

  const refreshSnapshot = async (): Promise<AppSnapshot> => {
    const current = await window.ironsApi.getSnapshot();
    setSnapshot(current);
    setScreen(current.wizardComplete ? (current.currentUser ? 'app' : 'login') : 'wizard');
    return current;
  };

  const handleWizardSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setLoading(true);

    try {
      const next = await window.ironsApi.completeWizard(wizard);
      setSnapshot(next);
      setScreen('login');
      showNotice('success', 'Installation complete. Sign in to launch the application.');
    } catch (error) {
      showNotice('error', error instanceof Error ? error.message : 'Wizard setup failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setLoading(true);

    try {
      const next = await window.ironsApi.login({
        role,
        username: role === 'employee' ? loginForm.username : undefined,
        password: loginForm.password
      });
      setSnapshot(next);
      setScreen('app');
      showNotice('success', `Signed in as ${next.currentUser?.displayName ?? 'user'}.`);
    } catch (error) {
      showNotice('error', error instanceof Error ? error.message : 'Unable to sign in.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async (): Promise<void> => {
    const next = await window.ironsApi.logout();
    setSnapshot(next);
    setScreen('login');
    setLoginForm({ username: '', password: '' });
  };

  const handleCreateEmployee = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setLoading(true);

    try {
      const next = await window.ironsApi.createEmployee(employeeForm);
      setSnapshot(next);
      setEmployeeForm(defaultEmployeeForm);
      const generatedPassword = `${employeeForm.firstName.trim()[0]}${employeeForm.lastName.trim()[0]}${Number(employeeForm.dateJoined.split('-')[2])}`.toLowerCase();
      showNotice('success', `Employee created. Temporary password: ${generatedPassword}`);
    } catch (error) {
      showNotice('error', error instanceof Error ? error.message : 'Could not create employee.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteEmployee = async (employeeId: number): Promise<void> => {
    if (!confirm('Are you sure you want to delete this employee?')) {
      return;
    }
    setLoading(true);
    try {
      const next = await window.ironsApi.deleteEmployee(employeeId);
      setSnapshot(next);
      showNotice('success', 'Employee deleted.');
    } catch (error) {
      showNotice('error', error instanceof Error ? error.message : 'Could not delete employee.');
    } finally {
      setLoading(false);
    }
  };

  const handleClockIn = async (): Promise<void> => {
    try {
      const next = await window.ironsApi.clockIn();
      setSnapshot(next);
      showNotice('success', 'Clock in recorded.');
    } catch (error) {
      showNotice('error', error instanceof Error ? error.message : 'Clock in failed.');
    }
  };

  const handleClockOut = async (): Promise<void> => {
    try {
      const next = await window.ironsApi.clockOut();
      setSnapshot(next);
      showNotice('success', 'Clock out recorded.');
    } catch (error) {
      showNotice('error', error instanceof Error ? error.message : 'Clock out failed.');
    }
  };

  const handleLeaveSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!snapshot.currentUser || snapshot.currentUser.role !== 'employee') {
      return;
    }

    try {
      const next = await window.ironsApi.submitLeaveRequest({
        employeeId: snapshot.currentUser.id,
        ...leaveForm
      });
      setSnapshot(next);
      setLeaveForm(defaultLeaveForm);
      showNotice('success', 'Leave request submitted.');
    } catch (error) {
      showNotice('error', error instanceof Error ? error.message : 'Unable to submit leave request.');
    }
  };

  const handleWithdrawLeave = async (requestId: number): Promise<void> => {
    if (!snapshot.currentUser || snapshot.currentUser.role !== 'employee') {
      return;
    }
    if (!confirm('Are you sure you want to withdraw this leave request?')) {
      return;
    }
    try {
      const next = await window.ironsApi.withdrawLeaveRequest({ requestId, employeeId: snapshot.currentUser.id });
      setSnapshot(next);
      showNotice('success', 'Leave request withdrawn.');
    } catch (error) {
      showNotice('error', error instanceof Error ? error.message : 'Unable to withdraw leave request.');
    }
  };

  const handlePasswordChange = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

    if (!snapshot.currentUser || snapshot.currentUser.role !== 'employee') {
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      showNotice('error', 'New password and confirmation do not match.');
      return;
    }

    try {
      const next = await window.ironsApi.changePassword({
        employeeId: snapshot.currentUser.id,
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword
      });
      setSnapshot(next);
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      showNotice('success', 'Password updated.');
    } catch (error) {
      showNotice('error', error instanceof Error ? error.message : 'Password update failed.');
    }
  };

  const handleExportTimeLogs = async (): Promise<void> => {
    const csv = await window.ironsApi.exportTimeLogsCsv({
      employeeId: timeFilters.employeeId ? Number(timeFilters.employeeId) : undefined,
      fromDate: timeFilters.fromDate || undefined,
      toDate: timeFilters.toDate || undefined
    });
    downloadCsv('time-logs.csv', csv);
    showNotice('success', 'Time log CSV exported.');
  };

  const handleExportLeaveRequests = async (): Promise<void> => {
    const csv = await window.ironsApi.exportLeaveRequestsCsv({
      employeeId: snapshot.currentUser?.role === 'employee' ? snapshot.currentUser.id : undefined,
      status: leaveFilters.status || undefined,
      fromDate: leaveFilters.fromDate || undefined,
      toDate: leaveFilters.toDate || undefined
    });
    downloadCsv('leave-requests.csv', csv);
    showNotice('success', 'Leave CSV exported.');
  };

  const handleMasterPasswordChange = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

    if (masterPasswordForm.newPassword !== masterPasswordForm.confirmPassword) {
      showNotice('error', 'New password and confirmation do not match.');
      return;
    }

    try {
      const next = await window.ironsApi.changeMasterPassword({
        currentPassword: masterPasswordForm.currentPassword,
        newPassword: masterPasswordForm.newPassword
      });
      setSnapshot(next);
      setMasterPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      showNotice('success', 'Manager master password updated.');
    } catch (error) {
      showNotice('error', error instanceof Error ? error.message : 'Master password update failed.');
    }
  };

  const handleEmployeePasswordReset = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

    if (!employeeResetForm.employeeId) {
      showNotice('error', 'Select an employee to reset.');
      return;
    }

    if (employeeResetForm.newPassword !== employeeResetForm.confirmPassword) {
      showNotice('error', 'New password and confirmation do not match.');
      return;
    }

    try {
      const next = await window.ironsApi.resetEmployeePassword({
        employeeId: Number(employeeResetForm.employeeId),
        newPassword: employeeResetForm.newPassword
      });
      setSnapshot(next);
      setEmployeeResetForm({ employeeId: '', newPassword: '', confirmPassword: '' });
      showNotice('success', 'Employee password reset.');
    } catch (error) {
      showNotice('error', error instanceof Error ? error.message : 'Employee password reset failed.');
    }
  };

  const renderThemeToggle = (compact = false): JSX.Element => (
    <div className={`theme-toggle ${compact ? 'theme-toggle-compact' : ''}`}>
      {!compact ? <span className="theme-toggle-label">Theme</span> : null}
      <div className="segmented">
        <button type="button" className={theme === 'dark' ? 'active' : ''} onClick={() => setTheme('dark')}>
          Dark
        </button>
        <button type="button" className={theme === 'light' ? 'active' : ''} onClick={() => setTheme('light')}>
          Light
        </button>
      </div>
    </div>
  );

  const handleReviewLeave = async (): Promise<void> => {
    if (!selectedLeaveRequest) {
      showNotice('error', 'Choose a leave request to review.');
      return;
    }

    try {
      const next = await window.ironsApi.reviewLeaveRequest({
        requestId: selectedLeaveRequest.id,
        status: selectedLeaveStatus,
        comment: selectedLeaveComment
      });
      setSnapshot(next);
      setSelectedLeaveId('');
      setSelectedLeaveComment('');
      showNotice('success', `Request ${selectedLeaveStatus}.`);
    } catch (error) {
      showNotice('error', error instanceof Error ? error.message : 'Review action failed.');
    }
  };

  if (loading && screen === 'boot') {
    return (
      <div className="boot-screen">
        <div className="boot-panel">
          <div className="boot-mark">IW</div>
          <h1>Irons Workforce Tracker</h1>
          <p>Loading the desktop workspace...</p>
          {renderThemeToggle()}
        </div>
      </div>
    );
  }

  if (screen === 'wizard') {
    return (
      <div className="install-shell">
        {notice ? <div className={`notice ${notice.kind}`} style={{ position: 'fixed', top: '1rem', right: '1rem', left: '1rem', maxWidth: '720px', margin: '0 auto' }}>{notice.text}</div> : null}
        <section className="panel hero">
          <div>
            <span className="eyebrow">Installation wizard</span>
            <h2>Install Irons Workforce Tracker</h2>
            <p>
              Configure Supabase, set the manager master password, and finish setup. This wizard runs once and is not available after installation.
            </p>
          </div>
          <form className="stack-form" onSubmit={handleWizardSubmit}>
            <label>
              Supabase project URL
              <input
                value={wizard.supabaseUrl}
                onChange={(event) => setWizard((current) => ({ ...current, supabaseUrl: event.target.value }))}
                placeholder="https://your-project.supabase.co"
                required
              />
            </label>
            <label>
              Supabase anon key
              <textarea
                value={wizard.supabaseAnonKey}
                onChange={(event) => setWizard((current) => ({ ...current, supabaseAnonKey: event.target.value }))}
                rows={4}
                placeholder="Paste the anon key used for desktop sync"
                required
              />
            </label>
            <label>
              Master password
              <input
                type="password"
                value={wizard.masterPassword}
                onChange={(event) => setWizard((current) => ({ ...current, masterPassword: event.target.value }))}
                placeholder="Create the manager master password"
                required
              />
            </label>
            <button type="submit" disabled={loading}>
              Install and launch
            </button>
          </form>
          {renderThemeToggle()}
        </section>
      </div>
    );
  }

  if (screen === 'login') {
    return (
      <div className="install-shell login-screen">
        {notice ? <div className={`notice ${notice.kind}`} style={{ position: 'fixed', top: '1rem', right: '1rem', left: '1rem', maxWidth: '720px', margin: '0 auto' }}>{notice.text}</div> : null}
        <div className="login-brand">
          <h1 className="login-brand-heading">Welcome back 
            <br />
            Irons Corporate Services Workforce
          </h1>
          <p className="login-brand-signature">Designed by Shemarie Irons</p>
        </div>
        <article className="panel login-panel">
          <div className="segmented login-portal-toggle">
            <button type="button" className={role === 'employee' ? 'active' : ''} onClick={() => setRole('employee')}>
              Employee
            </button>
            <button type="button" className={role === 'manager' ? 'active' : ''} onClick={() => setRole('manager')}>
              Manager
            </button>
          </div>
          <form className="stack-form" onSubmit={handleLogin}>
            {role === 'employee' ? (
              <label>
                Username
                <input
                  value={loginForm.username}
                  onChange={(event) => setLoginForm((current) => ({ ...current, username: event.target.value }))}
                  placeholder="employee username"
                  required
                />
              </label>
            ) : null}
            <label>
              Password
              <input
                type="password"
                value={loginForm.password}
                onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
                placeholder={role === 'employee' ? 'employee password' : 'master password'}
                required
              />
            </label>
            <button type="submit" disabled={loading}>
              Sign in
            </button>
            {renderThemeToggle(true)}
          </form>
        </article>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <div className="brand">
            <div className="brand-mark">IW</div>
            <div>
              <h1>Irons Workforce Tracker</h1>
              <p>{snapshot.currentUser?.role === 'manager' ? 'Manager console' : 'Employee portal'}</p>
            </div>
          </div>
          {snapshot.currentUser?.role === 'employee' ? (
            <div className={`status-card ${snapshot.sync.connected ? 'good' : 'warn'}`}>
              <span>{snapshot.sync.connected ? 'Connected' : 'Sync pending'}</span>
              <strong>{snapshot.sync.message}</strong>
              <small>{snapshot.sync.pendingActions} pending action(s)</small>
            </div>
          ) : null}
          {snapshot.currentUser?.role === 'manager' ? (
            <nav className="tab-bar" aria-label="Manager navigation">
              <button type="button" className={managerTab === 'dashboard' ? 'active' : ''} onClick={() => setManagerTab('dashboard')}>
                Dashboard
              </button>
              <button type="button" className={managerTab === 'add_employee' ? 'active' : ''} onClick={() => setManagerTab('add_employee')}>
                Add Employee
              </button>
              <button type="button" className={managerTab === 'leave_requests' ? 'active' : ''} onClick={() => setManagerTab('leave_requests')}>
                Leave Requests
                {pendingLeaveRequests.length > 0 ? ` (${pendingLeaveRequests.length})` : ''}
              </button>
              <button type="button" className={managerTab === 'time_log' ? 'active' : ''} onClick={() => setManagerTab('time_log')}>
                Time Log
              </button>
              <button type="button" className={managerTab === 'system_status' ? 'active' : ''} onClick={() => setManagerTab('system_status')}>
                System Status
              </button>
              <button type="button" className={managerTab === 'account_settings' ? 'active' : ''} onClick={() => setManagerTab('account_settings')}>
                Account Settings
              </button>
            </nav>
          ) : null}
          {snapshot.currentUser?.role === 'employee' ? (
            <nav className="tab-bar" aria-label="Employee navigation">
              <button type="button" className={employeeTab === 'dashboard' ? 'active' : ''} onClick={() => setEmployeeTab('dashboard')}>
                Dashboard
              </button>
              <button type="button" className={employeeTab === 'history' ? 'active' : ''} onClick={() => setEmployeeTab('history')}>
                Time History
              </button>
              <button type="button" className={employeeTab === 'leave_request' ? 'active' : ''} onClick={() => setEmployeeTab('leave_request')}>
                Leave Request
              </button>
              <button type="button" className={employeeTab === 'leave_status' ? 'active' : ''} onClick={() => setEmployeeTab('leave_status')}>
                Leave Status
              </button>
              <button type="button" className={employeeTab === 'account_settings' ? 'active' : ''} onClick={() => setEmployeeTab('account_settings')}>
                Account Settings
              </button>
            </nav>
          ) : null}
        </div>
        <div className="sidebar-footer">
          {renderThemeToggle()}
          <p>Last synced: {formatDateTime(snapshot.sync.lastSyncedAt)}</p>
          {snapshot.currentUser ? <button onClick={handleLogout}>Sign out</button> : null}
        </div>
      </aside>

      <main className="content">
        {notice ? <div className={`notice ${notice.kind}`}>{notice.text}</div> : null}

        {screen === 'app' ? (
          <section className="workspace">
            {snapshot.currentUser?.role === 'employee' ? (
              <header className="workspace-header panel">
                <div>
                  <span className="eyebrow">Signed in</span>
                  <h2>{snapshot.currentUser.displayName}</h2>
                  <p>Employee dashboard</p>
                </div>
                <div className="metric-row">
                  <div>
                    <strong>{openSession ? 'On shift' : 'Off shift'}</strong>
                    <span>Current status</span>
                  </div>
                  <div>
                    <strong>{employeeLeaveRequests.filter((request) => request.status === 'pending').length}</strong>
                    <span>Pending leave</span>
                  </div>
                  <div>
                    <strong>{activeTimeSessions.length}</strong>
                    <span>Time records</span>
                  </div>
                </div>
              </header>
            ) : null}

            {snapshot.currentUser?.role === 'employee' ? (
              <>
                {employeeTab === 'dashboard' ? (
                  <div className="dashboard-stack">
                    <article className="panel">
                      <span className="eyebrow">Employee information</span>
                      <div className="profile-grid">
                        <div className="profile-item">
                          <span>Name</span>
                          <strong>{snapshot.currentUser.displayName}</strong>
                        </div>
                        <div className="profile-item">
                          <span>Username</span>
                          <strong>@{snapshot.currentUser.username}</strong>
                        </div>
                        <div className="profile-item">
                          <span>Current status</span>
                          <strong>{openSession ? 'On Shift' : 'Off Shift'}</strong>
                        </div>
                        <div className="profile-item">
                          <span>Employee since</span>
                          <strong>{currentEmployee ? formatDate(currentEmployee.dateJoined) : '—'}</strong>
                        </div>
                      </div>
                      <div className="button-row" style={{ marginTop: '1rem' }}>
                        <button type="button" onClick={handleClockIn} disabled={Boolean(openSession)}>
                          Clock in
                        </button>
                        <button type="button" className="secondary" onClick={handleClockOut} disabled={!openSession}>
                          Clock out
                        </button>
                      </div>
                    </article>

                    <article className="panel">
                      <div className="panel-section-header">
                        <span className="eyebrow">Recent activity</span>
                        {filteredRecentActivity.length > 2 ? (
                          <button
                            type="button"
                            className="secondary small expand-toggle"
                            onClick={() => setActivityExpanded((current) => !current)}
                            aria-expanded={activityExpanded}
                          >
                            {activityExpanded ? 'Show less' : `Show all (${filteredRecentActivity.length})`}
                            <span className={`expand-arrow ${activityExpanded ? 'expanded' : ''}`} aria-hidden="true">▼</span>
                          </button>
                        ) : null}
                      </div>
                      <div className="grid three-col compact activity-filters">
                        <label>
                          Type
                          <select
                            value={activityFilters.category}
                            onChange={(event) =>
                              setActivityFilters((current) => ({
                                ...current,
                                category: event.target.value as '' | 'attendance' | 'leave'
                              }))
                            }
                          >
                            <option value="">All types</option>
                            <option value="attendance">Attendance</option>
                            <option value="leave">Leave</option>
                          </select>
                        </label>
                        <label>
                          From
                          <input
                            type="date"
                            value={activityFilters.fromDate}
                            onChange={(event) => setActivityFilters((current) => ({ ...current, fromDate: event.target.value }))}
                          />
                        </label>
                        <label>
                          To
                          <input
                            type="date"
                            value={activityFilters.toDate}
                            onChange={(event) => setActivityFilters((current) => ({ ...current, toDate: event.target.value }))}
                          />
                        </label>
                      </div>
                      <div className="stack-list activity-feed">
                        {visibleRecentActivity.map((item) => (
                          <div className="list-row" key={item.id}>
                            <div>
                              <strong>{item.label}</strong>
                              <div className="activity-meta">{item.detail}</div>
                            </div>
                            <span className="activity-meta">{formatDateTime(item.timestamp)}</span>
                          </div>
                        ))}
                        {filteredRecentActivity.length === 0 ? <p className="text-muted">No recent activity matches these filters.</p> : null}
                      </div>
                    </article>
                  </div>
                ) : null}

                {employeeTab === 'history' ? (
                  <article className="panel">
                    <span className="eyebrow">Time History</span>
                    <div className="data-table">
                      <div className="data-table-row data-table-header time-history-cols">
                        <span>In</span>
                        <span>Out</span>
                      </div>
                      {[...activeTimeSessions].reverse().map((session) => (
                        <div className="data-table-row time-history-cols" key={session.id}>
                          <span>{formatDateTime(session.clockInAt)}</span>
                          <span>{session.clockOutAt ? formatDateTime(session.clockOutAt) : 'Open session'}</span>
                        </div>
                      ))}
                      {activeTimeSessions.length === 0 ? (
                        <p className="data-table-empty">No attendance records yet.</p>
                      ) : null}
                    </div>
                  </article>
                ) : null}

                {employeeTab === 'leave_request' ? (
                  <article className="panel">
                    <span className="eyebrow">Leave Request</span>
                    <p>Submit a new leave application for manager review.</p>
                    <form className="stack-form" onSubmit={handleLeaveSubmit}>
                      <label>
                        Leave type
                        <select
                          value={leaveForm.type}
                          onChange={(event) => setLeaveForm((current) => ({ ...current, type: event.target.value }))}
                          required
                        >
                          <option value="Annual Leave">Annual Leave</option>
                          <option value="Sick Leave">Sick Leave</option>
                          <option value="Personal Leave">Personal Leave</option>
                          <option value="Family Emergency">Family Emergency</option>
                          <option value="Bereavement">Bereavement</option>
                          <option value="Maternity/Paternity Leave">Maternity/Paternity Leave</option>
                          <option value="Other">Other</option>
                        </select>
                      </label>
                      <div className="grid two-col compact">
                        <label>
                          Start date
                          <input
                            type="date"
                            value={leaveForm.startDate}
                            onChange={(event) => setLeaveForm((current) => ({ ...current, startDate: event.target.value }))}
                            required
                          />
                        </label>
                        <label>
                          End date
                          <input
                            type="date"
                            value={leaveForm.endDate}
                            onChange={(event) => setLeaveForm((current) => ({ ...current, endDate: event.target.value }))}
                            required
                          />
                        </label>
                      </div>
                      <label>
                        Reason
                        <textarea
                          rows={4}
                          value={leaveForm.reason}
                          onChange={(event) => setLeaveForm((current) => ({ ...current, reason: event.target.value }))}
                          placeholder="Explain the leave request (optional)"
                        />
                      </label>
                      <button type="submit">Submit leave request</button>
                    </form>
                  </article>
                ) : null}

                {employeeTab === 'leave_status' ? (
                  <article className="panel">
                    <span className="eyebrow">Leave Status</span>
                    <div className="data-table">
                      <div className="data-table-row data-table-header leave-status-cols">
                        <span>Leave Type</span>
                        <span>Date Range</span>
                        <span>Status</span>
                        <span>Manager Decision</span>
                      </div>
                      {employeeLeaveRequests.map((request) => (
                        <div className="data-table-row leave-status-cols" key={request.id}>
                          <span>{request.type}</span>
                          <div className="data-table-cell-stack">
                            <span>{formatDate(request.startDate)} — {formatDate(request.endDate)}</span>
                            {request.reason ? <small className="text-muted">{request.reason}</small> : null}
                          </div>
                          <div className="data-table-cell-actions">
                            <span className={`status-badge ${request.status}`}>{request.status}</span>
                            {request.status === 'pending' ? (
                              <button type="button" className="secondary small" onClick={() => handleWithdrawLeave(request.id)}>
                                Withdraw
                              </button>
                            ) : null}
                          </div>
                          <span>{request.managerComment ?? '—'}</span>
                        </div>
                      ))}
                      {employeeLeaveRequests.length === 0 ? (
                        <p className="data-table-empty">No leave requests submitted yet.</p>
                      ) : null}
                    </div>
                  </article>
                ) : null}

                {employeeTab === 'account_settings' ? (
                  <article className="panel">
                    <span className="eyebrow">Account Settings</span>
                    <p>Update your employee account password.</p>
                    <form className="stack-form" onSubmit={handlePasswordChange}>
                      <div className="grid three-col compact">
                        <label>
                          Current password
                          <input
                            type="password"
                            value={passwordForm.currentPassword}
                            onChange={(event) => setPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))}
                            required
                          />
                        </label>
                        <label>
                          New password
                          <input
                            type="password"
                            value={passwordForm.newPassword}
                            onChange={(event) => setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))}
                            required
                          />
                        </label>
                        <label>
                          Confirm new
                          <input
                            type="password"
                            value={passwordForm.confirmPassword}
                            onChange={(event) => setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))}
                            required
                          />
                        </label>
                      </div>
                      <button type="submit">Update password</button>
                    </form>
                  </article>
                ) : null}
              </>
            ) : null}

            {snapshot.currentUser?.role === 'manager' ? (
              <>
                {managerTab === 'dashboard' ? (
                  <div className="dashboard-stack">
                    <header className="workspace-header panel">
                      <div>
                        <span className="eyebrow">Signed in</span>
                        <h2>{snapshot.currentUser.displayName}</h2>
                        <p>Manager console</p>
                      </div>
                      <div className="metric-row">
                        <div>
                          <strong>{snapshot.employees.length}</strong>
                          <span>Employees</span>
                        </div>
                        <div>
                          <strong>{pendingLeaveRequests.length}</strong>
                          <span>Pending leave</span>
                        </div>
                        <div>
                          <strong>{snapshot.attendanceSessions.length}</strong>
                          <span>Time logs</span>
                        </div>
                      </div>
                    </header>

                    <article className="panel">
                      <span className="eyebrow">Employee management</span>
                      <div className="stack-list">
                        {managerEmployees.map((employee) => (
                          <div className="list-row" key={employee.id}>
                            <div style={{ flex: 1 }}>
                              <strong>{employee.firstName} {employee.lastName}</strong>
                              <div className="text-muted"><small>@{employee.username} • Date joined: {formatDate(employee.dateJoined)}</small></div>
                              <div className="text-muted"><small>Added: {formatDate(employee.createdAt.slice(0, 10))}</small></div>
                            </div>
                            <div style={{ flex: 1 }}>
                              {employee.passwordChanged ? (
                                <span className="status-badge approved">Password Changed</span>
                              ) : (
                                <div>
                                  <span className="status-badge pending" style={{ marginBottom: '4px', display: 'inline-block' }}>Default Password</span>
                                  <div><small><code>{employee.defaultPassword}</code></small></div>
                                </div>
                              )}
                            </div>
                            <div>
                              <button type="button" className="secondary small" onClick={() => handleDeleteEmployee(employee.id)}>
                                Delete
                              </button>
                            </div>
                          </div>
                        ))}
                        {managerEmployees.length === 0 ? <p className="text-muted">No employees found.</p> : null}
                      </div>
                    </article>
                  </div>
                ) : null}

                {managerTab === 'add_employee' ? (
                  <article className="panel">
                    <span className="eyebrow">Add Employee</span>
                    <p>Create a new employee account with a generated temporary password.</p>
                    <form className="stack-form" onSubmit={handleCreateEmployee}>
                      <div className="grid two-col compact">
                        <label>
                          First name
                          <input
                            value={employeeForm.firstName}
                            onChange={(event) => setEmployeeForm((current) => ({ ...current, firstName: event.target.value }))}
                            required
                          />
                        </label>
                        <label>
                          Last name
                          <input
                            value={employeeForm.lastName}
                            onChange={(event) => setEmployeeForm((current) => ({ ...current, lastName: event.target.value }))}
                            required
                          />
                        </label>
                      </div>
                      <div className="grid two-col compact">
                        <label>
                          Username
                          <input
                            value={employeeForm.username}
                            onChange={(event) => setEmployeeForm((current) => ({ ...current, username: event.target.value }))}
                            required
                          />
                        </label>
                        <label>
                          Date joined organization
                          <input
                            type="date"
                            value={employeeForm.dateJoined}
                            onChange={(event) => setEmployeeForm((current) => ({ ...current, dateJoined: event.target.value }))}
                            required
                          />
                        </label>
                      </div>
                      <button type="submit">Create employee</button>
                    </form>
                  </article>
                ) : null}

                {managerTab === 'leave_requests' ? (
                  <div className="tab-stack">
                    <article className="panel">
                      <span className="eyebrow">Leave Requests</span>
                      <p>Review pending leave applications. Approved and denied requests are removed from this list.</p>
                      <div className="stack-form">
                        <label>
                          Pending request
                          <select value={selectedLeaveId} onChange={(event) => setSelectedLeaveId(event.target.value)}>
                            <option value="">Select a pending leave request</option>
                            {pendingLeaveRequests.map((request) => (
                              <option value={request.id} key={request.id}>
                                {request.employeeName} — {request.type} ({formatDate(request.startDate)} to {formatDate(request.endDate)})
                              </option>
                            ))}
                          </select>
                        </label>
                        <div className="stack-list">
                          {pendingLeaveRequests.length === 0 ? (
                            <p className="text-muted">No pending leave requests.</p>
                          ) : (
                            pendingLeaveRequests.map((request) => (
                              <div className="list-row" key={request.id}>
                                <div>
                                  <strong>{request.employeeName}</strong>
                                  <div className="text-muted">
                                    <small>{request.type} • {formatDate(request.startDate)} to {formatDate(request.endDate)}</small>
                                  </div>
                                  {request.reason ? <div className="text-muted"><small>{request.reason}</small></div> : null}
                                </div>
                                <span className="status-badge pending">{request.status}</span>
                              </div>
                            ))
                          )}
                        </div>
                        {selectedLeaveRequest ? (
                          <>
                            <div className="segmented">
                              <button type="button" className={selectedLeaveStatus === 'approved' ? 'active' : ''} onClick={() => setSelectedLeaveStatus('approved')}>
                                Approve
                              </button>
                              <button type="button" className={selectedLeaveStatus === 'rejected' ? 'active' : ''} onClick={() => setSelectedLeaveStatus('rejected')}>
                                Deny
                              </button>
                            </div>
                            <label>
                              Comment
                              <textarea
                                rows={4}
                                value={selectedLeaveComment}
                                onChange={(event) => setSelectedLeaveComment(event.target.value)}
                                placeholder="Optional manager comment"
                              />
                            </label>
                            <button type="button" onClick={handleReviewLeave}>
                              Save decision
                            </button>
                          </>
                        ) : (
                          <p className="text-muted">Select a pending leave request to review it.</p>
                        )}
                      </div>
                    </article>

                    <article className="panel">
                      <div className="split-header">
                        <div>
                          <span className="eyebrow">Leave exports</span>
                          <h3>Export leave request history</h3>
                        </div>
                        <button type="button" className="secondary" onClick={handleExportLeaveRequests}>
                          Export CSV
                        </button>
                      </div>
                      <div className="grid three-col compact">
                        <label>
                          Status
                          <select
                            value={leaveFilters.status}
                            onChange={(event) =>
                              setLeaveFilters((current) => ({
                                ...current,
                                status: event.target.value as LeaveRequestRecord['status'] | ''
                              }))
                            }
                          >
                            <option value="">All Statuses</option>
                            <option value="pending">Pending</option>
                            <option value="approved">Approved</option>
                            <option value="rejected">Rejected</option>
                          </select>
                        </label>
                        <label>
                          From
                          <input
                            type="date"
                            value={leaveFilters.fromDate}
                            onChange={(event) => setLeaveFilters((current) => ({ ...current, fromDate: event.target.value }))}
                          />
                        </label>
                        <label>
                          To
                          <input
                            type="date"
                            value={leaveFilters.toDate}
                            onChange={(event) => setLeaveFilters((current) => ({ ...current, toDate: event.target.value }))}
                          />
                        </label>
                      </div>
                      <div className="stack-list compact-list leave-export-list">
                        <div className="list-row table-header-row leave-export-row">
                          <span>Employee Name</span>
                          <span>Leave Type</span>
                          <span>Date Applied</span>
                          <span>Date Range</span>
                          <span>Status</span>
                        </div>
                        {filteredLeaveRequests.map((request) => (
                          <div className="list-row leave-export-row" key={request.id}>
                            <span>{request.employeeName}</span>
                            <span>{request.type}</span>
                            <span>{formatDate(request.createdAt.slice(0, 10))}</span>
                            <span>{formatDate(request.startDate)} → {formatDate(request.endDate)}</span>
                            <span className={`status-badge ${request.status}`}>{request.status}</span>
                          </div>
                        ))}
                      </div>
                    </article>
                  </div>
                ) : null}

                {managerTab === 'time_log' ? (
                  <article className="panel">
                    <div className="split-header">
                      <div>
                        <span className="eyebrow">Time Log</span>
                        <h3>Filter and export attendance records</h3>
                      </div>
                      <button type="button" className="secondary" onClick={handleExportTimeLogs}>
                        Export CSV
                      </button>
                    </div>
                    <div className="grid three-col compact">
                      <label>
                        Employee
                        <select
                          value={timeFilters.employeeId}
                          onChange={(event) => setTimeFilters((current) => ({ ...current, employeeId: event.target.value }))}
                        >
                          <option value="">All employees</option>
                          {managerEmployees.map((employee) => (
                            <option value={employee.id} key={employee.id}>
                              {employee.firstName} {employee.lastName}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        From
                        <input
                          type="date"
                          value={timeFilters.fromDate}
                          onChange={(event) => setTimeFilters((current) => ({ ...current, fromDate: event.target.value }))}
                        />
                      </label>
                      <label>
                        To
                        <input
                          type="date"
                          value={timeFilters.toDate}
                          onChange={(event) => setTimeFilters((current) => ({ ...current, toDate: event.target.value }))}
                        />
                      </label>
                    </div>
                    <div className="data-table">
                      <div className="data-table-row data-table-header time-log-cols">
                        <span>Employee Name</span>
                        <span>In</span>
                        <span>Out</span>
                      </div>
                      {filteredTimeSessions.map((session) => (
                        <div className="data-table-row time-log-cols" key={session.id}>
                          <span>{session.employeeName}</span>
                          <span>{formatDateTime(session.clockInAt)}</span>
                          <span>{session.clockOutAt ? formatDateTime(session.clockOutAt) : 'Open'}</span>
                        </div>
                      ))}
                      {filteredTimeSessions.length === 0 ? (
                        <p className="data-table-empty">No attendance records found.</p>
                      ) : null}
                    </div>
                  </article>
                ) : null}

                {managerTab === 'system_status' ? (
                  <article className="panel">
                    <span className="eyebrow">System Status</span>
                    <p>Cloud-first sync and connectivity for the desktop workspace.</p>
                    <div className={`status-card ${snapshot.sync.connected ? 'good' : 'warn'}`} style={{ marginTop: '1rem' }}>
                      <span>{snapshot.sync.connected ? 'Connected' : 'Sync pending'}</span>
                      <strong>{snapshot.sync.message}</strong>
                      <small>{snapshot.sync.pendingActions} pending action(s)</small>
                    </div>
                    <div className="profile-grid" style={{ marginTop: '1rem' }}>
                      <div className="profile-item">
                        <span>Last synced</span>
                        <strong>{formatDateTime(snapshot.sync.lastSyncedAt)}</strong>
                      </div>
                      <div className="profile-item">
                        <span>Network</span>
                        <strong>{snapshot.sync.connected ? 'Online' : 'Offline / pending'}</strong>
                      </div>
                    </div>
                  </article>
                ) : null}

                {managerTab === 'account_settings' ? (
                  <article className="panel">
                    <span className="eyebrow">Account Settings</span>
                    <p>Update the manager master password or reset an employee password.</p>
                    <form className="stack-form" onSubmit={handleMasterPasswordChange}>
                      <h3>Manager master password</h3>
                      <div className="grid three-col compact">
                        <label>
                          Current password
                          <input
                            type="password"
                            value={masterPasswordForm.currentPassword}
                            onChange={(event) => setMasterPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))}
                            required
                          />
                        </label>
                        <label>
                          New password
                          <input
                            type="password"
                            value={masterPasswordForm.newPassword}
                            onChange={(event) => setMasterPasswordForm((current) => ({ ...current, newPassword: event.target.value }))}
                            required
                          />
                        </label>
                        <label>
                          Confirm new
                          <input
                            type="password"
                            value={masterPasswordForm.confirmPassword}
                            onChange={(event) => setMasterPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))}
                            required
                          />
                        </label>
                      </div>
                      <button type="submit">Update manager password</button>
                    </form>
                    <form className="stack-form" onSubmit={handleEmployeePasswordReset} style={{ marginTop: '1.5rem' }}>
                      <h3>Employee password reset</h3>
                      <div className="grid three-col compact">
                        <label>
                          Employee
                          <select
                            value={employeeResetForm.employeeId}
                            onChange={(event) => setEmployeeResetForm((current) => ({ ...current, employeeId: event.target.value }))}
                            required
                          >
                            <option value="">Select employee</option>
                            {managerEmployees.map((employee) => (
                              <option value={employee.id} key={employee.id}>
                                {employee.firstName} {employee.lastName} (@{employee.username})
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          New password
                          <input
                            type="password"
                            value={employeeResetForm.newPassword}
                            onChange={(event) => setEmployeeResetForm((current) => ({ ...current, newPassword: event.target.value }))}
                            required
                          />
                        </label>
                        <label>
                          Confirm new
                          <input
                            type="password"
                            value={employeeResetForm.confirmPassword}
                            onChange={(event) => setEmployeeResetForm((current) => ({ ...current, confirmPassword: event.target.value }))}
                            required
                          />
                        </label>
                      </div>
                      <button type="submit">Reset employee password</button>
                    </form>
                  </article>
                ) : null}
              </>
            ) : null}
          </section>
        ) : null}
      </main>
    </div>
  );
}
