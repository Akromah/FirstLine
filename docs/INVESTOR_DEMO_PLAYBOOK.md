# FirstLine Investor Demo Playbook

## Goal
Run a 10-15 minute live demo that shows FirstLine as a modern, AI-assisted, map-first CAD platform with measurable command outcomes.

## Suggested Flow
1. Start in `Dispatch` view.
2. Launch demo data from **Smart Call Intake**:
   - Scenario: `HIGH_RISK_NIGHT`
   - Click `Launch Scenario`
3. Open **Priority Radar**:
   - Show risk-ranked incidents and safety alerts.
4. Open **Unified Live Map**:
   - Toggle `Units` and `Incidents`.
   - Use `Center Selected` on a high-risk incident.
5. Show **Recommendation Engine**:
   - Run `Recommend Unit` and `Dispatch Unit`.
   - Call out fatigue/workload-aware assignment logic.
6. Switch to `Field` view (`Alt+2`):
   - Use **Assigned Call Deck** and one-tap actions.
   - Send an incident-tagged secure message from **Secure Messaging**.
7. Open `Report` view (`Alt+3`):
   - In **Report Writing Hub**, apply template + dictation.
   - Attach digital evidence link.
   - Run AI narrative refinement.
   - Highlight autosave and RMS submission gating on disposition.
8. Return to command-side panels:
   - **Supervisor Review Queue** approve/request changes.
   - **Reporting Pipeline Metrics** for quality and throughput.
   - **Operational Trends** for snapshot-to-snapshot movement.
9. Close with **Unit Readiness Board**:
   - Show break recommendations and readiness scoring.

## Talk Track Anchors
- "This reduces dispatcher cognitive load with AI triage and unit recommendation."
- "Officer mobile workflows are one-tap and report-first, not form-heavy."
- "Command gets measurable KPIs: response trends, review backlog, and reporting quality."
- "Evidence and narrative pipeline is integrated end-to-end, not stitched together."

## Reliability Checklist Before Demo
- API health endpoint returns `ok=true`.
- `apps/api` tests pass: `python -m pytest -q`.
- `apps/web` build passes: `npm run build`.
- Browser microphone permission is enabled for dictation.
