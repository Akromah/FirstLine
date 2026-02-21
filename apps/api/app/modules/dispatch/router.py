from fastapi import APIRouter
from fastapi import HTTPException

from app.core.state import state
from app.modules.dispatch.service import (
    AssignmentRequest,
    AssignmentResponse,
    DispositionRequest,
    DispositionResponse,
    choose_unit,
    finalize_disposition,
)
from app.modules.mapping.service import get_live_units

router = APIRouter()


@router.get("/units")
def list_units() -> dict:
    return {"units": [u.model_dump() for u in get_live_units()]}


@router.get("/queue")
def list_dispatch_queue() -> dict:
    incidents = state.list_incident_summaries()
    return {"incidents": [incident.model_dump() for incident in incidents]}


@router.get("/incident/{incident_id}")
def get_incident_detail(incident_id: str) -> dict:
    detail = state.get_incident_detail(incident_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Incident not found")
    return detail


@router.post("/assign", response_model=AssignmentResponse)
def assign_incident(payload: AssignmentRequest) -> AssignmentResponse:
    return choose_unit(payload)


@router.post("/disposition", response_model=DispositionResponse)
def finalize_call_disposition(payload: DispositionRequest) -> DispositionResponse:
    return finalize_disposition(payload)
