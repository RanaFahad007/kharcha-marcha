# SplitTrack — Multi-User & Multi-Group Expense Tracker & Bill Splitting

A production-ready, Splitwise-like web app for university friend groups and
families. Multi-user, multi-group, with JWT auth, invite codes, approval
workflows, edit-once expense rules, debt simplification ("who owes whom"),
role-based exports, and a 1-click demo sandbox for live showcases.

- **Backend:** Node.js + Express + MongoDB/Mongoose, JWT, bcryptjs, CORS, dotenv
- **Frontend:** React 18 + Vite 5 + Tailwind CSS + Lucide-React + Axios +
  jsPDF / jspdf-autotable
- **Languages:** English, Roman Urdu, Arabic (full UI dictionaries)

## Project structure

```text
splittrack/
├── README.md
├── .gitignore                 # .env files are gitignored — never commit them
├── server/                     # Express API (port 5000)
│   ├── server.js               # entrypoint; mongoose.connect with dbName 'splittrack'
│   ├── .env                    # LOCAL ONLY — real secrets; gitignored
│   ├── .env.example            # placeholder values only
│   ├── package.json
│   ├── models/                 # User, Group, Membership, Expense
│   ├── middleware/auth.js      # authenticateJWT, requireGroupMember,
│   │                           # requireGroupAdmin, requireSuperAdmin
│   ├── utils/debtSimplifier.js # computeBalances + greedy min-transaction simplifyDebts
│   ├── controllers/            # auth, group, expense, demo
│   ├── routes/api.js           # all /api routes
│   └── scripts/migrateLegacyData.js
└── client/                     # React + Vite app (port 5173)
    ├── vite.config.js          # /api proxied to http://localhost:5000
    ├── tailwind.config.js
    ├── index.html
    └── src/
        ├── main.jsx  App.jsx  index.css
        ├── i18n/locales.js     # en / ur / ar — 176 keys each
        ├── context/AppContext.jsx
        ├── utils/exportGenerator.js  # CSV + PDF (jsPDF/autotable)
        ├── components/         # Navbar, OnboardingCards, InviteModal,
        │                       # ExpenseModal, WhoOwesWhomCard
        └── pages/              # AuthPage, JoinGroupScreen,
                                # GroupDashboard, AdminPanel
```

## Prerequisites

- Node.js >= 24, npm >= 10
- MongoDB — either MongoDB Atlas (recommended for the showcase) or a local
  MongoDB. No local `mongod` is required on this machine for the automated
  smoke test (it uses `mongodb-memory-server`, a dev-only dependency).

## Setup

### 1. Backend

```bash
cd ~/workspace/splittrack/server
npm install --no-audit --no-fund
cp .env.example .env   # then edit .env (see below)
npm start              # or: npm run dev — listens on http://localhost:5000
```

### 2. Frontend

```bash
cd ~/workspace/splittrack/client
npm install --no-audit --no-fund
npm run dev            # http://localhost:5173  (API proxied to :5000)
npm run build          # production build -> client/dist/
```

## Environment variables (`server/.env`)

| Variable | Example | Notes |
|---|---|---|
| `PORT` | `5000` | API port |
| `MONGODB_URI` | `mongodb+srv://<user>:<password>@<cluster>.mongodb.net/` | Atlas URI — paste the **full** URI from Atlas (Cluster → Connect → Drivers). The server also reads `MONGO_URI` as a fallback; set both to the same value. |
| `MONGO_URI` | same as above | Fallback URI |
| `JWT_SECRET` | a long random string | Generate with `openssl rand -hex 32`. Never share it. |
| `JWT_EXPIRES_IN` | `7d` | Token lifetime |

`server.js` connects with `{ dbName: 'splittrack', serverSelectionTimeoutMS: 10000 }`,
so data lands in the `splittrack` database, not the default `test` DB.

> **Security:** `server/.env` is gitignored (see root and `server/.gitignore`).
> Never commit it, never paste its contents into chat, README, or logs.
> `.env.example` contains only placeholders.

## Language switcher (top bar)

A prominent language section sits at the top of the app, in the Navbar
right next to the Group Switcher — never hidden inside a menu or drawer.
It always shows all three options — **English / Roman Urdu / العربية** —
with the active language highlighted (indigo). Clicking one instantly
re-translates the whole UI via `src/i18n/locales.js` + `AppContext`
(`t(key)` everywhere, 176 keys in each language) and persists the choice
in `localStorage` (`splittrack_lang`); Arabic also switches the page to
RTL (`dir="rtl"`).

## How to run (showcase)

