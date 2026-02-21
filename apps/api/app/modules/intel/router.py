from fastapi import APIRouter, HTTPException, Query

from app.modules.intel.service import get_person_profile, lookup_public_safety_records

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
