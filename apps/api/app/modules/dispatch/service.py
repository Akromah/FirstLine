from datetime import datetime, timezone
from math import asin, cos, radians, sin, sqrt

from pydantic import BaseModel
from pydantic import Field

from app.core.state import state
from app.modules.mapping.service import get_live_units
from app.schemas.common import UnitSummary


class AssignmentRequest(BaseModel):
    incident_id: str
    required_skills: list[str] = Field(default_factory=list)
    incident_lat: float
    incident_lon: float


class AssignmentResponse(BaseModel):
    incident_id: str
    recommended_unit_id: str
    callsign: str
    predicted_eta_minutes: int
    confidence: float
    reasons: list[str]


class DispositionRequest(BaseModel):
    incident_id: str
    unit_id: str
    disposition_code: str
    summary: str
    arrest_made: bool = False
    citation_issued: bool = False
    force_used: bool = False


class DispositionResponse(BaseModel):
    incident_id: str
    status: str
    disposition: dict
    error: str | None = None


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    earth_radius_km = 6371.0
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    lat1_rad = radians(lat1)
    lat2_rad = radians(lat2)
    haversine = sin(dlat / 2) ** 2 + cos(lat1_rad) * cos(lat2_rad) * sin(dlon / 2) ** 2
    return 2 * earth_radius_km * asin(sqrt(haversine))


def rank_units(payload: AssignmentRequest) -> list[tuple[float, UnitSummary, int, float]]:
    units = get_live_units()
    ranked = []
    for unit in units:
        if not unit.dispatchable:
            continue
        requested_skills = {s.lower() for s in payload.required_skills}
        unit_skills = {s.lower() for s in unit.skills}
        skill_match = len(requested_skills & unit_skills)
        distance_km = haversine_km(
            unit.coordinates.lat,
            unit.coordinates.lon,
            payload.incident_lat,
            payload.incident_lon,
        )
        availability_bonus = 20 if unit.status == "AVAILABLE" else 6
        if unit.status not in {"AVAILABLE", "EN_ROUTE", "ON_SCENE"}:
            availability_bonus = -8
        proximity_score = max(0, 25 - (distance_km * 4.3))
        fatigue_penalty = unit.fatigue_score * 0.2
        workload_penalty = unit.workload_score * 0.25
        total = availability_bonus + proximity_score + (skill_match * 16) - fatigue_penalty - workload_penalty
        ranked.append((total, unit, skill_match, distance_km))

    ranked.sort(key=lambda row: row[0], reverse=True)
    return ranked


def choose_unit(payload: AssignmentRequest, commit: bool = True) -> AssignmentResponse:
    ranked = rank_units(payload)
    if not ranked:
        return AssignmentResponse(
            incident_id=payload.incident_id,
            recommended_unit_id="UNAVAILABLE",
            callsign="NONE",
            predicted_eta_minutes=0,
            confidence=0.0,
            reasons=["No dispatchable units currently available for assignment."],
        )
    best_score, best_unit, match_count, distance_km = ranked[0]
    incident = state.get_incident(payload.incident_id)
    incident_priority = int(incident["priority"]) if incident and incident.get("priority") is not None else 0
    fatigue_guardrail_triggered = False

    if incident_priority < 85 and best_unit.fatigue_score >= 70:
        alternative = next(
            (
                row
                for row in ranked[1:]
                if row[1].fatigue_score < 70 and row[1].status in {"AVAILABLE", "EN_ROUTE", "ON_SCENE"}
            ),
            None,
        )
        if alternative and alternative[0] >= (best_score - 10):
            best_score, best_unit, match_count, distance_km = alternative
            fatigue_guardrail_triggered = True

    eta = max(2, int(round(distance_km / 0.75)))
    confidence = round(min(0.98, max(0.45, (best_score + 30) / 100)), 2)
    reasons = [
        f"Status: {best_unit.status}",
        f"Skill matches: {match_count}",
        f"Distance: {distance_km:.2f} km",
        f"Workload score: {best_unit.workload_score}",
        f"Fatigue score: {best_unit.fatigue_score}",
    ]
    if fatigue_guardrail_triggered:
        reasons.append("Fatigue guardrail applied: selected lower-fatigue unit.")

    response = AssignmentResponse(
        incident_id=payload.incident_id,
        recommended_unit_id=best_unit.unit_id,
        callsign=best_unit.callsign,
        predicted_eta_minutes=eta,
        confidence=confidence,
        reasons=reasons,
    )
    if commit:
        persisted = state.assign_incident(payload.incident_id, best_unit.unit_id, eta, confidence, reasons)
        if not persisted:
            response.reasons.append("Incident state update pending.")
    return response


