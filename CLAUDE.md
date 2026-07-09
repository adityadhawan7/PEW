# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # start Vite dev server (http://localhost:5173)
npm run build     # production build to dist/
npm run preview   # serve the production build locally
```

There is no test suite, linter, or type checker configured in this project.

## What this is

FactoryOS is a single-page factory floor management dashboard: machine status/production tracking, casting-type routing, stock/WIP, attendance, wages, and alerts. It was migrated from a single-file HTML prototype into this Vite + React project — that original file has since been removed from the repo (it predates Firebase Auth, so it no longer works against the current Firestore rules anyway). The migration was a straight structural port: components, business logic, and CSS class names were kept verbatim, just split into files.

## Data layer: Firestore via a small wrapper

All persistence goes through `src/firebase.js`, which exports a single `fb` object. Two data schemes live side by side:

**Legacy flat-doc scheme** — everything except users. One Firestore document per key, all inside a single collection literally named `factoryos`:
```js
fb.get(key)          // read a document's `value` field
fb.set(key, value)   // write a document's `value` field
fb.sub(key, cb)      // onSnapshot subscription, cb receives the value
```
Known keys: `machines`, `alerts`, `casting_types`, `wip`, `stock_log`, `attendance`, `sessions`, `wage_log`, `adjustments`, `orders`, `maintenance_schedules`, `maintenance_log`, `inspection_log`. **Do not rename these keys** — this app reads/writes the same live Firestore project (`pew-production-dev`) that the original HTML prototype used. The old `factoryos/users` doc still exists but is deprecated/read-only — see Authentication below.

**User profiles** — a real collection, `factoryos_users/{uid}`, one doc per user: `fb.getUserProfile(uid)`, `fb.listUserProfiles()` (staff-only), `fb.findUserProfileByUsername(username)` (staff-only), `fb.createUserWithProfile(username, password, profile)`, `fb.setUserProfile(uid, profile)`, `fb.deleteUserProfile(uid)` (all admin-only except the self-scoped `getUserProfile`).

Firebase config comes from `import.meta.env.VITE_FIREBASE_*` (see `.env` / `.env.example`), not hardcoded.

Almost all Firestore reads/writes for operational data happen inside `Dashboard.jsx` — it loads the flat-doc keys on mount, subscribes to live updates via `fb.sub`, and debounces writes of `machines` (600ms after any change). Modals that mutate shared state (e.g. `CastingTypesModal`, `StockModal`, `AttendanceModal`) call `fb.set` directly rather than routing through Dashboard. User-profile-consuming modals (`UserModal`, `AssignModal`, `AttendanceModal`, `WageRegisterModal`) each self-fetch via `fb.listUserProfiles()` in their own `useEffect` on mount — `Dashboard.jsx` deliberately does **not** hold a central `users` list, since `listUserProfiles()` is staff-only and Dashboard is rendered for every role including plain operators.

## Authentication

Firebase Authentication (Email/Password) gates all Firestore access — see `firestore.rules` in the repo root. Usernames aren't emails, so sign-in uses a synthetic address under the hood (`${username}@factoryos.local`, see `toEmail` in `firebase.js`); the UI still shows a plain username field. Session persistence is `browserSessionPersistence` (cleared on browser close) — deliberate, since shop-floor terminals get handed off between operators across shifts and must not carry a stale login.

`App.jsx` drives the auth flow via `fb.onAuthChange`, fetching the signed-in user's own `factoryos_users` profile doc before rendering `Dashboard`. If a Firebase Auth session is valid but the profile doc is missing (an admin removed the user), `App.jsx` signs them out immediately with an explanatory message — that's the intended way "remove user" revokes access, see the caveat below.

Creating a new user (`UserModal` → `fb.createUserWithProfile`) spins up a throwaway secondary Firebase App instance so the client SDK's `createUserWithEmailAndPassword` doesn't sign the admin out of their own session — see the comment in `firebase.js`.

Removing a user (`UserModal` → `fb.deleteUserProfile`) calls the `deleteUserAccount` Cloud Function (`functions/index.js`) rather than deleting the Firestore doc directly — this fully deletes both the Firebase Auth credential and the profile doc in one step, so a removed user's username/password stops working immediately. The function itself re-checks that the caller is an admin (reads the caller's own profile doc server-side) — never trust the client-side `isAdmin` UI gate alone for this.

**Known, accepted limitation**: there's no in-app password reset for existing users (synthetic emails mean Firebase's native reset-email flow has nowhere to deliver, and this project intentionally doesn't have a `resetUserPassword` Cloud Function). The workaround is: remove the user, then re-add them with a new password. If this becomes painful, adding a second small callable function alongside `deleteUserAccount` (same admin-check pattern, calling `admin.auth().updateUser(uid, {password})`) is a small, low-risk addition — infrastructure (Blaze plan, Firebase CLI, `functions/` directory) is already in place.

`firestore.rules` and `functions/` are version-controlled here but not auto-deployed — run `firebase deploy --only firestore:rules,functions` (or deploy each separately) once you have the Firebase CLI installed and are logged in. See `firestore.rules`' own header comment for the required rollout order (app must ship and be verified *before* the rules are tightened, never the other way around, or you lock every client out). Cloud Functions require the Blaze (pay-as-you-go) plan.

## Component architecture

```
src/
  constants.js   — seed/config data: MACHINES_SEED, SHIFT_CFG, BADGE, DEFAULT_USERS, etc.
  utils.js       — pure helpers: shift-slot logic, WIP/routing resolution, OT pay calc
  firebase.js    — the fb wrapper described above
  App.jsx        — auth gate: tracks Firebase Auth state, renders LoginScreen or Dashboard
  components/ErrorBoundary.jsx — class component wrapping <App/> in main.jsx
  components/
    *.jsx              — one file per modal/banner (Modal, LoginScreen, UserModal,
                          CastingTypesModal, AssignModal, StockModal, etc.)
    dashboard/
      Dashboard.jsx    — owns ALL state (~25 useState), effects, and handlers; the
                         single source of truth for machines/alerts/castingTypes/wip/etc.
      Topbar.jsx, ShiftBanner.jsx, StatsRow.jsx, MachineGrid.jsx, OutputChart.jsx,
      ShiftOverview.jsx, MachineDetailPanel.jsx, AlertsPanel.jsx, AlertItem.jsx
                       — presentational subcomponents; they receive state and setters
                         as props from Dashboard and contain no Firestore calls of
                         their own (except via callbacks passed down).
