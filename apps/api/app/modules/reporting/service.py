from datetime import datetime, timezone

from pydantic import BaseModel, Field

from app.core.state import state


class ReportCreateRequest(BaseModel):
    incident_id: str
    unit_id: str
    narrative: str
    field_updates: dict[str, str] = Field(default_factory=dict)


class ReportDraftRequest(BaseModel):
    incident_id: str
    unit_id: str
    narrative: str
    structured_fields: dict[str, str] = Field(default_factory=dict)
    status: str = "DRAFT"


def build_rms_payload(payload: ReportCreateRequest) -> dict:
    incident = state.get_incident(payload.incident_id)
    disposition = incident.get("disposition") if incident else None
    audit_trail = state.get_incident_timeline(payload.incident_id)
    audit_trail.append(
        {
            "event": "report_submitted",
            "time": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        }
    )

    draft = state.upsert_report_draft(
        incident_id=payload.incident_id,
        unit_id=payload.unit_id,
        narrative=payload.narrative,
        structured_fields=payload.field_updates,
        status="SUBMITTED",
    )

    return {
        "incident_id": payload.incident_id,
        "unit_id": payload.unit_id,
        "report_id": draft["report_id"],
        "submission_status": "READY_FOR_REVIEW" if disposition else "DRAFT_INCOMPLETE",
        "narrative_template": "Auto-generated from CAD timeline",
        "narrative": payload.narrative,
        "structured_fields": payload.field_updates,
        "audit_trail": audit_trail,
        "incident_context": {
            "call_type": incident["call_type"] if incident else "Unknown",
            "priority": incident["priority"] if incident else None,
            "address": incident["address"] if incident else None,
            "disposition": disposition,
        },
        "validation": {
            "has_disposition": bool(disposition),
            "requires_supervisor_review": bool(disposition and disposition.get("requires_supervisor_review")),
            "warnings": [] if disposition else ["Disposition has not been finalized."],
        },
        "evidence_links": [
            {"type": "photo", "uri": f"evidence://incidents/{payload.incident_id}/photo-1"},
        ],
    }


def save_report_draft(payload: ReportDraftRequest) -> dict:
    return state.upsert_report_draft(
        incident_id=payload.incident_id,
        unit_id=payload.unit_id,
        narrative=payload.narrative,
        structured_fields=payload.structured_fields,
        status=payload.status,
    )


def get_reporting_hub() -> dict:
    return state.build_reporting_hub()


def get_report_draft(report_id: str) -> dict | None:
    return state.get_report_draft(report_id)