def finalize_disposition(payload: DispositionRequest) -> DispositionResponse:
    incident = state.get_incident(payload.incident_id)
    if not incident:
        return DispositionResponse(
            incident_id=payload.incident_id,
            status="NOT_FOUND",
            disposition={},
            error="Incident not found.",
        )
    if incident["status"] in {"NEW"}:
        return DispositionResponse(
            incident_id=payload.incident_id,
            status=incident["status"],
            disposition={},
            error="Cannot finalize disposition before dispatch assignment.",
        )
    if len(payload.summary.strip()) < 15:
        return DispositionResponse(
            incident_id=payload.incident_id,
            status=incident["status"],
            disposition={},
            error="Disposition summary must be at least 15 characters.",
        )

    incident = state.set_incident_disposition(
        incident_id=payload.incident_id,
        unit_id=payload.unit_id,
        disposition_code=payload.disposition_code,
        summary=payload.summary,
        arrest_made=payload.arrest_made,
        citation_issued=payload.citation_issued,
        force_used=payload.force_used,
    )
    if not incident:
        return DispositionResponse(
            incident_id=payload.incident_id,
            status="NOT_FOUND",
            disposition={},
            error="Incident not found.",
        )
    return DispositionResponse(
        incident_id=incident["incident_id"],
        status=incident["status"],
        disposition=incident["disposition"] or {},
    )


def build_unit_readiness_board() -> dict:
    units = get_live_units()
    board: list[dict] = []
    for unit in units:
        active_assignments = len(state.get_assigned_incidents_for_unit(unit.unit_id))
        readiness_score = max(
            0,
            min(
                100,
                int(
                    100
                    - (unit.fatigue_score * 0.55)
                    - (unit.workload_score * 0.35)
                    - (10 if unit.status not in {"AVAILABLE", "EN_ROUTE"} else 0)
                ),
            ),
        )
        requires_break = unit.fatigue_score >= 70 or readiness_score <= 35
        board.append(
            {
                "unit_id": unit.unit_id,
                "callsign": unit.callsign,
                "status": unit.status,
                "skills": unit.skills,
                "workload_score": unit.workload_score,
                "fatigue_score": unit.fatigue_score,
                "active_assignments": active_assignments,
                "readiness_score": readiness_score,
                "requires_break": requires_break,
            }
        )

    board.sort(key=lambda row: row["readiness_score"], reverse=True)
    return {
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "units": board,
        "break_recommendations": [row["unit_id"] for row in board if row["requires_break"]],
    }


def build_priority_radar(limit: int = 8) -> dict:
    incidents = state.list_incident_summaries()
    rows: list[dict] = []
    for incident in incidents:
        risk = state.build_risk_profile(incident.incident_id) or {}
        rows.append(
            {
                "incident_id": incident.incident_id,
                "call_type": incident.call_type,
                "priority": incident.priority,
                "status": incident.status,
                "address": incident.address,
                "risk_score": risk.get("risk_score", incident.priority),
                "safety_alerts": risk.get("safety_alerts", []),
            }
        )
    rows.sort(key=lambda item: (item["risk_score"], item["priority"]), reverse=True)
    capped = rows[: max(1, min(limit, 25))]
    return {
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "count": len(capped),
        "incidents": capped,
    }


