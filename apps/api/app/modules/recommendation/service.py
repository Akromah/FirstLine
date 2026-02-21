from pydantic import BaseModel, Field

from app.modules.dispatch.service import AssignmentRequest, AssignmentResponse, choose_unit, rank_units


class RecommendationRequest(BaseModel):
    incident_id: str
    call_type: str
    priority: int
    incident_lat: float
    incident_lon: float
    required_skills: list[str] = Field(default_factory=list)


class RecommendationEnvelope(BaseModel):
    recommendation: AssignmentResponse
    fallback_unit_ids: list[str]


def recommend_unit(payload: RecommendationRequest) -> RecommendationEnvelope:
    base = choose_unit(
        AssignmentRequest(
            incident_id=payload.incident_id,
            required_skills=payload.required_skills,
            incident_lat=payload.incident_lat,
            incident_lon=payload.incident_lon,
        ),
        commit=False,
    )
    ranked = rank_units(
        AssignmentRequest(
            incident_id=payload.incident_id,
            required_skills=payload.required_skills,
            incident_lat=payload.incident_lat,
            incident_lon=payload.incident_lon,
        )
    )
    fallback = [row[1].unit_id for row in ranked if row[1].unit_id != base.recommended_unit_id][:3]
    return RecommendationEnvelope(recommendation=base, fallback_unit_ids=fallback)
