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


class HandoffNoteRequest(BaseModel):
    incident_id: str
    unit_id: str
    note: str
    audience: str = "ALL"


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


def add_handoff_note(payload: HandoffNoteRequest) -> dict | None:
    note = state.add_handoff_note(
        incident_id=payload.incident_id,
        unit_id=payload.unit_id,
        note=payload.note,
        audience=payload.audience,
    )
    if not note:
        return None
    return {
        "ok": True,
        "note": note,
        "updated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }


def handoff_notes(incident_id: str, limit: int = 20) -> dict | None:
    notes = state.list_handoff_notes(incident_id=incident_id, limit=limit)
    if notes is None:
        return None
    return {
        "incident_id": incident_id,
        "note_count": len(notes),
        "notes": notes,
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


def _parse_iso(value: str | None) -> datetime:
    if not value:
        return datetime.now(timezone.utc)
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return datetime.now(timezone.utc)


def call_history(unit_id: str, limit: int = 40) -> dict:
    today_utc = datetime.now(timezone.utc).date()
    all_incidents = state.list_incident_summaries(include_closed=True)
    rows: list[dict] = []

    for summary in all_incidents:
        incident = state.get_incident(summary.incident_id)
        if not incident or incident.get("assigned_unit_id") != unit_id:
            continue

        created_at = _parse_iso(incident.get("created_at"))
        if created_at.date() != today_utc:
            continue

        drafts = [
            draft
            for draft in state.list_report_drafts(incident_id=incident["incident_id"])
            if draft.get("unit_id") == unit_id
        ]
        documents: list[dict] = []
        for draft in drafts:
            documents.append(
                {
                    "doc_type": "REPORT_DRAFT",
                    "report_id": draft.get("report_id"),
                    "status": draft.get("status"),
                    "review_status": draft.get("review_status"),
                    "updated_at": draft.get("updated_at"),
                    "uri": f"report://{draft.get('report_id')}",
                }
            )
            for evidence in draft.get("evidence_links", []):
                documents.append(
                    {
                        "doc_type": f"EVIDENCE_{str(evidence.get('type', 'FILE')).upper()}",
                        "report_id": draft.get("report_id"),
                        "status": "LINKED",
                        "review_status": None,
                        "updated_at": evidence.get("added_at"),
                        "uri": evidence.get("uri"),
                    }
                )

        call_display = f"{incident.get('primary_code') or ''} {incident.get('crime_label') or incident.get('call_type')}".strip()
        rows.append(
            {
                "incident_id": incident["incident_id"],
                "call_display": call_display,
                "call_type": incident.get("call_type"),
                "priority": incident.get("priority"),
                "address": incident.get("address"),
                "status": incident.get("status"),
                "created_at": incident.get("created_at"),
                "closed_at": (incident.get("disposition") or {}).get("closed_at"),
                "disposition_code": (incident.get("disposition") or {}).get("disposition_code"),
                "disposition_summary": (incident.get("disposition") or {}).get("summary"),
                "documents": documents,
                "document_count": len(documents),
            }
        )

    rows.sort(key=lambda item: item.get("created_at", ""), reverse=True)
    capped = rows[: max(1, min(limit, 200))]
    return {
        "unit_id": unit_id,
        "history_date_utc": str(today_utc),
        "call_count": len(capped),
        "calls": capped,
    }
