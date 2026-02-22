# FirstLine

Python-first scaffolding for a modern CAD platform focused on:

- Smart Dispatch AI
- Unified Live Map
- Intelligent Unit Assignment
- Mobile Officer App
- Command Dashboard

## Current Product Highlights

- Smart intake with AI-assisted call typing, priority scoring, duplicate detection, and one-click demo scenario seeding.
- Map-first operations with live unit and incident overlays, geofence/traffic context, and layer toggles.
- Recommendation engine with proximity/skill/workload/fatigue scoring and fatigue guardrail assignment logic.
- Mobile officer workflow with one-tap status updates, assigned call deck, secure messaging, and incident channels.
- Integrated reporting hub with templates, dictation support, autosave, AI narrative refinement, evidence linkage, and RMS payload export.
- Supervisor workflow with report review queue, approve/request-changes actions, and review notes.
- Command analytics including operational trend snapshots, unit readiness board, and reporting pipeline KPIs.
- Intelligence hub with records, warrants, firearms lookup, and officer safety profile context.

## Investor Demo Assets

- `docs/INVESTOR_DEMO_PLAYBOOK.md` step-by-step live demo flow and talk track.

## Structure

- `apps/api` FastAPI modular backend
- `apps/worker` Celery worker for async AI tasks
- `apps/web` React + Vite UI shell
- `infra/docker-compose.yml` local PostGIS + Redis + API
- `docs/ARCHITECTURE.md` architecture and module map

## Quick Start

### 1. Infrastructure (optional first)

```powershell
cd c:\Users\jared\projects\FirstLine
docker compose -f .\infra\docker-compose.yml up -d postgres redis
```

### 2. API

```powershell
cd c:\Users\jared\projects\FirstLine\apps\api
python -m venv .venv
.\.venv\Scripts\activate
pip install -e .
uvicorn app.main:app --reload --port 4000
```

### 3. Web

```powershell
cd c:\Users\jared\projects\FirstLine\apps\web
npm install
copy .env.example .env
npm run dev
```

Web: `http://localhost:5173`  
API docs: `http://localhost:4000/docs`
