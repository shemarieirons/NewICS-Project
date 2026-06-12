# How to Test: Quick Reference

## 30-Second Test (Verify App Runs)

```bash
npm run dev
```

- Wizard appears
- Enter any Supabase URL (e.g., `https://demo.supabase.co`)
- Enter any API key (e.g., `demo_key_test`)
- Enter master password (e.g., `manager123`)
- Click "Complete Setup"
- You should see the manager dashboard

✅ If dashboard appears: Build is working.

---

## Full Workflow Test (5 minutes)

### Step 1: Setup
```bash
npm run dev
```

**In the wizard:**
- Supabase URL: `https://demo.supabase.co`
- API Key: `demo_key_1234567890`
- Master Password: `demomanager`
- Click "Complete Setup"

### Step 2: Create an employee (Manager console)
1. Click "Create Employee"
2. First Name: `Alice`
3. Last Name: `Smith`
4. Username: `asmith`
5. DOB: `1995-03-15`
6. Click "Create"
7. Note the generated password shown (e.g., `as15`)

### Step 3: Employee experience
1. Click "Logout"
2. Switch to "Employee" role
3. Username: `asmith`
4. Password: `as15` (from step 2)
5. Click "Login"
6. Click "Clock In" (time appears)
7. Click "Clock Out" (duration calculated)

### Step 4: Leave request
1. From employee dashboard, click "Submit Leave"
2. Start Date: Tomorrow
3. End Date: One week from now
4. Reason: "Vacation time"
5. Click "Submit"

### Step 5: Manager approval
1. Click "Logout"
2. Switch to "Manager" role
3. Password: `demomanager`
4. Click "Login"
5. In "Pending Requests", click Alice's leave request
6. Select "Approve"
7. Add comment: "Looks good!"
8. Click "Review"
9. Request status changes to "approved"

### Step 6: Export
1. From manager dashboard, click "Export Time Logs"
2. A CSV file downloads
3. Open in Excel/Numbers to verify

✅ All steps complete: Phase 1 works end-to-end.

---

## Offline Test (3 minutes)

### Prerequisites
- App must be running (`npm run dev`)
- Complete wizard
- Create an employee
- Log in as that employee

### Test Steps
1. **Disconnect WiFi** (or toggle airplane mode)
2. Clock in the employee
3. Verify status shows "Offline queue active"
4. Click "Submit Leave"
5. Verify leave appears in your pending list (locally)
6. **Reconnect WiFi**
7. Verify status returns to "Connected"
8. Check "Pending actions" counter goes to 0

✅ Actions queue during offline, sync on reconnect.

---

## CI/CD Build Test

```bash
npm run typecheck     # TypeScript validation
npm run build         # Production bundle
npm run dist:mac      # macOS packaging
```

All three commands should complete without errors.

✅ Build passes: Ready for distribution.

---

## Supabase Integration Test (Requires Supabase Account)

If you have a Supabase project:

1. Create a new Supabase project at https://supabase.com
2. Run the SQL setup from [TESTING.md](TESTING.md) under "Real Supabase Project"
3. Get your Supabase URL and API key
4. Run `npm run dev`
5. Enter **real** Supabase credentials in wizard
6. Create an employee
7. Clock in/out and submit leave
8. Open Supabase dashboard → Data Editor
9. Navigate to `employees` table
10. Verify your new employee appears

✅ Real Supabase integration working.

---

## Debugging

### App won't start
```bash
npm install
npm run build
```

### TypeScript errors
```bash
npm run typecheck
```

### Check logs
- Open DevTools: **Cmd+Option+I** (Mac) or **Ctrl+Shift+I** (Windows/Linux)
- Check "Console" tab for errors

### Reset local database
```bash
rm ~/Library/Application\ Support/irons-workforce-tracker/irons-workforce-tracker.sqlite
npm run dev
```

This clears the local database and re-runs the wizard.

---

## What's Tested

- ✅ UI renders without crashes
- ✅ Wizard accepts and stores setup
- ✅ Employee CRUD (create, read, update password)
- ✅ Manager CRUD (read all, create new employees)
- ✅ Attendance (clock in/out, synced flag)
- ✅ Leave workflow (submit, approve, reject)
- ✅ CSV export (time logs, leave requests)
- ✅ Offline queue (actions persist when offline)
- ✅ Sync recovery (actions replay on reconnect)
- ✅ Build validates (TypeScript, production bundle, packaging)

---

## Next: Deploy

When ready for production:

1. Set up a Supabase project with the schema from [TESTING.md](TESTING.md)
2. Build for distribution: `npm run dist`
3. Sign & notarize for macOS (optional but recommended for distribution)
4. Distribute `.dmg` (macOS), `.exe` (Windows), `.AppImage` (Linux) from `release/`
