from fastapi import APIRouter, HTTPException

from app.modules.intake.service import (
    DemoScenarioRequest,
    IntakeRequest,
    IntakeResponse,
    get_incident_risk_profile,
    launch_demo_scenario,
    process_intake,
)

router = APIRouter()


@router.post("/calls", response_model=IntakeResponse)
def create_call(payload: IntakeRequest) -> IntakeResponse:
    return process_intake(payload)


@router.get("/risk/{incident_id}")
def get_risk_profile(incident_id: str) -> dict:
    profile = get_incident_risk_profile(incident_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Incident not found")
    return profile


@router.post("/demo")
def run_demo_scenario(payload: DemoScenarioRequest) -> dict:
    return launch_demo_scenario(payload)
