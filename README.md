# FirstLine

Python-first scaffolding for a modern CAD platform focused on:

- Smart Dispatch AI
- Unified Live Map
- Intelligent Unit Assignment
- Mobile Officer App
- Command Dashboard

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
