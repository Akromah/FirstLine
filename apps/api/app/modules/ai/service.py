from pydantic import BaseModel

from app.core.state import state


class IncidentAssistRequest(BaseModel):
    incident_id: str
    prompt: str | None = None


def incident_assist(payload: IncidentAssistRequest) -> dict | None:
    return state.generate_ai_assist(payload.incident_id, payload.prompt)


class ReportAssistRequest(BaseModel):
    incident_id: str
    unit_id: str
    narrative: str
    tone: str = "professional"


def report_assist(payload: ReportAssistRequest) -> dict | None:
    incident = state.get_incident(payload.incident_id)
    if not incident:
        return None

    timeline = state.get_incident_timeline(payload.incident_id)
    recent_actions: list[str] = []
    for event in timeline[-4:]:
        event_name = event.get("event", "event")
        event_action = event.get("action")
        recent_actions.append(f"{event_name}:{event_action}" if event_action else event_name)

    disposition = incident.get("disposition") or {}
    disposition_text = disposition.get("summary") or "Disposition pending."

    improved_narrative = (
        f"Unit {payload.unit_id} responded to {incident['call_type']} at {incident['address']} "
        f"(priority {incident['priority']}). {payload.narrative.strip()} "
        f"Recent CAD events: {', '.join(recent_actions) if recent_actions else 'No additional events logged'}. "
        f"Final disposition context: {disposition_text}"
    ).strip()

    return {
        "incident_id": payload.incident_id,
        "unit_id": payload.unit_id,
        "tone": payload.tone,
        "improved_narrative": improved_narrative,
        "key_points": [
            "Capture witness names and statements if available.",
            "Document de-escalation and safety steps taken.",
            "Ensure disposition language aligns with charge/citation outcome.",
        ],
        "confidence": round(min(0.96, 0.68 + (incident["priority"] / 320)), 2),
    }
