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
    incident_id: str | None = None
    priority: str = "NORMAL"


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
    normalized_action = payload.action.strip().upper()
    incident = state.get_incident(payload.incident_id)
    if normalized_action in {"CLEAR", "CLEARED"} and incident and not incident.get("disposition"):
        return {
            "ok": False,
            "incident_id": payload.incident_id,
            "unit_id": payload.unit_id,
            "action": payload.action,
            "error": "Finalize disposition before clearing this incident.",
            "updated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        }

    updated = state.record_officer_action(payload.incident_id, payload.unit_id, payload.action)
    return {
        "ok": updated,
        "incident_id": payload.incident_id,
        "unit_id": payload.unit_id,
        "action": payload.action,
        "updated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }


def post_message(payload: SecureMessage) -> dict:
    message = state.add_message(
        payload.from_unit,
        payload.to_unit,
        payload.body,
        incident_id=payload.incident_id,
        priority=payload.priority,
    )
    return {
        "ok": True,
        "delivered": True,
        "message_id": message["message_id"],
        "incident_id": message.get("incident_id"),
        "sent_at": message["sent_at"],
    }


def message_inbox(unit_id: str, limit: int = 40) -> dict:
    messages = state.list_messages_for_unit(unit_id, limit=limit)
    unread = [
        item
        for item in messages
        if item["to_unit"] == unit_id and item["from_unit"] != unit_id
    ]
    return {
        "unit_id": unit_id,
        "message_count": len(messages),
        "unread_estimate": len(unread),
        "messages": messages,
    }


def incident_channel(incident_id: str, limit: int = 40) -> dict:
    messages = state.list_messages_for_incident(incident_id, limit=limit)
    return {
        "incident_id": incident_id,
        "message_count": len(messages),
        "messages": messages,
    }


def quick_actions(incident_id: str, unit_id: str | None = None) -> dict | None:
    incident = state.get_incident(incident_id)
    if not incident:
        return None

    status = incident.get("status", "NEW")
    has_disposition = bool(incident.get("disposition"))
    assigned_unit_id = incident.get("assigned_unit_id")

    actions = [
        {"action": "ACCEPT", "label": "Accept", "enabled": False, "reason": "Already accepted."},
        {"action": "EN_ROUTE", "label": "En Route", "enabled": False, "reason": "Not available in current status."},
        {"action": "ON_SCENE", "label": "On Scene", "enabled": False, "reason": "Not available in current status."},
        {"action": "CLEAR", "label": "Clear", "enabled": False, "reason": "Not available in current status."},
    ]

    if status in {"NEW", "DISPATCHED"}:
        actions[0]["enabled"] = True
        actions[0]["reason"] = "Available"
        actions[1]["enabled"] = True
        actions[1]["reason"] = "Available"
    if status == "EN_ROUTE":
        actions[2]["enabled"] = True
        actions[2]["reason"] = "Available"
    if status in {"ON_SCENE", "TRANSPORT"}:
        actions[3]["enabled"] = has_disposition
        actions[3]["reason"] = "Available" if has_disposition else "Finalize disposition first."
    if status == "CLOSED":
        for item in actions:
            item["enabled"] = False
            item["reason"] = "Incident already closed."

    if unit_id and assigned_unit_id and unit_id != assigned_unit_id:
        for item in actions:
            item["enabled"] = False
            item["reason"] = f"Assigned to {assigned_unit_id}."

    return {
        "incident_id": incident_id,
        "unit_id": unit_id,
        "incident_status": status,
        "assigned_unit_id": assigned_unit_id,
        "has_disposition": has_disposition,
        "actions": actions,
        "updated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }
