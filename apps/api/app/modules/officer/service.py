from datetime import datetime, timezone

from pydantic import BaseModel

from app.core.state import state


class OfficerStatusUpdate(BaseModel):
    unit_id: str
    status: str


class OfficerAction(BaseModel):
    incident_id: str
    unit_id: str
    action: str


class SecureMessage(BaseModel):
    from_unit: str
    to_unit: str
    body: str


def active_calls_for_unit(unit_id: str) -> dict:
    assigned = state.get_assigned_incidents_for_unit(unit_id)
    return {
        "unit_id": unit_id,
        "assigned_incidents": [
            {
                "incident_id": incident["incident_id"],
                "call_type": incident["call_type"],
                "priority": incident["priority"],
                "address": incident["address"],
                "status": incident["status"],
                "history_at_address": [
                    "Noise complaint (2 days ago)",
                    "Domestic disturbance (last month)",
                ],
            }
            for incident in assigned
        ],
    }


def update_status(payload: OfficerStatusUpdate) -> dict:
    updated = state.update_unit_status(payload.unit_id, payload.status)
    return {
        "ok": updated,
        "unit_id": payload.unit_id,
        "new_status": payload.status,
        "updated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }


def submit_action(payload: OfficerAction) -> dict:
    updated = state.record_officer_action(payload.incident_id, payload.unit_id, payload.action)
    return {
        "ok": updated,
        "incident_id": payload.incident_id,
        "unit_id": payload.unit_id,
        "action": payload.action,
        "updated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }


def post_message(payload: SecureMessage) -> dict:
    message = state.add_message(payload.from_unit, payload.to_unit, payload.body)
    return {
        "ok": True,
        "delivered": True,
        "message_id": message["message_id"],
        "sent_at": message["sent_at"],
    }
