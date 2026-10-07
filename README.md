# NovaWorks CRM - AI Meeting to Project CRM

Paste a meeting transcript and AI creates the projects and tasks, assigns the right managers and developers, and sets deadlines and estimated hours. Every logged-in user sees only the work they are allowed to see.

## Team
- Team name: [TEAM NAME]
- Members and responsibilities: [NAME]. Solo build covering frontend, backend, AI integration and product.
- Repository: https://github.com/HASNAT691/infinityHackathon

## What Works
- **Seeded login** for 10 demo users (1 admin, 3 managers, 6 agents) using bcrypt-hashed passwords and an httpOnly session cookie. The seed is idempotent.
- **Admin**: sees all project cards and can use **Create from Transcript**, which shows a loading state, disables the button, and then shows a success summary or the list of validation errors. **Reset demo data** clears projects and tasks and keeps users.
- **AI transcript conversion**: the transcript and the team directory (id, name, role, specialization, skills only; no emails or passwords) go to an OpenRouter LLM, which returns JSON. The server validates the JSON with zod plus business rules and then saves everything in a single **MongoDB transaction**. Invalid output saves nothing.
- **Manager**: sees only the projects they manage, with all tasks in them.
- **Agent**: **My Tasks** shows only their tasks. They see related projects, but never other agents' tasks.
- **Read-only team directory**, project list, project detail (client, manager, deadline, description, tasks), and task rows (title, description, assignee, deadline, estimated hours).
- **Persistence**: everything is stored in MongoDB and survives a refresh or a server restart.
- **Server-side access control**: the same rules apply to direct API calls. For example, a manager requesting another manager's project gets a 404.

Not built (out of scope per the challenge): signup, password reset, user management, cost calculation, progress monitoring, editing generated tasks.

## Technology Stack
- Frontend: React 19 + Vite (plain CSS)
- Backend: Node.js 22 + Express 5
- Database: MongoDB 8 via Mongoose. A replica set is required for transactions (local single-node replica set, or MongoDB Atlas).
- AI: OpenRouter. Primary model `nvidia/nemotron-3-super-120b-a12b:free`, with fallbacks `dots-studio/dots-3-note-preview:free` and `apodex/apodex-1.1-mini:free` (60 s timeout per model). Temperature 0, JSON output mode.
- Auth/session: bcrypt password check, then a signed JWT in an **httpOnly cookie** that contains only the user id. The user and role are re-loaded from the DB on every request, so the server never trusts a role or user id sent by the client.

## Links
- Live application: [URL or Not deployed]
- Demo video: [VIDEO URL]

## Requirements
- Node.js 20+ and npm
- MongoDB 7+ (`mongod` on PATH) **or** a MongoDB Atlas free cluster
- An OpenRouter API key (free models work)

## Run Locally
1. Clone and enter the repo:
   ```sh
   git clone https://github.com/HASNAT691/infinityHackathon.git
   cd infinityHackathon
   ```
2. Install dependencies:
   ```sh
   cd server && npm install && cd ../client && npm install && cd ..
   ```
3. Create the server env file and fill in your values:
   ```sh
   cp server/.env.example server/.env
   ```
4. Start MongoDB as a single-node replica set (**terminal 1, keep it running**). Skip this step if you use Atlas.
   ```sh
   mkdir -p ~/novaworks-mongo
   mongod --replSet rs0 --port 27018 --bind_ip 127.0.0.1 --dbpath ~/novaworks-mongo
   ```
   One-time replica-set initialisation, in another terminal:
   ```sh
   cd server
   node -e "require('mongodb').MongoClient.connect('mongodb://127.0.0.1:27018/?directConnection=true').then(async c=>{console.log(await c.db('admin').command({replSetInitiate:{_id:'rs0',members:[{_id:0,host:'127.0.0.1:27018'}]}}));c.close()})"
   ```
5. Seed the 10 demo users. Re-running is safe because it upserts by email.
   ```sh
   cd server && npm run seed
   ```
