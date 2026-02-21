from fastapi import APIRouter

from app.modules.recommendation.service import RecommendationEnvelope, RecommendationRequest, recommend_unit

router = APIRouter()


@router.post("/unit", response_model=RecommendationEnvelope)
def get_unit_recommendation(payload: RecommendationRequest) -> RecommendationEnvelope:
    return recommend_unit(payload)
