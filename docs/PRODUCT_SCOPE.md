# FirstLine Product Scope (Scaffold)

## Smart Dispatch AI
- Live voice-to-text transcription hook
- Auto-priority scoring endpoint
- Duplicate call hinting
- AI call-type suggestion placeholder

## Unified Live Map
- `/api/v1/map/overview` snapshot
- `/api/v1/map/stream` websocket for unit updates
- Hot zones + geofence alerts in payload

## Intelligent Unit Assignment
- Recommendation scoring model using skill, workload, and fatigue
- Dispatch assignment endpoint
- ETA/confidence output format ready for future ML model

## Mobile Officer App
- Officer feed endpoint with incident history at address
- One-tap status updates
- Secure message endpoint
- Evidence/report linkage payload in reporting module

## Command Dashboard
- KPI and trend snapshot endpoint
- Dispatch AI performance indicators

## Integrated Reporting Pipeline
- Report draft save/update endpoint
- Reporting hub endpoint with missing-report queue
- RMS export endpoint with incident timeline audit trail

## Records and Warrant Access
- Unified search endpoint for person records, firearms registry, and warrant index
- Subject profile endpoint with officer safety flags

## AI Operations Engine
- Incident assist endpoint for generated summary and next actions
- Disposition code recommendation with confidence output

## Out of Scope for Scaffold
- Production auth and CJIS controls
- Real GIS provider integration
- Full database persistence
- RMS vendor-specific connectors
