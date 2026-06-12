# Project Overview & Commands

## Project Structure

```
/Users/shem/New Irons HR APP/
├── src/
│   ├── main/
│   │   ├── index.ts           # Electron main process & IPC handlers
│   │   ├── store.ts           # SQLite business logic
│   │   └── supabase.ts        # Cloud sync client
│   ├── renderer/
│   │   ├── src/
│   │   │   ├── App.tsx        # React root component (all screens)
│   │   │   ├── styles.css     # App styling
│   │   │   └── main.tsx       # React entry
│   │   └── index.html         # HTML template
│   ├── preload/
│   │   └── index.ts           # IPC preload bridge
│   └── shared/
│       └── types.ts           # Shared TypeScript types
├── README.md                  # Feature overview
├── TESTING.md                 # Detailed testing guide
├── TESTING-QUICK.md           # Quick reference tests
├── package.json               # Dependencies, scripts, build config
├── tsconfig.json              # TypeScript config
├── vite.config.ts             # Vite config for electron-vite
└── dist/                      # Built output (generated)
```

## Commands

### Development

| Command | Purpose |
|---------|---------|
| `npm install` | Install dependencies |
| `npm run dev` | Start dev server (hot reload) |
| `npm run typecheck` | Validate TypeScript |
| `npm run build` | Build production bundles |

### Distribution

| Command | Purpose |
|---------|---------|
| `npm run dist` | Package for all platforms |
| `npm run dist:mac` | macOS .app |
| `npm run dist:win` | Windows installer |
| `npm run dist:linux` | Linux AppImage |

### Project Scripts in `package.json`

```json
{
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "dist": "npm run build && electron-builder",
    "dist:mac": "npm run build && electron-builder --mac",
    "dist:win": "npm run build && electron-builder --win",
    "dist:linux": "npm run build && electron-builder --linux",
    "preview": "electron-vite preview",
    "typecheck": "tsc --noEmit"
  }
}
```

## Full Workflow: From Zero to Running

### 1. Clone/open workspace
```bash
cd /Users/shem/New\ Irons\ HR\ APP
```

### 2. Install dependencies
```bash
npm install
```

### 3. Validate TypeScript
```bash
npm run typecheck
```

### 4. Start development
```bash
npm run dev
```

**The Electron window opens with:**
- Installation wizard on first launch
- Manager dashboard after setup

### 5. Test Phase 1 flows
See [TESTING-QUICK.md](TESTING-QUICK.md) for 5-minute end-to-end test.

### 6. Build for production
```bash
npm run build
```

Outputs to `dist/` and `out/renderer/`.

### 7. Package for distribution
```bash
npm run dist
```

Outputs to `release/mac-arm64/`, `release/win-unpacked/`, etc.

## Dependency Breakdown

### Runtime Dependencies
- `react` - UI framework
- `react-dom` - React DOM renderer
- `electron-vite` - Build tool for Electron
- `better-sqlite3` - Local SQLite
- `@supabase/supabase-js` - Cloud sync client

### Dev Dependencies
- `typescript` - Type checking
- `@types/react`, `@types/react-dom`, `@types/node`, `@types/better-sqlite3` - Type definitions
- `vite` - Bundler
- `@vitejs/plugin-react` - React plugin for Vite
- `electron` - Electron runtime
- `electron-builder` - App packaging

## Build Configuration

### Electron Builder (in `package.json` `build` field)
- **appId:** `com.ironsworkforce.tracker`
- **Files:** dist, out/renderer, package.json
- **Mac:** DMG format, no code signing (npmRebuild: false, identity: null)
- **Windows:** NSIS installer
- **Linux:** AppImage

### Vite / Electron-Vite
- **Main process:** `src/main/index.ts` → `dist/main/index.js`
- **Preload:** `src/preload/index.ts` → `dist/preload/index.mjs`
- **Renderer:** `src/renderer/src/main.tsx` → `out/renderer/assets/`

## Database

**Location:** `~/Library/Application Support/irons-workforce-tracker/irons-workforce-tracker.sqlite` (macOS)

**Tables:**
- `settings` - Supabase config, master password, sync state
- `employees` - User profiles with hashed passwords
- `attendance_sessions` - Clock in/out records
- `leave_requests` - Leave requests with approval status
- `sync_queue` - Offline action queue

## Deployment Checklist

- [ ] Run `npm run typecheck` and verify no errors
- [ ] Run `npm run build` and verify no errors
- [ ] Run `npm run dist` and verify `release/` contains app
- [ ] Test the packaged app by running it directly
- [ ] (Optional) Set up Supabase project for cloud sync
- [ ] Distribute `.dmg`, `.exe`, `.AppImage` from `release/`

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Build fails with "Cannot find module 'electron'" | Run `npm install` |
| TypeScript errors | Run `npm run typecheck` to see details |
| App won't start | Check DevTools (Cmd+Option+I) for console errors |
| Packaging fails with gyp error | Already fixed in this project (npmRebuild: false) |
| Database corruption | Delete sqlite file and restart wizard |

## What's Production-Ready

✅ Phase 1 MVP complete and tested:
- Installation wizard
- Employee/manager authentication
- Attendance tracking with sync status
- Leave request workflow
- CSV export
- Offline resilience
- Cross-platform packaging

## What's Not Included

❌ Not in Phase 1:
- Email notifications
- Advanced search/filtering
- Payroll calculations
- Attendance rules (schedules, overtime)
- User permissions beyond manager/employee
- Audit logging
- Multi-tenant organization support

## Next Steps

1. **Deploy:** Distribute the packaged app from `release/`
2. **Set up Supabase:** Create a project and run the SQL schema
3. **Configure:** Users run wizard with their Supabase credentials
4. **Monitor:** Check DevTools console for sync errors
5. **Iterate:** Gather feedback for Phase 2 features

---

**Questions?** Check [README.md](README.md), [TESTING.md](TESTING.md), or [TESTING-QUICK.md](TESTING-QUICK.md).
