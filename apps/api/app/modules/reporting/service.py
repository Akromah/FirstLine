from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field

from app.core.state import state


TEMPLATE_LIBRARY: list[dict[str, Any]] = [
    {
        "template_id": "DOMESTIC_RESPONSE",
        "label": "Domestic Response",
        "applies_to": ["domestic", "family"],
        "sections": ["Initial Contact", "Statements", "Evidence", "Disposition"],
        "default_fields": {"case_type": "Domestic", "victim_services_offered": "Yes"},
    },
    {
        "template_id": "MENTAL_HEALTH_WELFARE",
        "label": "Mental Health / Welfare Check",
        "applies_to": ["mental", "welfare", "suicidal", "hallucination"],
        "sections": ["Behavioral Indicators", "De-escalation Steps", "Medical Referral", "Disposition"],
        "default_fields": {"case_type": "WelfareCheck", "5150_screening": "Pending"},
    },
    {
        "template_id": "TRAFFIC_STOP",
        "label": "Traffic Stop",
        "applies_to": ["traffic", "dui", "vehicle"],
        "sections": ["Vehicle Stop Context", "Driver Contact", "Citation/Arrest", "Disposition"],
        "default_fields": {"case_type": "Traffic", "citation_review": "Pending"},
    },
    {
        "template_id": "WARRANT_SERVICE",
        "label": "Warrant Service",
        "applies_to": ["warrant", "wanted", "fugitive"],
        "sections": ["Service Location", "Subject Contact", "Safety Actions", "Booking Outcome"],
        "default_fields": {"case_type": "Warrant", "booking_status": "Pending"},
    },
    {
        "template_id": "GENERAL_INCIDENT",
        "label": "General Incident",
        "applies_to": [],
        "sections": ["Scene Arrival", "Investigation", "Officer Actions", "Final Disposition"],
        "default_fields": {"case_type": "General", "supervisor_review": "Pending"},
    },
]


class ReportCreateRequest(BaseModel):
    incident_id: str
    unit_id: str
    narrative: str
    field_updates: dict[str, str] = Field(default_factory=dict)
    template_id: str | None = None
    dictation_metadata: dict[str, Any] = Field(default_factory=dict)


class ReportDraftRequest(BaseModel):
    incident_id: str
    unit_id: str
    narrative: str
    structured_fields: dict[str, str] = Field(default_factory=dict)
    template_id: str | None = None
    dictation_metadata: dict[str, Any] = Field(default_factory=dict)
    status: str = "DRAFT"


class ReportTemplateApplyRequest(BaseModel):
    incident_id: str
    unit_id: str
    template_id: str
    include_timeline: bool = True


class ReportEvidenceRequest(BaseModel):
    incident_id: str
    unit_id: str
    evidence_type: str
    uri: str


class ReportReviewRequest(BaseModel):
    report_id: str
    reviewer_id: str
    decision: str
    notes: str | None = None


def _find_template(template_id: str) -> dict[str, Any]:
    normalized = template_id.strip().upper()
    for item in TEMPLATE_LIBRARY:
        if item["template_id"] == normalized:
            return item
    return next(item for item in TEMPLATE_LIBRARY if item["template_id"] == "GENERAL_INCIDENT")


def get_report_templates(incident_id: str | None = None) -> dict:
    incident = state.get_incident(incident_id) if incident_id else None
    call_type = (incident["call_type"] if incident else "").lower()

    templates: list[dict[str, Any]] = []
    for item in TEMPLATE_LIBRARY:
        applies_to = item["applies_to"]
        recommended = bool(call_type and applies_to and any(token in call_type for token in applies_to))
        templates.append(
            {
                "template_id": item["template_id"],
                "label": item["label"],
                "sections": item["sections"],
                "default_fields": item["default_fields"],
                "recommended": recommended,
            }
        )

    if incident and not any(item["recommended"] for item in templates):
        for item in templates:
            if item["template_id"] == "GENERAL_INCIDENT":
                item["recommended"] = True
                break

    return {
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "incident_id": incident_id,
        "incident_call_type": incident["call_type"] if incident else None,
        "templates": templates,
    }


