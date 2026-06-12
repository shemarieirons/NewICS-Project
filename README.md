# Irons Workforce Tracker

Electron + React desktop app for Phase 1 HR: installation wizard, employee/manager auth, attendance tracking, leave requests, manager review, CSV export, and cloud-first Supabase sync.

## Quick Start

### Development

```bash
npm install
npm run dev
```

The app opens in a dev window with hot reload. Complete the installation wizard on first launch using demo or real Supabase credentials.

### Testing

For end-to-end walkthrough including demo mode (no Supabase account required), see **[TESTING.md](TESTING.md)**.

**Quick test:** Run `npm run dev`, enter demo Supabase URL and key in wizard, then test employee clock in/out and manager leave approval.

## Production Build & Packaging

```bash
npm run typecheck     # Validate TypeScript
npm run build         # Build production bundles
npm run dist          # Package for all platforms
npm run dist:mac      # macOS .app
npm run dist:win      # Windows installer
npm run dist:linux    # Linux AppImage
```

Packages are output to `release/` directory.

## Architecture

| Component | Purpose |
|-----------|---------|
| `src/main/store.ts` | SQLite local persistence, business logic |
| `src/main/supabase.ts` | Cloud sync client for Supabase |
| `src/main/index.ts` | Electron IPC handlers |
| `src/renderer/src/App.tsx` | React UI (wizard, login, dashboards) |
| `src/shared/types.ts` | Shared TypeScript types |

**Sync Model:** Cloud-first (Supabase) with local SQLite cache. Offline actions queue for replay on reconnect. Last-write-wins conflict resolution.

## Phase 1 Features Complete

✅ Installation wizard (Supabase setup, master password)
✅ Employee & manager login
✅ Attendance tracking (clock in/out, synced)
✅ Leave request workflow (submit, approve/reject)
✅ Employee creation with auto-generated passwords
✅ Password change
✅ CSV export (time logs, leave requests)
✅ Offline resilience & sync queue
✅ Real-time sync status indicator
✅ Cross-platform packaging
✅ TypeScript strict mode
✅ Supabase cloud sync fully integrated

## Development Notes

- **Database:** SQLite locally at `~/Library/Application Support/irons-workforce-tracker/` (macOS)
- **Passwords:** SHA256 hashed before storage
- **Security:** Context isolation, sandbox mode enabled
- **Demo Mode:** Works with invalid Supabase credentials for local-only testing
- **Offline:** Actions queue automatically on network loss, replay on reconnect

## What's Next

Phase 2+ features (post-MVP):
- Email notifications for leave decisions
- Advanced filtering & search
- Bulk employee import
- Payroll integrations
- Scheduling features
