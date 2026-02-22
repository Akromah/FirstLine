from fastapi import APIRouter, HTTPException

from app.modules.reporting.service import (
    ReportCreateRequest,
    ReportDraftRequest,
    ReportTemplateApplyRequest,
    apply_report_template,
    build_rms_payload,
    get_report_draft,
    get_reporting_hub,
    get_report_templates,
    get_supervisor_review_queue,
    save_report_draft,
)

router = APIRouter()


@router.post("/rms")
def export_to_rms(payload: ReportCreateRequest) -> dict:
    return build_rms_payload(payload)


@router.get("/hub")
def reporting_hub() -> dict:
    return get_reporting_hub()


@router.get("/review-queue")
def supervisor_review_queue() -> dict:
    return get_supervisor_review_queue()


@router.post("/draft")
def create_or_update_draft(payload: ReportDraftRequest) -> dict:
    return save_report_draft(payload)


@router.get("/templates")
def list_report_templates(incident_id: str | None = None) -> dict:
    return get_report_templates(incident_id)


@router.post("/template/apply")
def apply_template(payload: ReportTemplateApplyRequest) -> dict:
    response = apply_report_template(payload)
    if not response:
        raise HTTPException(status_code=404, detail="Incident not found")
    return response


@router.get("/draft/{report_id}")
def fetch_draft(report_id: str) -> dict:
    draft = get_report_draft(report_id)
    if not draft:
        raise HTTPException(status_code=404, detail="Report draft not found")
    return draft
