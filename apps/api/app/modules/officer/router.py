from fastapi import APIRouter

from app.modules.officer.service import (
    OfficerAction,
    OfficerStatusUpdate,
    SecureMessage,
    active_calls_for_unit,
    post_message,
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
