# EBR Inventory System — Project Setup

How to install, run, and work with the app locally. For the feature roadmap, see [PLAN.md](PLAN.md).

> **Current status:** M0 (foundation) and M1 (login) are done. Steps marked with a later
> milestone aren't built yet. Update this file whenever setup changes.

---

## 1. Requirements

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | **22 LTS** or newer | `node -v` |
| npm | 10+ | comes with Node |
| MongoDB | 7+ | **must run as a replica set**, because stock updates use transactions. Atlas does this by default. See §3 |
| Git | any | |
| Optional: `mongosh` | latest | MongoDB shell |
| Optional: MongoDB Compass | latest | GUI for browsing data |

---

## 2. Project structure

```text
inventory-desktop-mern/
├── backend/        Express 5 + Mongoose API   → http://localhost:5000
├── frontend/       React 19 + Vite            → http://localhost:5173
├── PLAN.md         milestones & design notes
└── Project_Setup.md
```

---

## 3. Database setup

Choose **one** option.

### Option A — MongoDB Atlas (recommended, free tier)

1. Create a free **M0** cluster at <https://cloud.mongodb.com>.
2. **Database Access** → add a database user (username + password).
3. **Network Access** → add your current IP (or `0.0.0.0/0` for development only).
4. **Connect → Drivers** → copy the connection string, add the database name `ebr_inventory`:
   ```text
   mongodb+srv://<user>:<password>@<cluster>.mongodb.net/ebr_inventory?retryWrites=true&w=majority
   ```
5. Put it in `backend/.env` as `MONGO_URI` (see §4).

### Option B — Local MongoDB with Docker

Runs a single-node replica set, which transactions need:

```bash
docker run -d --name ebr-mongo -p 27017:27017 -v ebr-mongo-data:/data/db \
  mongo:7 --replSet rs0 --bind_ip_all

# one-time: start the replica set
docker exec -it ebr-mongo mongosh --eval \
  'rs.initiate({_id:"rs0",members:[{_id:0,host:"localhost:27017"}]})'
```

```text
MONGO_URI=mongodb://localhost:27017/ebr_inventory?replicaSet=rs0&directConnection=true
```

Start or stop it later with `docker start ebr-mongo` / `docker stop ebr-mongo`.

### Option C — Local MongoDB installed natively

Install MongoDB Community Server, then add this to `mongod.conf`:

```yaml
replication:
  replSetName: rs0
```

Restart `mongod`, run `rs.initiate()` once in `mongosh`, and use the same `MONGO_URI` as Option B.

---

## 4. Environment variables

`.env` files hold secrets and are **never committed**. Copy the example and fill it in.

### `backend/.env`

```dotenv
PORT=5000
NODE_ENV=development
MONGO_URI=mongodb://localhost:27017/ebr_inventory?replicaSet=rs0&directConnection=true
MONGO_DB_NAME=ebr_inventory          # overrides any database name in MONGO_URI
JWT_SECRET=change-me-to-a-long-random-string
JWT_EXPIRES_IN=8h
CLIENT_ORIGIN=http://localhost:5173

# used by the seed script to create the first admin
SEED_ADMIN_ID=admin
SEED_ADMIN_PASSWORD=change-me        # min 8 chars; the seed script refuses the placeholder
SEED_ADMIN_NAME=Administrator
```

To generate a `JWT_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### `frontend/.env` (optional)

In development, Vite proxies `/api` to the backend, so nothing is needed. Set this only to
point at a different API:

```dotenv
VITE_API_URL=http://localhost:5000/api
```

To point the dev server's `/api` proxy at a different backend (e.g. a test API on another
port), start Vite with `API_PROXY_TARGET`:

```bash
API_PROXY_TARGET=http://localhost:5055 npm run dev
```

---

## 5. Install

```bash
git clone <repo-url>
cd inventory-desktop-mern

cd backend  && npm install && cp .env.example .env   # then edit .env
cd ../frontend && npm install
```

---

## 6. Run in development

Use two terminals:

```bash
# Terminal 1 — API (auto-restarts on changes)
cd backend
npm run dev
```

```bash
# Terminal 2 — React app
cd frontend
npm run dev
```

| What | URL |
|------|-----|
| App | <http://localhost:5173> |
| API | <http://localhost:5000/api> |
| Health check | <http://localhost:5000/api/health> |

### First run: create the admin user

```bash
cd backend
npm run seed:admin
```

Log in at <http://localhost:5173/login> with `SEED_ADMIN_ID` / `SEED_ADMIN_PASSWORD`.

---

## 7. npm scripts

### backend

| Script | Does |
|--------|------|
| `npm run dev` | start the API with nodemon |
| `npm start` | start the API with node (production) |
| `npm run seed:admin` | create the first admin from `SEED_ADMIN_*` (skips if the ID exists) |
| `npm run seed:demo` | load sample items + transactions _(M3)_ |
| `npm run import:items -- <file.csv>` | bulk import existing items _(M2)_ |
| `npm test` | run backend tests _(M6)_ |

### frontend

| Script | Does |
|--------|------|
| `npm run dev` | Vite dev server |
| `npm run build` | production build into `frontend/dist` |
| `npm run preview` | serve the production build locally |
| `npm run lint` | ESLint |

---

## 8. Accessing the database

Database name: **`ebr_inventory`**. Collections: `users`, `items`, `transactions`.

### MongoDB Compass (GUI)

1. Open Compass → **New connection**.
2. Paste the same `MONGO_URI` from `backend/.env`.
3. Open `ebr_inventory` to browse, filter, and edit documents.

### mongosh (shell)

```bash
mongosh "<MONGO_URI>"
# Docker option, without installing mongosh:
docker exec -it ebr-mongo mongosh ebr_inventory
```

Useful commands:

```js
show collections
db.items.countDocuments()
db.items.find({ code: "NS40 GOLD" })
db.items.find({ balance: { $lt: 0 } })                       // negative stock
db.transactions.find().sort({ date: -1 }).limit(10)
db.transactions.find({ date: { $gte: ISODate("2026-10-01") } })
db.users.find({}, { passwordHash: 0 })                       // never print hashes
```

### Backup & restore

```bash
mongodump    --uri="<MONGO_URI>" --out=./backup/$(date +%F)
mongorestore --uri="<MONGO_URI>" --drop ./backup/2026-10-24
```

> ⚠️ Never edit `items.balance` or `transactions.endingBalance` by hand. They are calculated
> by the API, and editing them breaks the reports. Fix mistakes by recording an opposite
> transaction.

### Reset local data (development only)

```bash
mongosh "<MONGO_URI>" --eval 'db.dropDatabase()'
npm run seed:admin && npm run seed:demo
```

---

## 9. Troubleshooting

| Problem | Fix |
|---------|-----|
| `Transaction numbers are only allowed on a replica set member or mongos` | MongoDB isn't running as a replica set. See §3 B/C, or use Atlas |
| `MongooseServerSelectionError` | DB isn't running, `MONGO_URI` is wrong, or (Atlas) your IP isn't on the allowlist |
| `EADDRINUSE :5000` | another process is using the port. Change `PORT` or stop it: `lsof -i :5000` |
| CORS error in the browser | `CLIENT_ORIGIN` must exactly match the frontend URL |
| Logged out on every refresh | cookie not sent. Check that axios has `withCredentials: true` and the Vite proxy is set up |
| `node_modules` showing in `git status` | add a root `.gitignore` containing `node_modules/` and `.env` |
