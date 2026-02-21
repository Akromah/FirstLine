from fastapi import APIRouter, HTTPException

from app.modules.ai.service import IncidentAssistRequest, incident_assist

router = APIRouter()


@router.post("/incident")
def ai_incident_assist(payload: IncidentAssistRequest) -> dict:
    response = incident_assist(payload)
    if not response:
        raise HTTPException(status_code=404, detail="Incident not found")
    return response
