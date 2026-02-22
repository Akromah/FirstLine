from fastapi import APIRouter, HTTPException

from app.modules.ai.service import (
    IncidentAssistRequest,
    ReportAssistRequest,
    incident_assist,
    report_assist,
)

router = APIRouter()


@router.post("/incident")
def ai_incident_assist(payload: IncidentAssistRequest) -> dict:
    response = incident_assist(payload)
    if not response:
        raise HTTPException(status_code=404, detail="Incident not found")
    return response


@router.post("/report")
def ai_report_assist(payload: ReportAssistRequest) -> dict:
    response = report_assist(payload)
    if not response:
        raise HTTPException(status_code=404, detail="Incident not found")
    return response