1. Start the backend (`npm start` in `server/`), then the frontend
   (`npm run dev` in `client/`).
2. Open http://localhost:5173 — sign up with any name + email/phone + password.
3. **Create a group** (Onboarding card) — you become ADMIN and get an invite
   code like `KH-4F9Q`. Or **join** with a code.
4. Share the invite: copy the link (`/join/KH-XXXX`) or use the WhatsApp
   button in the Invite modal.
5. Add expenses (equal or custom split), see **Who Owes Whom**, and use
   **Settle Up** to record a settlement.
6. Export the group report as **CSV or PDF** (Dashboard → Export). Admins get
   the full report; members only get entries they paid for or are split on.
7. Admin Panel → Members / Join Requests / 2nd-Edit Requests / Settings.

## Demo sandbox (1-click, for the live presentation)

- In the Navbar (or Admin Panel), click **Load Demo Data**.
  - Creates the group **"🎓 Uni Friends Hostel & Trip (Demo)"** with you as ADMIN.
  - Creates 4 demo members — Ali, Sara, Bilal, Zara (`isDemoUser: true`,
    password `demo1234`) — as accepted members.
  - Seeds **15 realistic expenses** over the last 30 days: Food (Pizza Night,
    Chai Dhaba), Groceries (Hostel Milk & Eggs), Transport (Uber to Campus,
    Rickshaw), Trip (Murree Trip Van Fuel, Hotel Advance), Stationery
    (Photocopies & Lab Manuals), Utilities — plus **1 pending edit request**
    and **1 pending join request (Hina)**, so every feature is demonstrable
    without typing.
  - Loading is idempotent: running it twice returns the existing demo group.
- Click **Clear Demo Data** to delete only demo groups, memberships, expenses
  and demo users. Real groups and users are never touched.

Demo accounts (created by Load Demo Data): Ali, Sara, Bilal, Zara — password
`demo1234`. You can also sign up a fresh account of your own at any time.

## Key rules implemented

- **Isolation:** `groupId`/role are never trusted from the client; membership
  is checked against the DB on every group route.
- **Last-admin rule:** the only admin cannot leave or demote themselves —
  *"You are the only admin. Please promote another member to Admin before
  leaving."*
- **Edit-once:** a member can edit their own expense once (`editCount = 1`);
  a second edit needs an edit request, approved by an admin
  (`canEditAgain = true`). Admins can edit any expense at any time. Only
  admins can delete (soft delete, `isDeleted = true`).
- **Join flow:** `invitesEnabled: false` blocks joining; `autoApproveJoin:
  true` accepts immediately, otherwise the request is PENDING until an admin
  approves/rejects it. Unauthenticated `/join/KH-XXXX` visits save
  `pendingInviteCode` in localStorage and redirect back after login/signup.
- **Debt simplification:** `netBalance = totalPaid − totalShare`; greedy
  largest-debtor ↔ largest-creditor matching gives the minimum number of
  settlements.
- **Export:** `GET /api/groups/:groupId/expenses/export` — aggregation
  `$match` / `$sort` / `$limit: 5000` / `$facet`, always excluding deleted and
  hidden expenses, with the member visibility filter applied server-side.

## Migration script (legacy data)

```bash
cd ~/workspace/splittrack/server
node scripts/migrateLegacyData.js            # dry run — prints counts, writes nothing
node scripts/migrateLegacyData.js --confirm  # actually migrate (idempotent)
```

Migrates legacy `paid_by` → `paidBy`, Group `members` arrays → Membership
documents, dedupes memberships, backfills missing `KH-XXXX` invite codes, and
sets per-field defaults only where missing.

## Verification (this build)

- `node --check` — all 14 server JS files pass; no `TODO` / mock / stub in
  shipped code.
- Backend smoke test (temp script in `/tmp`, not shipped) against
  `mongodb-memory-server` with real Mongoose + HTTP: **32/32 PASS** — health,
  signup/login/duplicate/bad-login, groups + `KH-XXXX`, join PENDING →
  approve, expense create + bad-split 400, balances +500/−500 with settlement,
  export totals, edit-once flow (1st edit ok, 2nd edit 403
  `EDIT_REQUEST_REQUIRED`, request → approve → edit ok), admin edit, settlement
  clearing balances to 0, member visibility, demo load (15 expenses) /
  idempotent / clear (real group survives), last-admin leave blocked 403.
- Frontend: `npm run build` — **succeeded, 2008 modules, built in ~8.8s**
  (`dist/` emitted; only the standard >500 kB jspdf chunk-size warning).
