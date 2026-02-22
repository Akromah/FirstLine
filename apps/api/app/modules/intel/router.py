from fastapi import APIRouter, HTTPException, Query

from app.modules.intel.service import (
    build_incident_intel_packet,
    get_california_code,
    get_person_profile,
    get_policy_section,
    policy_catalog,
    lookup_public_safety_records,
    search_california_codes,
    search_policy_sections,
)

router = APIRouter()


@router.get("/lookup")
def lookup_records(query: str = Query(min_length=1)) -> dict:
    return lookup_public_safety_records(query)


@router.get("/profile/{person_id}")
def person_profile(person_id: str) -> dict:
    profile = get_person_profile(person_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Person not found")
    return profile


@router.get("/incident/{incident_id}")
def incident_intel_packet(incident_id: str) -> dict:
    packet = build_incident_intel_packet(incident_id)
    if not packet:
        raise HTTPException(status_code=404, detail="Incident not found")
    return packet


@router.get("/policy/search")
def search_policy(
    query: str = Query(default=""),
    sort_by: str = Query(default="relevance", pattern="^(relevance|title|section)$"),
    limit: int = Query(default=20, ge=1, le=100),
) -> dict:
    return search_policy_sections(query=query, sort_by=sort_by, limit=limit)


@router.get("/policy/catalog")
def get_policy_catalog() -> dict:
    return policy_catalog()


@router.get("/policy/{section_id}")
def policy_section_detail(section_id: str) -> dict:
    section = get_policy_section(section_id)
    if not section:
        raise HTTPException(status_code=404, detail="Policy section not found")
    return section


@router.get("/code/search")
def search_code_hub(
    query: str = Query(default=""),
    sort_by: str = Query(default="relevance", pattern="^(relevance|numeric|alpha)$"),
    limit: int = Query(default=20, ge=1, le=100),
) -> dict:
    return search_california_codes(query=query, sort_by=sort_by, limit=limit)


@router.get("/code/{code_key}")
def code_detail(code_key: str) -> dict:
    code = get_california_code(code_key)
    if not code:
        raise HTTPException(status_code=404, detail="Code not found")
    return code
