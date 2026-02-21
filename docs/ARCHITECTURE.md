# FirstLine Architecture

## Core Pillars

1. Smart Dispatch AI
2. Unified Live Map
3. Intelligent Unit Assignment
4. Mobile Officer App
5. Command Dashboard

## Platform Shape

- `apps/api` (FastAPI): API gateway + domain modules
- `apps/worker` (Celery): async AI/transcription/scoring jobs
- `apps/web` (React/Vite): dispatcher and officer UX shell
- `PostgreSQL + PostGIS`: CAD state, incident history, geospatial queries
- `Redis`: pub/sub + task queue + transient real-time state

## Domain Modules

- `intake`: call transcription, geolocation normalization, duplicate detection, priority scoring
- `mapping`: map state, hot zones, geofence alerts, live unit stream
- `dispatch`: incident lifecycle, status updates, assignment flow
- `recommendation`: best-unit engine (distance, skillset, workload, fatigue)
- `officer`: mobile actions, quick status updates, secure messaging
- `command`: command center analytics and trend visibility
- `reporting`: CAD to RMS handoff, templates, audit timeline, evidence links

## Next Build Steps

1. Integrate real GIS provider + map tiles
2. Add authN/authZ with agency RBAC
3. Persist incidents/units in Postgres
4. Add WebSocket fan-out via Redis pub/sub
5. Implement STT provider integration for live intake
6. Connect reporting payloads to RMS adapters