- i18n: **176 keys in each of en, ur, ar — zero missing.**

### Atlas note

The shipped server reads the Atlas URI from `server/.env`
(`MONGODB_URI` / `MONGO_URI`) with `dbName: 'splittrack'`. In this VM the
Atlas connection test failed with a DNS `EREFUSED` on the SRV lookup
(`_mongodb._tcp.<cluster-host>`), and the same refusal occurs for other
external DNS names from this VM's resolver — so the failure is a VM DNS /
network limitation, not a code problem, and it does **not** prove the Atlas
password or cluster name wrong. On a normal network (or the showcase laptop),
paste the full Atlas URI into `server/.env` and start the server; the
in-memory smoke test above proves the API itself works end to end.

---

# v2 — What's new (Nov 14, 2026)

## Mobile-first + professional palette (top priority)

- **Mobile-first:** no horizontal overflow on any page (`overflow-x: clip`,
  `min-w-0`, truncate, `flex-wrap` everywhere); wide tables become stacked
  cards below the `md` breakpoint (SuperAdmin groups table is
  `hidden md:block` with a card list on phones); **fixed bottom nav on
  mobile** (Dashboard / Add / Invite / Admin, raised teal center button,
  safe-area padding, content `pb-20` on mobile); **all buttons/inputs
  min 44px** touch targets (also stops iOS input zoom — inputs are 16px);
  modals are bottom sheets on phones (`max-h-[92dvh]`, rounded top) and
  centered dialogs on desktop; forms single-column on mobile; QR code
  scales to screen width.
