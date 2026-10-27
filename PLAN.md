# EBR Inventory System — Project Plan & Milestones

Source design: [Figma – EBR Inventory System](https://www.figma.com/design/Zyb2lzyUbajOplrpdedBh3/EBR-Inventory-System?node-id=0-1)

Stack: **MongoDB + Express 5 + React 19 (Vite) + Node** (`backend/`, `frontend/`)

---

## 1. What the app does

A single-store inventory ledger for auto parts (tires, tubes, batteries, filters, etc.).
Staff log in, register items, record stock **IN** / **OUT** transactions, and print
daily and transaction reports.

### Screens in the design

| # | Screen | Purpose |
|---|--------|---------|
| 01 | Login | ID + password, logo, help text |
| 02 | Transactions (home) | Table grouped by item; each group lists its entries (date, customer, IN/OUT, qty, ending balance). Search, filter, pagination. Header actions: **Add Item**, **Add Transaction**. Toolbar: **Daily Report**, **Transaction Report** |
| 02a | Filter open | Dropdown: transaction type (All / IN / OUT), date range + presets (Today, Last 7 days, This month), stock status (Any / In stock / Out of stock / Negative, with counts), Type/Design checklist with search, brand name, selected count, Cancel / Show results |
| 02b | Filtered | Active filter chips + "Clear all", result summary (item count, totals) |
| 03 | Add Item (side panel) | Item code*, brand name, type/design, balance forwarded (opening stock). Success message. "Added this session" list, so many items can be entered in a row |
| 04 | Add Transaction (side panel) | Item code lookup → auto-fills brand/type. Date, IN/OUT segmented control, quantity, customer name. **Item details** preview: last transaction date and type, current ending balance, **balance after saving** (with the math shown) |
| 05 / 07 | Pick date dialog | Modal date picker before opening a report |
| 06 | Daily Report | Printable. Header (eyebrow, title, "as of", logo), meta (report date, generated, prepared by). Columns: item code, brand, type/design, ending balance, last transaction date. Paginated (≈1,800 items) |
| 08 | Transaction Report | Printable. Items that moved on the chosen date. Columns: item code, brand, type/design, In, Out, ending balance. **Total** row |

---

## 2. Data model (MongoDB)

```text
User
  userId        String, unique (login "ID")
  passwordHash  String
  name          String            → "Prepared by" on reports
  role          'admin' | 'staff'

Item
  code              String, unique, uppercase, indexed   e.g. "NS40 GOLD"
  brand             String                                e.g. "MOTOLITE"
  typeDesign        String, indexed                       e.g. "BATTERY", "TIRE"
  balanceForwarded  Number (opening stock)
  balance           Number (current ending balance, kept in sync)
  lastTransactionAt Date
  lastTransactionType 'IN' | 'OUT'
  timestamps

Transaction
  item          ObjectId → Item, indexed
  date          Date, indexed
  type          'IN' | 'OUT'
  quantity      Number > 0
  customerName  String
  endingBalance Number (balance of the item right after this entry)
  createdBy     ObjectId → User
  timestamps
```

**Balance rule:** `endingBalance = previous balance ± quantity`. Negative balances are
allowed, because the design has a "Negative" stock filter. Saving a transaction and updating
`Item.balance` happen together in a **MongoDB transaction session**, so the two always match.
Back-dated entries need the later entries' `endingBalance` recalculated (see M4).

---

## 3. REST API

| Method | Route | Notes |
|--------|-------|-------|
| POST | `/api/auth/login` | returns JWT (httpOnly cookie) |
| POST | `/api/auth/logout` | |
| GET | `/api/auth/me` | current user |
| POST | `/api/users` | create a user (admin only) |
| GET | `/api/items` | `?search=&type=&brand=&stock=in\|out\|negative&page=` |
| GET | `/api/items/:code` | lookup for Add Transaction |
| POST | `/api/items` | Add Item |
| GET | `/api/items/facets` | type/design list, brand list, stock counts (for the filter UI) |
| GET | `/api/transactions` | grouped by item; `?search=&type=&from=&to=&typeDesign=&brand=&stock=&page=` |
| POST | `/api/transactions` | Add Transaction (updates balance) |
| GET | `/api/reports/daily?date=` | balance of every item as of that date |
| GET | `/api/reports/transactions?date=` | per-item IN/OUT totals + grand total for that date |

---

## 4. Milestones

Each milestone ends with something you can run and check. We build them in order, one at a time.

### M0 — Project foundation
- [x] Root `.gitignore` (`node_modules/`, `.env`, `dist/`) and clean up `frontend/.gitignore`
- [x] Backend: folder structure (`src/{config,models,routes,controllers,middleware,utils}`), `server.js`, `npm run dev` with nodemon, `.env.example`
- [x] MongoDB connection (local or Atlas; **replica set needed for transactions**, which Atlas has by default)
- [x] Health route `GET /api/health`
- [x] Frontend: clear the Vite starter, add React Router, axios instance with `baseURL` + `withCredentials`, Vite proxy to backend
- [ ] Design tokens from Figma (colors, typography, spacing, radius) as CSS variables. `tokens.css` exists, but **real values are pending** (Figma rate limit)
- [x] Setup docs with how to run it (`Project_Setup.md`)

**Done when:** `npm run dev` in both folders works and the frontend shows the health check result.

### M1 — Authentication (Screen 01)
- [x] `User` model, bcrypt hashing, seed script for the first admin
- [x] Login / logout / me endpoints, JWT in httpOnly cookie, `requireAuth` middleware
- [x] Login page with the design's layout (logo, ID, password, button, help text, error states). Colors and the real logo are pending (Figma rate limit)
- [x] `AuthContext` + protected routes; redirect to `/login` when signed out
- [x] App shell: **App Bar** with user name / logout

**Done when:** you can log in with the seeded user and reach an (empty) Transactions page; refreshing keeps you logged in.

### M2 — Items & Add Item panel (Screen 03)
- [ ] `Item` model + validation (unique uppercase code, balance forwarded ≥ 0)
- [ ] `POST /api/items`, `GET /api/items/:code`, `GET /api/items`
- [ ] Shared UI parts: Button, TextField, SidePanel, Toast/inline success message
- [ ] Add Item side panel: required-field errors, duplicate-code error, success message, "Added this session" list, form resets after each save, Close
- [ ] CSV/Excel import script for existing stock (≈1,800 items), if you have a spreadsheet

**Done when:** you can add items from the panel and see them saved in MongoDB.

### M3 — Transactions list (Screens 02, 02a, 02b)
- [ ] `Transaction` model + indexes
- [ ] `GET /api/transactions` aggregation: group by item, newest entries first, paginate by item group
- [ ] Transactions table: item group header row + entry rows, IN/OUT badges, ending balance, footer count + pages
- [ ] Search (item code / brand / customer), debounced
- [ ] Filter dropdown: type segmented control, date range + presets, stock status with counts, Type/Design checklist with search + "Show all", brand, selected count, Clear all
- [ ] Active filter chips + result summary (items, IN/OUT totals); filters kept in the URL query string
- [ ] Empty and loading states

**Done when:** seed data shows up grouped correctly, and every filter combination narrows the results like 02b does.

### M4 — Add Transaction panel (Screen 04)
- [ ] `POST /api/transactions` in a Mongo session: insert entry, update `Item.balance` / last-transaction fields
- [ ] Back-dated entries: recalculate `endingBalance` for later entries of that item
- [ ] Panel: item code autocomplete → brand/type auto-fill (read-only), date (default today), IN/OUT control, quantity, customer name
- [ ] Live **Item details** card: last transaction date/type, ending balance, *balance after saving* with the math (`12 − 4 = 8`), warning when it would go negative
- [ ] Refresh the list after saving

**Done when:** recording IN/OUT updates balances correctly, including a back-dated entry.

### M5 — Reports (Screens 05–08)
- [ ] Pick-date modal (shared by both reports)
- [ ] `GET /api/reports/daily`: each item's balance as of end of day (last `endingBalance` ≤ date, otherwise balance forwarded)
- [ ] `GET /api/reports/transactions`: per-item IN/OUT sums for the date + totals
- [ ] Report pages: Back, Change date, Print; header with logo, meta (report date, generated, prepared by), tables, total row, notes
- [ ] Print stylesheet (`@media print`): hide app bar and toolbar, repeat table headers, page breaks. Print shows **all** rows, not just the current page

**Done when:** both reports print cleanly on A4/Letter and the totals match the transaction list.

### M6 — Hardening & polish
- [ ] Input validation on the server (e.g. `zod` / `express-validator`) and one error format for all responses
- [ ] Rate-limit login, `helmet`, CORS locked to the frontend origin
- [ ] Keyboard flow for fast data entry (Enter to save, Esc to close panels)
- [ ] Backend tests (Jest/Vitest + supertest) for balance math and reports; a few frontend component tests
- [ ] Performance check with ~2k items / ~50k transactions (indexes, `.lean()`, projection)

### M7 — Packaging / deployment
- [ ] Decide on the target: **web deploy** (e.g. Render/Railway + Atlas) **or desktop app** (Electron wrapping the Vite build, with an embedded Express server). The repo name `inventory-desktop-mern` suggests desktop
- [ ] Production build, environment config, MongoDB backups
- [ ] User guide (short)

---

## 5. Folder structure (target)

```text
backend/
  src/
    config/db.js
    models/{User,Item,Transaction}.js
    routes/{auth,items,transactions,reports}.routes.js
    controllers/…
    middleware/{auth,error,validate}.js
    services/balance.service.js     ← all stock math lives here
    utils/…
  scripts/{seed-admin,import-items}.js
  server.js
frontend/
  src/
    api/               ← axios instance + one file per resource
    components/ui/     ← Button, TextField, Chip, Checkbox, SegmentedControl, SidePanel, Dialog, Table
    components/layout/ ← AppBar, ProtectedRoute
    features/
      auth/            ← LoginPage, AuthContext
      transactions/    ← TransactionsPage, FilterDropdown, ActiveFilters, TransactionTable
      items/           ← AddItemPanel
      add-transaction/ ← AddTransactionPanel
      reports/         ← PickDateDialog, DailyReport, TransactionReport
    styles/tokens.css
```

---

## 6. Open questions

1. **Roles:** are there admin vs. staff permissions (e.g. only admins can add items or edit/delete transactions)?
2. **Edit/delete transactions:** not in the design. Are they needed, or are corrections made with an opposite entry?
3. **Negative stock:** allow it with a warning (assumed above), or block the save?
4. **Daily Report scope:** all items, or only items with a balance or activity?
5. **Existing data:** is there a spreadsheet of current items and balances to import?
6. **Desktop vs. web** (see M7).
7. The two **Note** frames in Figma (next to Add Item and Add Transaction) couldn't be read because of the Figma API rate limit. Paste their text if they hold requirements.
