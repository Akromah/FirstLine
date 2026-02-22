from datetime import datetime, timezone
import re
from typing import Any

from pydantic import BaseModel, Field

from app.core.state import state
from app.modules.intel.reference_data import CALIFORNIA_CODE_INDEX


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


class ReportAuditRequest(BaseModel):
    incident_id: str
    unit_id: str | None = None
    narrative: str
    structured_fields: dict[str, str] = Field(default_factory=dict)


def _find_template(template_id: str) -> dict[str, Any]:
    normalized = template_id.strip().upper()
    for item in TEMPLATE_LIBRARY:
        if item["template_id"] == normalized:
            return item
    return next(item for item in TEMPLATE_LIBRARY if item["template_id"] == "GENERAL_INCIDENT")


def _normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value.lower()).strip()


def _contains_any(text: str, phrases: list[str]) -> bool:
    return any(phrase in text for phrase in phrases)


def _normalize_code_key(primary_code: str | None) -> str:
    if not primary_code:
        return ""
    return primary_code.strip().upper().replace(" ", "-")


def _lookup_code_entry(primary_code: str | None) -> dict | None:
    normalized = _normalize_code_key(primary_code)
    if not normalized:
        return None
    for entry in CALIFORNIA_CODE_INDEX:
        if entry.get("code_key", "").upper() == normalized:
            return entry
    return None


def _build_recommendation(
    recommendation_id: str,
    severity: str,
    category: str,
    title: str,
    detail: str,
    suggested_text: str,
    legal_reference: str | None = None,
) -> dict:
    return {
        "recommendation_id": recommendation_id,
        "severity": severity,
        "category": category,
        "title": title,
        "detail": detail,
        "suggested_text": suggested_text,
        "legal_reference": legal_reference,
    }


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


def get_incident_reporting_readiness(incident_id: str, unit_id: str | None = None) -> dict | None:
    incident = state.get_incident(incident_id)
    if not incident:
        return None

    drafts = state.list_report_drafts(incident_id)
    draft = None
    if unit_id:
        draft = next((item for item in drafts if item["unit_id"] == unit_id), None)
    if not draft and drafts:
        draft = drafts[0]

    disposition = incident.get("disposition") or {}
    has_disposition = bool(incident.get("disposition"))
    has_draft = bool(draft)
    has_template = bool(draft and draft.get("template_id"))
    narrative_min_chars = 120
    narrative_length = len((draft.get("narrative") or "").strip()) if draft else 0
    has_narrative = narrative_length >= narrative_min_chars
    evidence_count = len(draft.get("evidence_links") or []) if draft else 0
    has_evidence = evidence_count >= 1
    review_required = bool(has_disposition and disposition.get("requires_supervisor_review"))
    review_status = (draft.get("review_status") if draft else None) or "PENDING"
    review_complete = not review_required or review_status == "APPROVED"

    blockers: list[str] = []
    if not has_disposition:
        blockers.append("Finalize call disposition.")
    if not has_draft:
        blockers.append("Create or save a report draft.")
    if has_draft and not has_template:
        blockers.append("Apply a report template.")
    if has_draft and not has_narrative:
        blockers.append(f"Expand narrative to at least {narrative_min_chars} characters.")
    if has_draft and not has_evidence:
        blockers.append("Attach at least one evidence link.")
    if review_required and not review_complete:
        blockers.append("Supervisor approval is required before final submission.")

    return {
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "incident_id": incident_id,
        "unit_id": unit_id,
        "incident_status": incident["status"],
        "report_id": draft.get("report_id") if draft else None,
        "has_disposition": has_disposition,
        "has_draft": has_draft,
        "has_template": has_template,
        "narrative_length": narrative_length,
        "narrative_min_chars": narrative_min_chars,
        "has_narrative": has_narrative,
        "evidence_count": evidence_count,
        "review_required": review_required,
        "review_status": review_status,
        "review_complete": review_complete,
        "blockers": blockers,
        "ready_for_submission": len(blockers) == 0,
    }


