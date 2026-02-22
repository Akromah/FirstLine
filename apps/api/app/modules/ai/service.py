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


class BriefingRequest(BaseModel):
    incident_id: str
    unit_id: str | None = None


def incident_briefing(payload: BriefingRequest) -> dict | None:
    incident = state.get_incident(payload.incident_id)
    if not incident:
        return None

    risk = state.build_risk_profile(payload.incident_id) or {}
    text = incident["call_text"].lower()
    hazards: list[str] = []
    if "weapon" in text or "gun" in text or "knife" in text:
        hazards.append("Potential weapon involvement.")
    if risk.get("mental_health_pattern_flag"):
        hazards.append("Behavioral health escalation risk.")
    if incident["priority"] >= 85:
        hazards.append("High-priority response profile.")
    if not hazards:
        hazards.append("No elevated hazard markers detected in intake text.")

    checklist = [
        "Confirm approach route and cover options.",
        "Run warrants and firearms checks on involved names.",
        "Coordinate radio updates at key status changes.",
        "Document evidence and witness details before clearing.",
    ]

    return {
        "incident_id": payload.incident_id,
        "unit_id": payload.unit_id,
        "risk_score": risk.get("risk_score", incident["priority"]),
        "hazards": hazards,
        "checklist": checklist,
        "briefing": (
            f"Incident {incident['incident_id']} {incident['call_type']} at {incident['address']} "
            f"priority {incident['priority']} status {incident['status']}."
        ),
    }


class DispositionDraftRequest(BaseModel):
    incident_id: str
    unit_id: str | None = None


def disposition_draft(payload: DispositionDraftRequest) -> dict | None:
    incident = state.get_incident(payload.incident_id)
    if not incident:
        return None

    timeline = state.get_incident_timeline(payload.incident_id)
    last_action = next(
        (event for event in reversed(timeline) if event.get("event") == "officer_action"),
        None,
    )
    last_action_text = (last_action or {}).get("action", "NO_ACTION")
    call_type = (incident.get("call_type") or "").lower()
    call_text = (incident.get("call_text") or "").lower()
    priority = int(incident.get("priority") or 0)

    address_hits = state.search_public_safety_records(incident.get("address") or "")
    caller_name = incident.get("caller_name") or ""
    caller_hits = (
        state.search_public_safety_records(caller_name)
        if caller_name and caller_name.lower() not in {"unknown", "anonymous"}
        else {"records": [], "firearms": [], "warrants": []}
    )
    active_warrant_count = len(
        [
            item
            for item in address_hits.get("warrants", []) + caller_hits.get("warrants", [])
            if item.get("status") == "ACTIVE"
        ]
    )

    arrest_made = False
    citation_issued = False
    force_used = False
    recommended_code = "REPORT_ONLY"
    confidence = 0.64
    reasons: list[str] = []

    if active_warrant_count > 0:
        recommended_code = "ARREST_MADE"
        arrest_made = True
        confidence = 0.84
        reasons.append(f"Active warrant hit count: {active_warrant_count}.")
    elif "traffic" in call_type or "dui" in call_type:
        recommended_code = "WARNING_ISSUED"
        citation_issued = True
        confidence = 0.74
        reasons.append("Traffic-style incident pattern suggests citation/warning flow.")
    elif any(token in call_text for token in ["weapon", "gun", "knife"]) and priority >= 85:
        recommended_code = "ARREST_MADE"
        arrest_made = True
        force_used = "force" in call_text or "fight" in call_text
        confidence = 0.82
        reasons.append("High priority with potential weapon language.")
    elif "domestic" in call_type:
        recommended_code = "WARNING_ISSUED"
        confidence = 0.71
        reasons.append("Domestic response commonly closes with warning/report outcome.")
    elif priority >= 80:
        recommended_code = "REFERRED"
        confidence = 0.69
        reasons.append("Elevated priority with incomplete enforcement markers.")
    else:
        reasons.append("Default report-only recommendation from available CAD context.")

    if last_action_text in {"ON_SCENE", "ARRIVED"}:
        reasons.append("Unit marked on-scene; disposition should summarize contact outcomes.")
    if incident.get("status") == "CLOSED" and incident.get("disposition"):
        existing = incident["disposition"]
        return {
            "incident_id": payload.incident_id,
            "unit_id": payload.unit_id,
            "recommended_disposition_code": existing.get("disposition_code"),
            "summary": existing.get("summary"),
            "arrest_made": bool(existing.get("arrest_made")),
            "citation_issued": bool(existing.get("citation_issued")),
            "force_used": bool(existing.get("force_used")),
            "requires_supervisor_review": bool(existing.get("requires_supervisor_review")),
            "confidence": 0.95,
            "reasons": ["Disposition already finalized; returning existing closeout data."],
        }

    summary = (
        f"Unit {payload.unit_id or incident.get('assigned_unit_id') or 'unknown'} resolved "
        f"{incident['call_type']} at {incident['address']}. "
        f"Final action observed: {last_action_text}. "
        f"Disposition recommendation: {recommended_code}. "
        "Scene stabilized, involved parties documented, and CAD timeline updated."
    )

    return {
        "incident_id": payload.incident_id,
        "unit_id": payload.unit_id,
        "recommended_disposition_code": recommended_code,
        "summary": summary,
        "arrest_made": arrest_made,
        "citation_issued": citation_issued,
        "force_used": force_used,
        "requires_supervisor_review": force_used or arrest_made,
        "confidence": round(min(0.95, max(0.55, confidence)), 2),
        "reasons": reasons,
    }