6. Start the API (**terminal 2**, http://localhost:5000):
   ```sh
   cd server && npm run dev
   ```
7. Start the frontend (**terminal 3**). Open **http://localhost:5173**.
   ```sh
   cd client && npm run dev
   ```
   Vite proxies `/api` to `localhost:5000`, so the browser uses one origin and the session cookie works without CORS.

Single-process alternative: `cd client && npm run build`, then `cd ../server && npm start`. Express serves the built app at http://localhost:5000.

## Environment Variables
| Variable | Purpose | Where configured |
| --- | --- | --- |
| `MONGODB_URI` | MongoDB connection (must be a replica set or Atlas) | server/.env |
| `SESSION_SECRET` | Signs the session JWT cookie | server/.env |
| `OPENROUTER_API_KEY` | AI provider credential | server/.env (backend only) |
| `OPENROUTER_MODEL` | Primary model id | server/.env |
| `OPENROUTER_FALLBACK_MODEL` | Comma-separated backup models, tried in order | server/.env |
| `OPENROUTER_TIMEOUT_MS` | Per-model timeout before trying the next one (default 60000) | server/.env |
| `PORT` | API port (default 5000) | server/.env |

`server/.env.example` contains placeholders. The real `.env` is git-ignored. No secrets reach the browser.

## Demo Login Accounts
These emails are fictional identifiers, not mailboxes. The login page also has one-click demo-account buttons.

| Role | Name | Demo email | Password |
| --- | --- | --- | --- |
| Admin | Admin | admin@novaworks.example | Demo123! |
| Manager | Ayesha Khan | ayesha@novaworks.example | Demo123! |
| Manager | Bilal Ahmed | bilal@novaworks.example | Demo123! |
| Manager | Hina Malik | hina@novaworks.example | Demo123! |
| Agent | Ali Raza | ali@novaworks.example | Demo123! |
| Agent | Hamza Shah | hamza@novaworks.example | Demo123! |
| Agent | Sara Noor | sara@novaworks.example | Demo123! |
| Agent | Usman Tariq | usman@novaworks.example | Demo123! |
| Agent | Zain Abbas | zain@novaworks.example | Demo123! |
| Agent | Maryam Asif | maryam@novaworks.example | Demo123! |

Run `npm run seed` in `server/` once before the demo.

## How Judges Can Test
1. Log in as **admin** and open **Create from Transcript**.
2. Click **Load supplied transcript** (the file is `server/sample/transcript.txt`), or paste your own transcript.
3. Click **Create from Transcript**. Expected result: **3 projects, 12 tasks** (UrbanCart 40 h, QuickServe 46 h, HelpDeskPro 38 h).
4. Open UrbanCart. Expected: manager Ayesha, deadline 20 Oct 2026, four tasks.
5. Log out and log in as **Ayesha**. Only UrbanCart appears.
6. Log in as **Ali**. My Tasks shows only his 3 UrbanCart tasks.
7. Log in as **Hamza**. His two API tasks span UrbanCart and QuickServe.
8. Direct access check: while logged in as Ayesha, open `/projects/<QuickServe id>`. You get "Project not found or not accessible". `GET /api/projects/<id>` returns 404 and `POST /api/transcript` returns 403 for non-admins.
9. Refresh the page. The data persists.
10. As admin, click **Reset demo data**, then **Load modified transcript** (`server/sample/transcript-modified.txt`, in which QuickServe integration is 12 h and due 23 Oct). Create again. Only that task changes.

**Reset between tests:** use the admin's **Reset demo data** button. It deletes projects and tasks and keeps the seeded users.

## Deployment Details
- Deployment status: [Live / Local only]
- Frontend + backend host: [e.g. Render web service. Express serves the built React app from the same origin.]
- Database: [MongoDB Atlas free M0 / local replica set]
- Deployed branch/commit: [branch and SHA]

### How We Deployed
1. Build command: `cd client && npm install && npm run build && cd ../server && npm install`
2. Start command: `cd server && npm start` (serves the API and `client/dist`)
3. Database: an Atlas M0 cluster. Allow network access from the host. Use the `mongodb+srv://…` URI as `MONGODB_URI`.
4. Environment variables set on the host: `MONGODB_URI`, `SESSION_SECRET`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `OPENROUTER_FALLBACK_MODEL`, `NODE_ENV=production`
5. Seed: run `npm run seed` locally with `MONGODB_URI` pointed at Atlas.
6. Same-origin deployment, so no CORS configuration is needed.

## Known Limitations
- Free OpenRouter models can be rate-limited or slow. The fallback model is tried automatically, and the error is shown if both fail.
- MongoDB transactions need a replica set. A plain standalone `mongod` will fail when saving.
- Correction flow: validation errors are listed (for example an unknown person or a task deadline after the project deadline), and the admin edits the transcript and retries. Inline editing of the draft is not implemented.

## Submission Summary
- Source repository: https://github.com/HASNAT691/infinityHackathon
- Live link or local demo video: [URL]
- Setup and seed commands: documented above
- Demo login accounts: confirmed working
- Features completed: seeded login, role-based views and API, AI transcript-to-records with validation and a transaction save, team directory, persistence, demo reset