def generate_report_audit(payload: ReportAuditRequest) -> dict | None:
    incident = state.get_incident(payload.incident_id)
    if not incident:
        return None

    narrative = _normalize_text(payload.narrative)
    call_text = _normalize_text(incident.get("call_text") or "")
    call_type = _normalize_text(incident.get("call_type") or "")
    code = incident.get("primary_code")
    code_entry = _lookup_code_entry(code)
    crime_label = incident.get("crime_label") or incident.get("call_type") or "Incident"

    recommendations: list[dict] = []
    seen_ids: set[str] = set()

    def add_recommendation(entry: dict) -> None:
        rec_id = entry["recommendation_id"]
        if rec_id in seen_ids:
            return
        seen_ids.add(rec_id)
        recommendations.append(entry)

    if not _contains_any(narrative, ["upon arrival", "on scene", "arrived", "scene was", "initially observed"]):
        add_recommendation(
            _build_recommendation(
                recommendation_id="scene-arrival",
                severity="REQUIRED",
                category="Scene Narrative",
                title="Describe scene on arrival",
                detail="Report should document what officers observed immediately on arrival.",
                suggested_text="Upon arrival, officers observed the scene condition, involved parties, and immediate safety risks.",
            )
        )

    if call_text and not _contains_any(narrative, ["caller reported", "dispatch advised", "cad notes", "reported that"]):
        add_recommendation(
            _build_recommendation(
                recommendation_id="call-facts",
                severity="RECOMMENDED",
                category="Call Intake Facts",
                title="Reference key dispatch details",
                detail="Include relevant facts from intake/caller statements so the report aligns with CAD.",
                suggested_text=f"Dispatch advised: {incident.get('call_text')}",
            )
        )

    domestic_call = ("domestic" in call_type) or (str(code or "").upper().startswith("PC 273.5"))
    if domestic_call:
        if not _contains_any(narrative, ["separat", "separate", "kept apart", "independent statements"]):
            add_recommendation(
                _build_recommendation(
                    recommendation_id="dv-separation",
                    severity="REQUIRED",
                    category="Domestic Violence Protocol",
                    title="Document party separation",
                    detail="DV reports should document that parties were separated for independent statements and safety.",
                    suggested_text="Officers separated all involved parties to prevent further escalation and obtain independent statements.",
                    legal_reference="Policy 3.120",
                )
            )
        if not _contains_any(narrative, ["marcy", "victim rights card", "victim rights information", "marsy's"]):
            add_recommendation(
                _build_recommendation(
                    recommendation_id="dv-marcy-card",
                    severity="REQUIRED",
                    category="Domestic Violence Protocol",
                    title="Document Marcy's Card / victim rights advisement",
                    detail="DV reports should record victim-rights advisement and card issuance.",
                    suggested_text="Victim was provided Marcy's Card and advised of victim rights and available advocacy resources.",
                    legal_reference="Policy 3.120",
                )
            )

    if str(code or "").upper().startswith("PC 211") or "robbery" in call_type:
        if not _contains_any(narrative, ["force", "fear", "threat", "intimidat", "weapon"]):
            add_recommendation(
                _build_recommendation(
                    recommendation_id="robbery-force-fear",
                    severity="REQUIRED",
                    category="Crime Elements",
                    title="Articulate force or fear",
                    detail="Robbery requires force or fear; report should clearly articulate how force/fear was applied.",
                    suggested_text="Suspect used force/fear by threatening the victim, causing the victim to relinquish property.",
                    legal_reference="PC 211",
                )
            )

    if code_entry and code_entry.get("elements"):
        legal_reference = f"{code_entry['code_family']} {code_entry['section']}"
        for idx, element in enumerate(code_entry["elements"]):
            keywords = [token.lower() for token in element.get("keywords", [])]
            if keywords and _contains_any(narrative, keywords):
                continue
            add_recommendation(
                _build_recommendation(
                    recommendation_id=f"statute-{legal_reference.replace(' ', '-').lower()}-{idx}",
                    severity="REQUIRED",
                    category="Statutory Elements",
                    title=f"Address element: {element.get('label', 'Required element')}",
                    detail=f"Include facts supporting this element for {legal_reference} ({code_entry['title']}).",
                    suggested_text=f"Element addressed: {element.get('label', 'Required statutory element')} based on officer observations and statements.",
                    legal_reference=legal_reference,
                )
            )

    call_fact_markers = {
        "weapon": ["weapon", "gun", "knife", "firearm"],
        "injury": ["injury", "bleeding", "pain", "bruise", "swelling"],
        "children": ["child", "juvenile", "minor"],
    }
    for marker, terms in call_fact_markers.items():
        if _contains_any(call_text, terms) and not _contains_any(narrative, terms):
            add_recommendation(
                _build_recommendation(
                    recommendation_id=f"call-marker-{marker}",
                    severity="RECOMMENDED",
                    category="Call Intake Facts",
                    title=f"Reference reported {marker}",
                    detail=f"Caller reported {marker}-related details; include findings or disposition of that detail.",
                    suggested_text=f"Officers investigated reported {marker} details and documented findings.",
                )
            )

    recommendations.sort(key=lambda item: (0 if item["severity"] == "REQUIRED" else 1, item["category"], item["title"]))
    required_count = len([item for item in recommendations if item["severity"] == "REQUIRED"])

    return {
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "incident_id": payload.incident_id,
        "unit_id": payload.unit_id,
        "crime_label": crime_label,
        "primary_code": code,
        "recommendation_count": len(recommendations),
        "required_count": required_count,
        "all_clear": len(recommendations) == 0,
        "recommendations": recommendations,
    }