- **Palette:** deep navy/slate base (`#0a1f33` / `#102a43`) with **teal
  (#0D9488) / emerald** accents, clean white cards, subtle `slate-200`
  borders. Indigo is only a secondary accent. **No bright purple
  gradients** anywhere (verified: 0 purple/violet/fuchsia gradient classes
  in `src/` and in the built CSS/JS).
- Language switcher and dark-mode toggle stay visible in the top bar,
  next to the Group Switcher, on every screen size.

## Backend v2

- **NEW `models/ActivityLog.js`** — immutable audit trail (`groupId`,
  `actorId`, `action`, `details`, `createdAt`); every group action is
  logged (`EXPENSE_ADDED`, `EXPENSE_EDITED`, `EDIT_REQUESTED`,
  `SETTLEMENT_RECORDED`, `MEMBER_JOINED`, `GROUP_CREATED`).
  Read via `GET /api/groups/:groupId/activity` (latest 100, newest first).
- **User:** `avatarColor` (default `'#6366F1'`). **Group:** `currency`
  enum `PKR/USD/EUR/AED/SAR/INR` (default `PKR`), `monthlyBudget`
  (default `0` = no limit).
- **Expense:** categories + `Rent`, `Entertainment`, `Settlement`;
  `splitMethod` enum `EQUAL/EXACT/PERCENTAGE/SHARES` (default `EQUAL`),
  `notes`, `receiptUrl`, `splitBetween[].shareMeta`, `editHistory[]`
  (`editedBy`, `editedAt`, `previousAmount`, `previousTitle`).
- **4-mode split engine** (`utils/splitEngine.js`): EQUAL penny-rounds so
  shares sum exactly to the amount; EXACT requires the sum to equal the
  amount; PERCENTAGE requires `shareMeta` to sum to 100; SHARES splits
  proportionally. Mismatches return 400 on create and update.
- **Edit-once + audit:** first member edit pushes `editHistory`,
  `editCount = 1`, `canEditAgain = false`, and an ActivityLog entry;
  second edit is blocked with 403 `EDIT_REQUEST_REQUIRED` until an admin
  approves. Admin edits are free and don't touch member counters.
- **Debt simplifier** now returns both `memberBalances`
  (`{user, totalPaid, totalShare, netBalance}`) and `simplifiedDebts`
  (`{fromUser, toUser, amount}`).
- **Export** adds `?search` (title/notes) and `$facet` returning
  `{groupName, currency, exportedAt, role, totalsByCategory, expenses,
  simplifiedDebts}`.
- **Demo v2:** group **"🎓 Uni Friends Hostel & Northern Trip (Demo)"**,
  `monthlyBudget: 50000`, currency PKR; demo users **Ali Khan, Sara Ahmed,
  Bilal Raza, Zara Tariq** (ACCEPTED), **Hamza Malik** PENDING join request;
  **15 expenses over the last 25 days using all 4 split methods + 1
  settlement**; pending 2nd-edit request — Bilal, Chai Dhaba 1200 → 1500,
  *"Forgot to add paratha bill"*; **6 ActivityLog entries**. Load is
  idempotent; clear deletes only demo data + demo logs.
- **Migration** (`scripts/migrateLegacyData.js`): transactional when the
  DB supports it (falls back with a warning on standalone servers),
  idempotent, backfills `avatarColor`, `currency`, `monthlyBudget`,
  `splitMethod`, `notes`, `receiptUrl`, `editHistory`, `shareMeta`.
  Dry run by default; `--confirm` to apply.
- **SuperAdmin:** startup seed + `scripts/seedSuperAdmin.js` (idempotent,
  only if no superadmin exists). Routes (all `requireSuperAdmin`):
  `GET /api/admin/stats`, `GET /api/admin/groups`,
  `POST /api/admin/users/:userId/block|unblock` (cannot block self or
  another superadmin).

## Frontend v2

- **Dark/Light mode** in `AppContext` (persisted `splittrack_theme`,
  toggle in Navbar, `dark` class on `<html>`).
- **InviteModal:** instant **QR code** for the join URL (`qrcode.react`,
  `QRCodeSVG`) + copy link + WhatsApp share.
- **ExpenseModal:** 4 split modes with per-member inputs and live
  validation, receipt note/URL fields, 2nd-edit reason prompt on
  403 `EDIT_REQUEST_REQUIRED`.
- **WhoOwesWhomCard:** per-debt **"Remind on WhatsApp"** button
  (`wa.me` with the exact polite reminder message).
- **NEW `AnalyticsSection.jsx`:** category breakdown bars (pure
  Tailwind/SVG), top-spenders leaderboard, monthly budget progress.
- **NEW `ActivityFeedDrawer.jsx`:** slide-in audit-log drawer with
  before/after expense edits.
- **GroupDashboard:** KPI cards, **Budget Alert Banner** (Emerald <75%,
  Amber 75–99%, pulsing Red ≥100% of `monthlyBudget`, hidden when 0),
  search filter, expense badges — **"Edited (1/1)"** with tooltip
  (previous amount/title) and **"Pending Admin Approval"**.
- **AdminPanel:** 2nd-edit requests show a **Before/After diff**; Group &
  Budget Settings now include currency + monthlyBudget.
- **NEW `pages/SuperAdminModal.jsx`:** platform stats, all-groups table,
  block/unblock users (Navbar button, only for superadmins).
- **i18n: 263 keys in each of en, ur, ar — zero missing.**

## SuperAdmin credentials (for the showcase)

| | |
|---|---|
| Email | `superadmin@splittrack.app` |
| Password | `SuperAdmin123!` |

Change the password after the showcase (sign in as superadmin; the seed
only creates the account when no superadmin exists).

## Deploy to Vercel (full app — frontend + backend on one domain)

The app is adapted for Vercel serverless: `server/server.js` exports the
Express app and only calls `app.listen` when run directly, and
`api/index.js` is the Vercel serverless entry point (lazy cached MongoDB
connection + superadmin seed on first API request — see "Vercel adapter"
below). [`vercel.json`](sandbox://workspace/splittrack/vercel.json) builds
the client, serves `client/dist`, and rewrites `/api/(.*)` to the API
function, so the deployed frontend talks to the deployed backend on the
**same domain** — no separate backend host needed.

### Env vars to set in the Vercel project (Production + Preview)

| Variable | Value |
|---|---|
| `MONGODB_URI` | Full Atlas URI from Atlas (Cluster → Connect → Drivers) |
| `MONGO_URI` | Same as `MONGODB_URI` |
| `JWT_SECRET` | A long random string (`openssl rand -hex 32`) — generate a fresh one, do not reuse the local dev secret |
| `JWT_EXPIRES_IN` | `7d` |
| `FRONTEND_URL` | The deployed Vercel URL, e.g. `https://kharcha-marcha.vercel.app` (CORS allow-list) |
| `VITE_API_URL` | `<deployed URL>/api`, e.g. `https://kharcha-marcha.vercel.app/api` — must be set **before** the production build so the frontend bundle points at the live API |

### Deploy

```bash
# from the repo root (after the Vercel project "kharcha-marcha" exists):
vercel --prod
# or: import RanaFahad007/kharcha-marcha in the Vercel dashboard (GitHub
# integration) — every push to main then auto-deploys.
```

### Current status (Nov 14, 2026, ~19:15 PKT) — DEPLOY BLOCKED, code ready

- Repo: **https://github.com/RanaFahad007/kharcha-marcha** (`main`, up to date,
  includes the Vercel adapter below).
- **No live Vercel URL yet.** Project creation fails with Vercel API
  `403 forbidden` on scope `fahads-projects-0a698196` (team
  `team_rgpSAdhUrWJ3j7Dgd5z74Ly4`): *"Not authorized: Trying to access
  resource under scope. You must re-authenticate to this scope."* The
  Vercel OAuth connection in this environment only has identity scopes
  (openid/email/profile); a token refresh does not add the team scope,
  and the `authorize_team_access` tool the API error asks for does not
  exist in this environment's Vercel MCP server.
- **Exact unblock step:** the user must grant this Vercel connection
  access to the team **"Fahad's Projects"** (`fahads-projects-0a698196`)
  through Vercel consent — re-run the Vercel connect flow and select that
  team when Vercel asks which teams the app may access (completing SSO
  alone does not add a missing team grant). Then retry: create project
  `kharcha-marcha` → set the env vars above → deploy → verify.
- The live app to verify after deploy: sign up a new user, Load Demo
  Data, check the dashboard, and log in as superadmin (below). The
  superadmin is seeded automatically on the first API request.

### Vercel adapter (what changed for serverless)

- `server/server.js`: `connectDb()` (cached promise, `readyState === 1`
  short-circuit) + `ensureDb` middleware on `/api` (connects lazily,
  seeds the superadmin once, returns 503 if the DB is unreachable
  instead of `process.exit`). `start()` (local `npm start`) still
  connects eagerly and listens on `:5000` — local dev is unchanged.
- `api/index.js`: exports the Express app as the Vercel function handler
  and restores the original `/api/...` path if Vercel delivers the
  rewritten `/api/index.js` destination path.
- `package.json` (root): serverless API dependencies
  (express/mongoose/bcryptjs/cors/dotenv/jsonwebtoken) so Vercel installs
  them for the function.
- `vercel.json`: `installCommand` installs root + client deps,
  `buildCommand` builds the client, `outputDirectory: client/dist`,
  `functions.api/index.js.maxDuration: 30`, rewrites `/api/(.*)` →
  `/api/index.js` and SPA fallback → `/index.html`.
- Verification of the adapter (Nov 14, 2026): `node --check` on
  `server.js` + `api/index.js`; `npm run build` in `client/` succeeds
  (~8s); end-to-end smoke test against a real local `mongod` (the
  `mongodb-memory-server` binary fasserts in this VM, so a manually
  started mongod was used instead): **9/9 PASS** — health, signup,
  bad-login 401, superadmin login seeded via `ensureDb`, superadmin
  stats, demo load, list groups, balances, export.

## Verification (v2, re-checked by the coordinator)

- `node --check` — all 19 server JS files pass; zero `TODO`/mock/stub in
  shipped code (only third-party `node_modules` contain such comments).
- Backend smoke test (in-memory MongoDB, real Express app): **40/40 PASS**
  — superadmin login, group create (USD/1000 budget), join approve,
  EQUAL/EXACT/PERCENTAGE/SHARES incl. 400s on bad sums and exact
  999-split sums, legacy `splitType` compat, balances shape, settlement,
  full edit-once cycle (1st edit → 403 → request → approve → 2nd edit,
  `editCount: 2`), admin free edit, activity-log contents, export
  `?search` + member-only debts, demo load (16 expense docs: 15 + 1
  settlement, idempotent reload), demo pending edit request + Hamza Malik
  + 6 activity entries, admin stats/groups, block/unblock (blocked login
  403, cannot block self), demo clear (16 expenses + 6 logs deleted).
- Migration test: dry run counts correctly, `--confirm` migrates and
  backfills, second `--confirm` reports all zeros (idempotent).
- Frontend: `npm run build` — **succeeded, 2012 modules, ~9.3s** (only the
  pre-existing >500 kB jspdf chunk warning).
- Mobile check: viewport meta
  `width=device-width, initial-scale=1.0, viewport-fit=cover` present;
  **0 purple/violet/fuchsia gradient classes** in built CSS/JS; brand
  teal `#0d9488` + navy `#0a1f33` present in built CSS; `overflow-x:
  clip`, 44px touch rule, bottom nav present in built output.
  *Caveat: no headless 375px overflow measurement was possible in this
  environment (no Chromium/Playwright available) — worth one real-phone
  check before the showcase.*
- Atlas note (unchanged from v1): this VM's DNS refuses external SRV
  lookups, so the Atlas connection cannot be proven from here; it does
  not prove the URI/password wrong. Use the showcase machine / Vercel +
  Render for the live connection.
