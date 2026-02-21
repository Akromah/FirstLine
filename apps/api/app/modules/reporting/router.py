from fastapi import APIRouter, HTTPException

from app.modules.reporting.service import (
    ReportCreateRequest,
    ReportDraftRequest,
    build_rms_payload,
    get_report_draft,
    get_reporting_hub,
    save_report_draft,
)

router = APIRouter()


@router.post("/rms")
def export_to_rms(payload: ReportCreateRequest) -> dict:
    return build_rms_payload(payload)


@router.get("/hub")
def reporting_hub() -> dict:
    return get_reporting_hub()


@router.post("/draft")
def create_or_update_draft(payload: ReportDraftRequest) -> dict:
    return save_report_draft(payload)


@router.get("/draft/{report_id}")
def fetch_draft(report_id: str) -> dict:
    draft = get_report_draft(report_id)
    if not draft:
        raise HTTPException(status_code=404, detail="Report draft not found")
    return draft
