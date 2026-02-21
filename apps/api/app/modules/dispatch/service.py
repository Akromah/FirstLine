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
    best_score, best_unit, match_count, distance_km = ranked[0]

    eta = max(2, int(round(distance_km / 0.75)))
    confidence = round(min(0.98, max(0.45, (best_score + 30) / 100)), 2)
    reasons = [
        f"Status: {best_unit.status}",
        f"Skill matches: {match_count}",
        f"Distance: {distance_km:.2f} km",
        f"Workload score: {best_unit.workload_score}",
        f"Fatigue score: {best_unit.fatigue_score}",
    ]

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
        )
    return DispositionResponse(
        incident_id=incident["incident_id"],
        status=incident["status"],
        disposition=incident["disposition"] or {},
    )
