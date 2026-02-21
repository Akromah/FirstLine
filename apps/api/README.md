# FirstLine API

## Run (local)

1. `cd apps/api`
2. `python -m venv .venv`
3. `.\.venv\Scripts\activate`
4. `pip install -e .`
5. `uvicorn app.main:app --reload --port 4000`

## Modules

- Smart call intake: `/api/v1/intake/calls`, `/api/v1/intake/risk/{incident_id}`
- Unified map: `/api/v1/map/overview` and `/api/v1/map/stream`
- Dispatch AI: `/api/v1/dispatch/queue`, `/api/v1/dispatch/units`, `/api/v1/dispatch/assign`, `/api/v1/dispatch/disposition`
- Unit recommendation: `/api/v1/recommendation/unit`
- Officer mobile actions: `/api/v1/officer/*`
- Command dashboard: `/api/v1/command/overview`
- Reporting pipeline: `/api/v1/reporting/hub`, `/api/v1/reporting/draft`, `/api/v1/reporting/rms`
- Records/Warrants/Firearms lookup: `/api/v1/intel/lookup`, `/api/v1/intel/profile/{person_id}`
- AI operations engine: `/api/v1/ai/incident`