def _latest_unit_event(incident: dict) -> str:
    timeline = incident.get("timeline", [])
    for event in reversed(timeline):
        if event.get("event") == "officer_action":
            action = event.get("action")
            if action:
                return str(action)
        if event.get("event") == "unit_assigned":
            return "DISPATCHED"
        if event.get("event") == "disposition_finalized":
            return "DISPOSITION_FINALIZED"
    return "NO_ACTIVITY"


def _incident_dispatch_label(incident: dict | None) -> str:
    if not incident:
        return "No active CAD incident"
    code = (incident.get("primary_code") or "").strip()
    crime = (incident.get("crime_label") or incident.get("call_type") or "Unknown").strip()
    return f"{code} {crime}".strip() if code else crime


def build_unit_status_board() -> dict:
    units = get_live_units()
    available_units: list[dict] = []
    unavailable_units: list[dict] = []

    for unit in units:
        assignments = state.get_assigned_incidents_for_unit(unit.unit_id)
        active_incident = assignments[0] if assignments else None
        current_location = (
            active_incident["address"]
            if active_incident
            else f"{unit.coordinates.lat:.4f}, {unit.coordinates.lon:.4f}"
        )
        base = {
            "unit_id": unit.unit_id,
            "callsign": unit.callsign,
            "officer_name": unit.officer_name or "Unassigned",
            "role": unit.role,
            "shift": unit.shift,
            "beat": unit.beat,
            "dispatchable": unit.dispatchable,
            "dispatch_note": "Dispatchable patrol unit" if unit.dispatchable else "Non-dispatchable supervisor",
            "status_code": unit.status,
            "skills": unit.skills,
            "workload_score": unit.workload_score,
            "fatigue_score": unit.fatigue_score,
            "current_location": current_location,
        }

        if unit.status == "AVAILABLE":
            available_units.append(base)
            continue

        if active_incident:
            unavailable_units.append(
                {
                    **base,
                    "incident_id": active_incident["incident_id"],
                    "call_type": active_incident["call_type"],
                    "crime_label": active_incident.get("crime_label"),
                    "primary_code": active_incident.get("primary_code"),
                    "call_display": _incident_dispatch_label(active_incident),
                    "incident_status": active_incident["status"],
                    "predicted_eta_minutes": active_incident.get("predicted_eta_minutes"),
                    "last_action": _latest_unit_event(active_incident),
                    "disposition_code": (active_incident.get("disposition") or {}).get("disposition_code"),
                    "disposition_summary": (active_incident.get("disposition") or {}).get("summary"),
                    "dispatch_note": "Assigned to active call" if unit.dispatchable else "Non-dispatchable supervisor",
                }
            )
        else:
            unavailable_units.append(
                {
                    **base,
                    "incident_id": None,
                    "call_type": "No active CAD incident",
                    "crime_label": None,
                    "primary_code": None,
                    "call_display": "No active CAD incident",
                    "incident_status": unit.status,
                    "predicted_eta_minutes": None,
                    "last_action": "STATUS_ONLY",
                    "disposition_code": None,
                    "disposition_summary": None,
                    "dispatch_note": "Non-dispatchable supervisor" if not unit.dispatchable else "Unavailable (no active CAD incident)",
                }
            )

    available_units.sort(key=lambda row: row["callsign"])
    unavailable_units.sort(
        key=lambda row: (0 if row.get("incident_id") else 1, row["status_code"], row["callsign"])
    )

    return {
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "summary": {
            "available_count": len(available_units),
            "unavailable_count": len(unavailable_units),
            "active_assignments": len([row for row in unavailable_units if row.get("incident_id")]),
        },
        "available_units": available_units,
        "unavailable_units": unavailable_units,
    }
