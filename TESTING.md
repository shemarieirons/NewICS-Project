# Testing Guide for Irons Workforce Tracker Phase 1

This guide walks through all Phase 1 flows and validates the end-to-end experience.

## Quick Start: Development Mode

The app supports two testing modes:

### Mode 1: Demo Mode (No Supabase needed)

Use dummy Supabase credentials to test the full UI without a real backend:

1. **Start the dev server:**
   ```bash
   npm run dev
   ```
   The Electron window opens with the installation wizard.

2. **Complete the wizard** with demo credentials:
   - **Supabase URL:** `https://demo.supabase.co`
   - **API Key:** `demo_key_1234567890abcdefghijklmnop`
   - **Master Password:** `demomanager123`

   The connection will be marked as offline (Supabase demo credentials won't connect),
   but the app will continue to local SQLite mode.

3. **Test employee login:**
   - Switch to "Employee" role
   - Username: (create one via manager first)
   - Password: (manager will show on creation)

4. **Test manager login:**
   - Role: Manager
   - Password: `demomanager123`

---

### Mode 2: Real Supabase Project

If you have a Supabase account:

1. **Create a new Supabase project** at https://supabase.com
2. **Run the SQL setup** in the Supabase Query Editor to create tables:
   ```sql
   -- Employees table
   CREATE TABLE employees (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     fname TEXT NOT NULL,
     lname TEXT NOT NULL,
     username TEXT NOT NULL UNIQUE,
     dob DATE NOT NULL,
     password_hash TEXT NOT NULL,
     created_at TIMESTAMP DEFAULT now()
   );

   -- Attendance sessions
   CREATE TABLE attendance_sessions (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     employee_id UUID NOT NULL REFERENCES employees(id),
     clock_in_at TIMESTAMP NOT NULL,
     clock_out_at TIMESTAMP,
     synced BOOLEAN DEFAULT false,
     created_at TIMESTAMP DEFAULT now()
   );

   -- Leave requests
   CREATE TABLE leave_requests (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     employee_id UUID NOT NULL REFERENCES employees(id),
     start_date DATE NOT NULL,
     end_date DATE NOT NULL,
     reason TEXT NOT NULL,
     status TEXT DEFAULT 'pending',
     manager_comment TEXT,
     created_at TIMESTAMP DEFAULT now(),
     updated_at TIMESTAMP DEFAULT now(),
     synced BOOLEAN DEFAULT false
   );
   ```

3. **Get your API credentials:**
   - Open Supabase project settings
   - Copy the project URL (under Project URL)
   - Copy the Anon Key (under API Keys)

4. **Run the app and enter real credentials:**
   ```bash
   npm run dev
   ```
   - Complete the wizard with your real Supabase URL and API key
   - Create employees via manager console
   - Test clock in/out and leave requests (synced to your cloud database)

---

## Testing Checklist

### Installation Wizard
- [ ] Wizard displays on first launch
- [ ] Validation rejects invalid Supabase URL
- [ ] Validation rejects empty API key
- [ ] Validation rejects empty master password
- [ ] Wizard does not re-run after completion
- [ ] Sync status shows "Connected" or "Sync pending" after setup

### Authentication
- [ ] Employee login works with username + password
- [ ] Manager login works with master password only
- [ ] Invalid credentials show error message
- [ ] Logout clears user session

### Employee Experience
- [ ] Clock in button creates a session
- [ ] Clock out button closes the open session
- [ ] Cannot clock in twice without clocking out
- [ ] Time logs display in employee history (latest 6 shown)
- [ ] Leave request form accepts dates and reason
- [ ] Leave requests appear in manager queue within 5 seconds
- [ ] Password change form validates matching new/confirm password
- [ ] Password change syncs immediately

### Manager Experience
- [ ] Manager dashboard shows employee count, pending leave, and today's events
- [ ] Employee creation form auto-generates password (fname[0] + lname[0] + day_of_birth)
- [ ] Created employees appear in employee list
- [ ] Leave review allows selecting a request, choosing approve/reject, adding comment
- [ ] Decision saves immediately and updates status
- [ ] Time log export produces valid CSV with clock in/out records
- [ ] Leave export produces valid CSV with request details

### Offline & Sync
- [ ] With network off, "Offline queue active" appears in status
- [ ] Actions still work offline (clock in/out, leave requests)
- [ ] Pending actions counter increments during offline use
- [ ] When network returns, sync status returns to "Connected"
- [ ] Pending actions sync within 5 seconds of network return
- [ ] No duplicate records created on sync retry

### CSV Export
- [ ] Time log CSV has columns: id, employeeName, clockInAt, clockOutAt, synced
- [ ] Leave request CSV has columns: id, employeeName, startDate, endDate, reason, status, managerComment, createdAt, updatedAt
- [ ] CSV files are readable in Excel or standard viewers
- [ ] Export respects date/status filters

---

## Testing Workflow Example

**Day 1: Setup**
1. Start app: `npm run dev`
2. Complete wizard with demo or real Supabase credentials
3. Manager login with master password

**Day 2: Employee Lifecycle**
1. Manager creates employee "Alice Smith" (username: asmith, DOB: 1995-03-15)
   - App generates password: `as15`
2. Manager creates employee "Bob Johnson" (username: bjohnson, DOB: 1990-07-22)
   - App generates password: `bj22`
3. Logout, then employee login as Alice with `as15`
4. Alice clocks in
5. Alice submits leave request for next Monday-Friday
6. Alice logs out
7. Manager login as manager (password: demomanager123)
8. Manager sees Alice's leave request in pending queue
9. Manager approves with comment: "Approved - enjoy your vacation"
10. Manager exports time logs and leave requests as CSV

**Day 3: Offline Testing**
1. Turn off WiFi
2. Employee login as Bob
3. Bob clocks in (no network, synced = false)
4. Bob clocks out (still no network, synced = false)
5. Manager login (master password works locally)
6. Turn WiFi back on
7. Sync status returns to "Connected"
8. Pending actions counter goes to 0
9. Verify records are now synced to Supabase (or local if demo mode)

---

## Debugging

**Enable console logs:** Open DevTools with Cmd+Option+I (Mac) or Ctrl+Shift+I (Windows/Linux)

**Check SQLite database:**
The local SQLite file is at: `~/Library/Application Support/irons-workforce-tracker/irons-workforce-tracker.sqlite` (macOS)

**Check main process logs:** DevTools Console tab shows main process output.

---

## What's Ready

✅ Phase 1 MVP Complete:
- Employee and manager authentication
- Attendance tracking with clock in/out
- Leave request workflow with manager review
- Employee creation and password change
- CSV export for time logs and leave requests
- Local SQLite cache and sync queue
- Cloud-first Supabase sync architecture
- Sync status and offline resilience

## What's Next

🔄 Phase 2+ (Post-launch):
- Email notifications
- Advanced filtering and search
- Bulk employee import
- Network folder shared database (alternative to Supabase)
- Payroll and scheduling features
