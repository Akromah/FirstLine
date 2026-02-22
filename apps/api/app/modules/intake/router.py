from fastapi import APIRouter, HTTPException

from app.modules.intake.service import (
    DemoScenarioRequest,
    IntakeRequest,
    IntakeResponse,
    MockSeedRequest,
    PatrolSimulationRequest,
    advance_patrol_simulation,
    generate_mock_data,
    get_incident_risk_profile,
    launch_demo_scenario,
    patrol_simulation_status,
    process_intake,
    start_patrol_simulation,
    stop_patrol_simulation,
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


@router.post("/mock-seed")
def seed_mock_dataset(payload: MockSeedRequest) -> dict:
    return generate_mock_data(payload)


@router.post("/patrol-sim/start")
def start_patrol_sim(payload: PatrolSimulationRequest) -> dict:
    result = start_patrol_simulation(payload)
    tick = advance_patrol_simulation()
    return {**result, "first_tick": tick}


@router.post("/patrol-sim/stop")
def stop_patrol_sim() -> dict:
    return stop_patrol_simulation()


@router.get("/patrol-sim/status")
def get_patrol_sim_status() -> dict:
    return patrol_simulation_status()
