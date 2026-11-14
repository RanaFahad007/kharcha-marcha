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
