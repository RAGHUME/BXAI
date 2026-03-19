# BXAI Platform

> **Live Demo:**  
> 🌐 Frontend: [https://bxai-git-main-raghumes-projects.vercel.app](https://bxai-git-main-raghumes-projects.vercel.app)  
> 🔧 Backend API: [https://bxai-backend.onrender.com](https://bxai-backend.onrender.com)

## Introduction
BXAI is a blockchain-backed evidence lifecycle management platform built for digital forensics teams. It delivers role-aware dashboards (admin, investigator, and end-user) that orchestrate case intake, evidence handling, blockchain anchoring, explainable AI (XAI) insights, and AI-powered log anomaly detection (X-LAD). The goal is to provide tamper-resistant provenance records while making investigation workflows transparent and auditable.

## Core capabilities & workflow
1. **Case intake and assignment** – Admins curate cases, approve stakeholder requests, and assign investigators.
2. **Secure evidence handling** – Investigators upload artifacts, which are hashed client-side and stored with metadata in MongoDB.
3. **Blockchain anchoring** – Evidence hashes are anchored to an Ethereum-compatible ledger (local Ganache) to create immutable attestations.
4. **Chain of custody tracking** – Admins review a timeline of every action performed on each evidence item, with exportable PDFs for reporting.
5. **XAI insights** – Explainability modules surface model outputs, bias checks, and human-readable rationales for evidence analysis.
6. **Log anomaly detection (X-LAD)** – A background AI service that continuously analyzes system activity logs using ChromaDB embeddings and Google Generative AI to detect anomalous behavior in real-time.

## System architecture
- **Frontend (Vite + React + Tailwind)** – Delivers dashboards, evidence management, blockchain actions, and chain-of-custody visualizations.
- **Backend (Flask REST API)** – Exposes authentication, case management, evidence operations, blockchain anchoring endpoints, XAI analysis, and PDF generation.
- **MongoDB Atlas** – Cloud-hosted database persisting accounts, cases, evidence metadata, activity logs, chain-of-custody records, and blockchain receipts.
- **Blockchain microservice** – Uses Hardhat for contract deployment and Web3.py for anchoring/verification on Ganache.
- **XAI pipeline** – Explainability services for evidence analysis using LIME, scikit-learn, and Google Generative AI.
- **X-LAD (Log Anomaly Detection)** – Background daemon using ChromaDB vector embeddings and sentence-transformers to detect anomalous activity patterns.

## Repository structure
```
.
├── backend/
│   ├── api/
│   │   ├── routes/               # Flask blueprints for blockchain and other services
│   │   └── services/             # Reusable service classes (e.g., BlockchainService)
│   ├── app.py                    # Main Flask application and API routes
│   ├── config/                   # Blockchain configuration (ABI, addresses)
│   ├── requirements.txt          # Python dependencies
│   └── uploads/                  # Evidence files (gitignored in production)
├── frontend/
│   ├── src/
│   │   ├── api/                  # API clients for admin/auth endpoints
│   │   ├── pages/                # Role-specific dashboard pages
│   │   ├── components/           # Shared React components
│   │   ├── services/             # Helpers (e.g., hashing, analytics)
│   │   └── utils/                # Utility functions
│   ├── index.html                # Vite entry point
│   └── package.json              # Frontend dependencies and scripts
├── blockchain/
│   ├── contracts/                # Smart contract sources
│   ├── scripts/                  # Hardhat deployment scripts
│   └── hardhat.config.js         # Hardhat configuration for Ganache
└── README.md
```

## Data flow overview
1. **User interaction** – A dashboard user signs in and triggers actions (create case, upload evidence, view chain of custody).
2. **API processing** – Flask authenticates the request, applies role checks, and orchestrates data mutations in MongoDB.
3. **Blockchain anchoring** – For anchoring/verification calls, Flask delegates to `BlockchainService`, which interacts with the smart contract via Web3.py.
4. **Chain of custody aggregation** – The backend composes timeline entries from MongoDB collections, ensuring ObjectIds and datetimes are serialized.
5. **Frontend rendering** – React consumes JSON responses, renders cards, timelines, and modals, and offers PDF exports for compliance.

## Database schema (MongoDB)
- **Database name:** `BXAI`
- **Collections (8 total):**
  - `admins` – Seeded admin credentials and profile metadata.
  - `accounts` – Investigator and end-user accounts with hashed passwords and organization details.
  - `cases` – Core case records, linked to investigators and evidence via `caseId`.
  - `case_requests` – Follow/participation requests submitted by end users and triaged by admins.
  - `evidence` – Evidence descriptors (hashes, file metadata, collection dates) referencing uploaded files on disk.
  - `activity_logs` – Recent activity feed entries for dashboards and notifications.
  - `blockchain_records` – Transaction receipts and anchors generated by the blockchain service.
  - `chain_of_custody` – Timeline snapshots consolidating evidence actions, verification steps, and network metadata.
- **File storage:** Binary evidence is saved under `backend/uploads/evidence/` with references persisted in the `evidence` collection.
- **Indexes:** MongoDB maintains `_id` indexes by default; consider adding secondary indexes on `caseId`, `evidence_id`, and `createdAt` for production workloads.

## Methodology & technology stack
- **Frontend** – React 18, Vite, Tailwind CSS, Heroicons, React Router, Plotly.js.
- **Backend** – Flask, Gunicorn, PyMongo, Web3.py, ReportLab (PDF), Python 3.10.
- **AI/ML** – ChromaDB, Sentence-Transformers, scikit-learn, LIME, Google Generative AI, OpenRouter (Nemotron/DeepSeek).
- **Blockchain** – Solidity smart contract deployed via Hardhat to Ganache.
- **Data storage** – MongoDB Atlas (cloud), ChromaDB vector store for log embeddings.
- **Deployment** – Vercel (frontend), Render (backend API).
- **Testing & tooling** – npm scripts, pip/venv, environment-driven configuration.

## Prerequisites
- Node.js 18+
- npm (bundled with Node) and npx
- Python 3.10+
- pip (Python package manager)
- MongoDB instance (local or Atlas)
- Ganache (GUI or CLI) for the local Ethereum network
- Hardhat (installed per-project via `npm install`)
- Git (recommended for source control)

## Environment configuration
- `backend/.env` – Holds MongoDB URI, blockchain endpoint, contract address, and private key.
- `frontend/.env` – Optionally overrides `VITE_API_BASE_URL`.
- Ensure the blockchain contract address written by Hardhat deployment matches the backend config before anchoring evidence.

## Backend setup
1. Open a terminal and navigate to the project root.
2. Switch into the backend folder: `cd backend`.
3. (Optional) Create and activate a virtual environment:
   ```bash
   python -m venv .venv
   .venv\Scripts\activate  # PowerShell
   ```
4. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```
5. Confirm `.env` has your MongoDB connection string and blockchain settings.
6. Run the Flask API:
   ```bash
   flask --app app run --port 5000
   ```
   Key endpoints include `POST /api/admin/login`, `GET /api/admin/summary`, and `GET /api/admin/chain-of-custody`.

## Frontend setup
1. In a new terminal at the project root run `cd frontend`.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create `.env` if you need to point to a non-default API server:
   ```
   VITE_API_BASE_URL=http://localhost:5000
   ```
4. Start the dev server:
   ```bash
   npm run dev
   ```
   Vite serves the UI at `http://localhost:5173`.

## Blockchain module setup
1. Ensure Ganache is running on `http://127.0.0.1:7545` with unlocked accounts.
2. From the `blockchain/` directory install dependencies and compile:
   ```bash
   npm install
   npx hardhat compile
   ```
3. Deploy the smart contract to Ganache:
   ```bash
   npx hardhat run scripts/deploy.js --network ganache
   ```
4. Copy the generated contract address and ABI (written to `backend/config/blockchain.json`) into `backend/.env`:
   ```
   GANACHE_URL=http://127.0.0.1:7545
   GANACHE_PRIVATE_KEY=<private key used for deployment>
   CONTRACT_ADDRESS=<address from blockchain.json>
   ```
5. Restart the Flask API after updating the environment variables.

## Deployment

### Live URLs
| Component | Platform | URL |
|---|---|---|
| Frontend | Vercel | [bxai-git-main-raghumes-projects.vercel.app](https://bxai-git-main-raghumes-projects.vercel.app) |
| Backend API | Render | [bxai-backend.onrender.com](https://bxai-backend.onrender.com) |
| Database | MongoDB Atlas | Cloud-hosted (auto-connected) |

> **Note:** The Render free tier spins down after 15 minutes of inactivity. The first request after idle may take ~30 seconds.

### Environment Variables
- **Backend (Render):** `MONGODB_URL`, `SMTP_*`, `GOOGLE_API_KEY`, `OPENROUTER_API_KEY`, `FRONTEND_ORIGIN`
- **Frontend (Vercel):** `VITE_API_BASE_URL` → points to the Render backend URL

## Running locally
1. Start Ganache.
2. Launch the Flask backend (`flask --app app run --port 5000`).
3. Run the React frontend (`npm run dev` inside `frontend/`).
4. Visit `http://localhost:5173` and sign in as the seeded admin to exercise dashboards, evidence workflows, and chain-of-custody timelines.

## Admin access
- Email: `raghu.bldeacet17@gmail.com`
- Password: `ShRI1NIV@S`

The backend seeds this admin (password stored as a secure hash) on startup if it doesn't already exist.

## Admin workflow
1. Visit `http://localhost:5173/signin` and log in with the credentials above.
2. Upon success you are redirected to `/admin/dashboard`, showing case/evidence/alert counts and recent activity from MongoDB collections (`cases`, `evidence`, `alerts`, `activity_logs`).
3. Navigate to `/admin/chain-of-custody` to filter timelines by case or evidence and export PDF summaries.
4. Case request modals allow approving or rejecting user follow requests; accepted cases can be assigned to investigators.
5. If you select **Keep me signed in**, the admin session persists in `localStorage`; otherwise it is scoped to the browser tab via `sessionStorage`.
6. Use the **Sign out** button in the dashboard header to clear the stored session.

## Investigator workflow
1. Sign in with an investigator account to land on `/investigator/dashboard`.
2. Review the overview tab for assigned cases, blockchain status, and weekly activity.
3. Drill into **Cases** to inspect evidence libraries, timeline context, and investigator notes.
4. Upload new evidence via the **Evidence vault**; files are hashed client-side before submission.
5. Anchor evidence to the blockchain using the **Blockchain** tab, monitoring transaction status and receipts.
6. Verify hashes periodically to detect tampering; failed verifications surface immediate alerts.
7. Export reports or XAI analyses (when available) to share findings with admins and external reviewers.

## End-user workflow
1. Sign in to view the user dashboard home experience.
2. Browse **Cases you’re following** for updates streamed from MongoDB activity logs.
3. Discover **Cases available to follow** and submit follow/participation requests.
4. Track the status of submissions inside **Your case requests**; accepted requests unlock deeper case insights.
5. Receive notifications when admins approve or reject requests, and download relevant public artifacts.

## XAI & AI Features

### Explainable AI (XAI)
- Evidence analysis with LIME-based feature attribution and Google Generative AI reasoning.
- XAI insights stored alongside evidence metadata with confidence scores.
- Dashboard widgets summarizing insights, drift alerts, and explainability reports.

### Log Anomaly Detection (X-LAD)
- Background service continuously monitors activity logs for anomalous patterns.
- Uses ChromaDB vector embeddings with sentence-transformers for semantic similarity.
- Detected anomalies are flagged in real-time on the admin dashboard.

### API Endpoints
- `GET /api/xai/insights` – Returns explainability summaries per case/evidence.
- `POST /api/xai/analyze` – Triggers explanation generation for evidence.
- `GET /api/xai/reports/<evidence_id>` – Downloadable PDF/CSV explainability reports.
- `GET /api/logs/anomalies` – Lists detected log anomalies.
- `GET /api/logs/stats` – Log processing statistics and health metrics.

## Current status
- ✅ Chain of Custody UI live with timeline filtering and PDF export.
- ✅ Admin dashboard with case requests (accept/reject controls).
- ✅ Blockchain anchoring and verification (requires Ganache for local dev).
- ✅ XAI analysis pipeline integrated with Google Generative AI and LIME.
- ✅ X-LAD log anomaly detection running as a background service.
- ✅ Deployed: Frontend on Vercel, Backend on Render, Database on MongoDB Atlas.
- 🔄 Pending: Timezone-aware datetime helpers, multi-admin auth hardening.

## Notes
- The backend uses Gunicorn as the production WSGI server.
- Add new activity/case/evidence documents directly in MongoDB to see live changes on the dashboard.
- Update `backend/app.py` if you want to support additional admins or JWT-based auth in the future.
