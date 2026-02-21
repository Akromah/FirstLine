from pydantic import BaseModel

from app.core.state import state


class IncidentAssistRequest(BaseModel):
    incident_id: str
    prompt: str | None = None


def incident_assist(payload: IncidentAssistRequest) -> dict | None:
    return state.generate_ai_assist(payload.incident_id, payload.prompt)