```

`Dashboard.jsx` is the one file where nearly everything converges — any change to machine/shift/casting-type state, or to which modal is open, touches this file. When adding a new modal or dashboard panel, follow the existing pattern: state and `fb.set` calls live in `Dashboard.jsx`, the panel itself is a prop-driven component with no direct Firestore access.

## Domain model — shifts, casting types, routing

- **Machines** are either `cnc_vmc` (day/night shift slots, stored under `machine.shifts.day` / `machine.shifts.night`, each an independent assignment) or `manual` (single flat shift, fields directly on the machine object). Use `getSlot`/`withShift`/`patchMachineShift` from `utils.js` to read/write machine state — never access `machine.shifts.day` etc. directly, since manual machines don't have a `shifts` object at all.
- **Casting types** define a raw material plus one or more **routes**, each an ordered list of **steps**. A step is either `fixed` (one specific node/operation) or `floating` (a group of nodes that can run in any order relative to each other, sharing a WIP pool keyed by the group's gate). See `resolveStage`, `routeNodeIds`, and the WIP-key helpers (`wipKey`, `getWip`) in `utils.js`.
- **Side-tracks** (`route.sideTracks[]`) extend this for operations that can run any time relative to OTHER backbone steps too, not just relative to each other — e.g. "Drill Tap and Spot Face can happen any time after Bore-Face-OD, before or after Milling or Side Drill, but both must finish before Balance." Each entry is `{nodeIds, unlocksAfterStepIndex, joinsBeforeStepIndex}`. The join is computed from monotonic cumulative counters (`chainarrived`/`tracksarrived`/`joinreleased` WIP keys), never from `min()` of two live/depletable pools — see the large header comment on `computeShiftCompletionUpdate` in `utils.js` for why the naive version silently produces wrong numbers once the two sides finish on separate shifts. v1 only supports one side-track per join point.
- **WIP** (work-in-progress) tracks how many pieces are ready to enter each route step. It's a flat `{[wipKey]: count}` map. `normalizeCastingTypes` migrates older/looser Firestore data shapes (pre-routing `{stages:[...]}`, flat `{nodeIds:[...]}` routes, or routes saved before side-tracks existed) into the current `{steps:[...], sideTracks:[...]}` shape — call it on any casting-type data read from Firestore before trusting its shape.
- `handleShiftComplete` in `Dashboard.jsx` calls `computeShiftCompletionUpdate` (in `utils.js`), the most complex piece of business logic: it moves consumed/produced pieces through the WIP graph (raw stock → fixed/floating/side-track steps → finished units), logs stock movements, and calculates overtime pay via `calcOtPay`. Read it carefully before modifying — the floating-step WIP release logic (via a "gate" and per-node "done" counters) and the side-track join logic are not obvious from a quick skim.

## Wages — piece-rate vs daily

Each operator profile has a `wageType`: `'production'` (piece-rate) or `'daily'` (missing = `'daily'`). Pay rules live in two pure helpers in `utils.js` — `computeShiftPay` (one wage_log entry → pay: ≥target = full wage + `calcOtPay` overtime; <target gated by the shortfall review: approved = full, disapproved/pending = proportional) and `computeOperatorDayPay` (production users sum shift pays — multi-machine days can exceed one daily wage — falling back to attendance on no-shift days; daily users get attendance × wage + OT).

`handleShiftComplete` writes a **facts-only** entry (produced/target/ratePerHour/status, no money) to the `wage_log` flat doc (capped 2000, newest first); `handleDecisionSubmit` settles pending entries via the `alertId` join. `WageRegisterModal` computes money at read time from these facts × the operator's *current* dailyWage. Do not compute payroll from `alerts` — that doc is capped at 200 and drops older entries.

Manual pay adjustments live in the `adjustments` flat doc (capped 3000): entries `{username, date, type:'food'|'conveyance'|'advance', amount, note, recordedBy}`, entered on the Wage register's "Allowances & advances" tab. Food/conveyance add to net payable, advances deduct; an over-advanced period shows a negative net (flagged red) that the admin settles/carries manually — there is deliberately no automatic balance carry-forward. `ratePerHour` is snapshotted per entry because setup-time-adjusted targets break the naive `(extra/target)×wage` ratio (see the regression test in `utils.test.js`).

## Customer orders

The `orders` flat doc (capped 500) holds multi-line customer orders: `{id, customer, poRef, notes, createdDate, dueDate, createdBy, status:'open'|'completed'|'cancelled', items:[{castingTypeId, qty, dispatched}]}` — one line per casting type, no duplicates, no pricing (accounting is out of scope). Managed in `OrdersModal` (admin+supervisor topbar button, which shows a ⚠N badge for open orders overdue/due within 3 days via `orderDueState` in `utils.js`). Dispatching from StockModal's Stock out tab can optionally target an order line — `applyDispatchToOrder` (pure, tested) increments the line's `dispatched` (allowed to exceed qty) and auto-completes the order when every line is filled. Loose dispatches deliberately never touch orders; orders are cancelled, never deleted; there is no stock reservation per order (finished-on-hand shown for context only).

## Preventive maintenance

`maintenance_schedules` (cap 200): `{id, machineId, title, intervalDays, lastDoneDate, notes, createdBy}` — next due = lastDoneDate + intervalDays via `maintenanceDueDate`/`maintenanceDueState` in `utils.js` (7-day due-soon lead vs 3 for orders; both delegate to the shared `dueStateForDate`). Marking done appends to `maintenance_log` (cap 1000: `{scheduleId|null, machineId, machineName, title, date, cost|null, note, doneBy}`) AND bumps the schedule's `lastDoneDate`, rolling the due date forward. Ad-hoc entries (`scheduleId:null`) log unscheduled repairs. `MaintenanceModal` (admin+supervisor topbar button with ⚠N badge). Cost is an optional number on log entries — history, not accounting. Deleting a schedule keeps its log entries.

## Analytics

`AnalyticsView` (in `src/components/dashboard/`) is a full-page view toggled from the topbar "Analytics" button (admin+supervisor) — it swaps the `main-layout` block while Topbar/ShiftBanner stay. All aggregation math lives in pure, tested `aggregate*` helpers in `utils.js` (daily output, machine/operator efficiency, defects by casting type, breakdown Pareto, maintenance cost). Data caveats: breakdown history comes from `alerts` (capped 200 → shallow); consumption for defect rates excludes `stageLabel:'Finished goods dispatch'` stock_log rows (dispatches are not production); OT ₹ KPI computes via `computeShiftPay` at current wages. Charts are CSS bars (OutputChart idiom) — no chart library.

The foundry scorecard section attributes casting defects to suppliers via `aggregateFoundryScore`: each casting type is assumed **single-sourced** (confirmed with the owner), its foundry being the supplier on its latest stock-in entry across the whole log; machining defects are excluded (our fault, not the foundry's); supplier names are normalized trim+case-insensitive (blank → "(unspecified)" bucket). StockModal's Stock in supplier field has a datalist of previously used names to prevent name drift.

## Inspections

The spec/1st-piece/2nd-piece measurement table (`LineInspectionModal`) serves two flows via its `mode` prop: `'setting'` (titled "Setting Approval" — operator submits first-off sizes, supervisor approves/rejects via `SettingDecisionModal`) and `'inspection'` (titled "Line Inspection" — a supervisor/admin-only button under MARK SHIFT COMPLETE records an in-shift check with no approval loop). Both write durable audit entries to the `inspection_log` flat doc (cap 1000, filled rows only: `{kind:'setting'|'inspection', alertId|null, machineId, rows, recordedBy, status/decisionNote/decidedBy for settings}`); `handleSettingDecision` settles setting entries via the alertId join. `InspectionLogModal` ("Inspections" topbar button, admin+supervisor) is the read-only viewer with date/machine filters and a window.open print register.

## PWA

`public/manifest.webmanifest` + icons in `public/icons/` (generated PNGs in the app palette) + apple-touch/meta tags in `index.html` make the app installable to phone home screens. **Deliberately no service worker**: the app requires live Firestore anyway, install works without one on modern Chrome/iOS, and a service worker's stale cache would delay Netlify updates reaching shop-floor devices — do not add one without revisiting that trade-off.

## Report/print modals

`DownloadModal`, `BreakdownHistoryModal`, and `WageRegisterModal` generate printable output by building an HTML string client-side and opening it in a new window (`window.open` + `document.write` + `.print()`). This is intentional — don't refactor these into React-rendered print views without discussing it first, since it changes how the generated document is styled/printed.