def apply_report_template(payload: ReportTemplateApplyRequest) -> dict | None:
    incident = state.get_incident(payload.incident_id)
    if not incident:
        return None

    template = _find_template(payload.template_id)
    timeline_lines: list[str] = []
    if payload.include_timeline:
        for event in state.get_incident_timeline(payload.incident_id)[-4:]:
            time_value = event.get("time", "unknown")
            event_name = event.get("event", "event")
            action = f" ({event.get('action')})" if event.get("action") else ""
            timeline_lines.append(f"- {time_value}: {event_name}{action}")

    section_block = "\n".join(f"{index + 1}. {section}: " for index, section in enumerate(template["sections"]))
    timeline_block = "\n".join(timeline_lines) if timeline_lines else "- No timeline entries yet."

    narrative = (
        f"Incident {incident['incident_id']} ({incident['call_type']}) at {incident['address']}.\n"
        f"Assigned unit: {payload.unit_id}. Priority: {incident['priority']}.\n\n"
        "Recent CAD timeline:\n"
        f"{timeline_block}\n\n"
        f"{template['label']} narrative structure:\n"
        f"{section_block}"
    )

    structured_fields = {
        "template_id": template["template_id"],
        "incident_status": incident["status"],
        "incident_priority": str(incident["priority"]),
        **template["default_fields"],
    }

    return {
        "template_id": template["template_id"],
        "template_label": template["label"],
        "narrative": narrative,
        "structured_fields": structured_fields,
    }


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
        template_id=payload.template_id,
        report_meta={"dictation": payload.dictation_metadata},
        status="SUBMITTED",
    )

    warnings = [] if disposition else ["Disposition has not been finalized."]
    if len(payload.narrative.strip()) < 80:
        warnings.append("Narrative appears short and may need additional detail.")

    evidence_links = draft.get("evidence_links") or [
        {"type": "photo", "uri": f"evidence://incidents/{payload.incident_id}/photo-1"}
    ]

    return {
        "incident_id": payload.incident_id,
        "unit_id": payload.unit_id,
        "report_id": draft["report_id"],
        "submission_status": "READY_FOR_REVIEW" if disposition else "DRAFT_INCOMPLETE",
        "narrative_template": payload.template_id or "Auto-generated from CAD timeline",
        "narrative": payload.narrative,
        "structured_fields": payload.field_updates,
        "dictation_metadata": payload.dictation_metadata,
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
            "warnings": warnings,
        },
        "evidence_links": evidence_links,
    }


def save_report_draft(payload: ReportDraftRequest) -> dict:
    return state.upsert_report_draft(
        incident_id=payload.incident_id,
        unit_id=payload.unit_id,
        narrative=payload.narrative,
        structured_fields=payload.structured_fields,
        template_id=payload.template_id,
        report_meta={"dictation": payload.dictation_metadata},
        status=payload.status,
    )


def get_reporting_hub() -> dict:
    return state.build_reporting_hub()


def attach_report_evidence(payload: ReportEvidenceRequest) -> dict:
    draft = state.add_report_evidence(
        incident_id=payload.incident_id,
        unit_id=payload.unit_id,
        evidence_type=payload.evidence_type,
        uri=payload.uri,
    )
    return {
        "report_id": draft["report_id"],
        "incident_id": draft["incident_id"],
        "unit_id": draft["unit_id"],
        "evidence_links": draft.get("evidence_links", []),
        "updated_at": draft["updated_at"],
    }


def review_report(payload: ReportReviewRequest) -> dict | None:
    return state.review_report_draft(
        report_id=payload.report_id,
        reviewer_id=payload.reviewer_id,
        decision=payload.decision,
        notes=payload.notes,
    )


def get_supervisor_review_queue() -> dict:
    drafts = state.list_report_drafts()
    queue: list[dict] = []
    for draft in drafts:
        incident = state.get_incident(draft["incident_id"])
        disposition = incident.get("disposition") if incident else None
        reasons: list[str] = []
        review_status = draft.get("review_status", "PENDING")
        if review_status == "APPROVED":
            continue

        if disposition and disposition.get("requires_supervisor_review"):
            reasons.append("Disposition requires supervisor review.")
        if len((draft.get("narrative") or "").strip()) < 120:
            reasons.append("Narrative appears short.")
        if not draft.get("template_id"):
            reasons.append("Template not selected.")

        if reasons:
            queue.append(
                {
                    "report_id": draft["report_id"],
                    "incident_id": draft["incident_id"],
                    "unit_id": draft["unit_id"],
                    "status": draft["status"],
                    "review_status": review_status,
                    "updated_at": draft["updated_at"],
                    "review_notes": draft.get("review_notes"),
                    "reasons": reasons,
                }
            )

    return {
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "review_count": len(queue),
        "reports": queue,
    }


def get_reporting_metrics() -> dict:
    drafts = state.list_report_drafts()
    if not drafts:
        return {
            "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "total_reports": 0,
            "submitted_reports": 0,
            "ready_for_command": 0,
            "changes_requested": 0,
            "avg_narrative_length": 0,
            "evidence_attachment_rate": 0.0,
        }

    submitted = [draft for draft in drafts if draft.get("status") in {"SUBMITTED", "READY_FOR_COMMAND"}]
    ready_for_command = [draft for draft in drafts if draft.get("status") == "READY_FOR_COMMAND"]
    changes_requested = [draft for draft in drafts if draft.get("review_status") == "CHANGES_REQUESTED"]
    narrative_lengths = [len((draft.get("narrative") or "").strip()) for draft in drafts]
    with_evidence = [draft for draft in drafts if draft.get("evidence_links")]

    return {
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "total_reports": len(drafts),
        "submitted_reports": len(submitted),
        "ready_for_command": len(ready_for_command),
        "changes_requested": len(changes_requested),
        "avg_narrative_length": int(sum(narrative_lengths) / max(1, len(narrative_lengths))),
        "evidence_attachment_rate": round(len(with_evidence) / max(1, len(drafts)), 2),
    }


def get_report_draft(report_id: str) -> dict | None:
    return state.get_report_draft(report_id)
