from fastapi import APIRouter, HTTPException

from app.modules.officer.service import (
    HandoffNoteRequest,
    OfficerAction,
    OfficerStatusUpdate,
    SecureMessage,
    add_handoff_note,
    active_calls_for_unit,
    handoff_notes,
    incident_channel,
    message_inbox,
    post_message,
    quick_actions,
    submit_action,
    update_status,
)

router = APIRouter()


@router.get("/feed/{unit_id}")
def get_officer_feed(unit_id: str) -> dict:
    return active_calls_for_unit(unit_id)


@router.post("/status")
def set_officer_status(payload: OfficerStatusUpdate) -> dict:
    return update_status(payload)


@router.post("/action")
def officer_action(payload: OfficerAction) -> dict:
    return submit_action(payload)


@router.post("/message")
def secure_message(payload: SecureMessage) -> dict:
    return post_message(payload)


@router.get("/messages/{unit_id}")
def officer_message_inbox(unit_id: str, limit: int = 40) -> dict:
    return message_inbox(unit_id, limit=limit)


@router.get("/channel/{incident_id}")
def incident_message_channel(incident_id: str, limit: int = 60) -> dict:
    return incident_channel(incident_id, limit=limit)


@router.get("/quick-actions/{incident_id}")
def officer_quick_actions(incident_id: str, unit_id: str | None = None) -> dict:
    response = quick_actions(incident_id, unit_id=unit_id)
    if not response:
        raise HTTPException(status_code=404, detail="Incident not found")
    return response


@router.post("/handoff")
def post_handoff_note(payload: HandoffNoteRequest) -> dict:
    response = add_handoff_note(payload)
    if not response:
        raise HTTPException(status_code=400, detail="Unable to save handoff note")
    return response


@router.get("/handoff/{incident_id}")
def list_handoff_notes(incident_id: str, limit: int = 20) -> dict:
    response = handoff_notes(incident_id, limit=limit)
    if not response:
        raise HTTPException(status_code=404, detail="Incident not found")
    return response
