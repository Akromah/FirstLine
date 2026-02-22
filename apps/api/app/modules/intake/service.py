from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field

from app.core.state import state


class IntakeRequest(BaseModel):
    caller_name: str = "Unknown"
    phone: str | None = None
    call_text: str
    address: str | None = None
    lat: float | None = None
    lon: float | None = None


class IntakeResponse(BaseModel):
    call_id: str
    normalized_address: str
    geolocation: dict[str, float]
    duplicate_call_ids: list[str] = Field(default_factory=list)
    suggested_call_type: Literal["Traffic", "Medical", "Domestic", "Burglary", "Unknown"]
    auto_priority_score: int
    rationale: list[str] = Field(default_factory=list)
    transcript_live_enabled: bool = True
    created_at: str


class DemoScenarioRequest(BaseModel):
    scenario: str = "SHIFT_START"


def score_priority(call_text: str, address: str | None) -> tuple[int, list[str]]:
    text = call_text.lower()
    score = 30
    reasons: list[str] = []

    keyword_weights = {
        "gun": 30,
        "shots": 30,
        "weapon": 25,
        "bleeding": 22,
        "unconscious": 20,
        "overdose": 18,
        "domestic": 16,
        "fight": 14,
        "assault": 18,
        "knife": 22,
        "hostage": 40,
        "child": 10,
        "school": 12,
        "officer down": 50,
    }
    for keyword, weight in keyword_weights.items():
        if keyword in text:
            score += weight
            reasons.append(f"Keyword match: {keyword}")

    if address and any(marker in address.lower() for marker in ["school", "hospital", "courthouse"]):
        score += 8
        reasons.append("High-sensitivity geofence")

    if any(marker in text for marker in ["not breathing", "gunshots", "active shooter"]):
        score += 20
        reasons.append("Immediate life-safety phrasing")

    return min(score, 100), reasons


def suggest_call_type(call_text: str) -> str:
    text = call_text.lower()
    if any(k in text for k in ["car crash", "traffic", "hit and run", "accident"]):
        return "Traffic"
    if any(k in text for k in ["chest pain", "medical", "unconscious", "overdose"]):
        return "Medical"
    if any(k in text for k in ["domestic", "arguing", "husband", "wife"]):
        return "Domestic"
    if any(k in text for k in ["break in", "burglary", "intruder", "window"]):
        return "Burglary"
    return "Unknown"


def infer_required_skills(call_type: str, call_text: str) -> list[str]:
    text = call_text.lower()
    skills: list[str] = []
    if call_type in {"Medical"}:
        skills.append("Medical")
    if call_type in {"Domestic"}:
        skills.append("Crisis")
    if any(k in text for k in ["spanish", "translation", "habla"]):
        skills.append("Spanish")
    if any(k in text for k in ["k9", "canine", "track"]):
        skills.append("K9")
    if any(k in text for k in ["rifle", "active shooter", "hostage", "swat"]):
        skills.append("SWAT")
    return sorted(set(skills))


def process_intake(payload: IntakeRequest) -> IntakeResponse:
    priority, reasons = score_priority(payload.call_text, payload.address)
    call_type = suggest_call_type(payload.call_text)
    normalized_address = payload.address or "Address lookup pending"
    duplicate_ids = state.find_duplicate_incidents(normalized_address)
    required_skills = infer_required_skills(call_type, payload.call_text)

    incident = state.create_incident(
        caller_name=payload.caller_name,
        phone=payload.phone,
        call_text=payload.call_text,
        address=normalized_address,
        coordinates={"lat": payload.lat or 34.0556, "lon": payload.lon or -117.1825},
        call_type=call_type,
        priority=priority,
        duplicate_call_ids=duplicate_ids,
        rationale=reasons,
        required_skills=required_skills,
    )

    return IntakeResponse(
        call_id=incident["incident_id"],
        normalized_address=incident["address"],
        geolocation=incident["coordinates"],
        duplicate_call_ids=duplicate_ids,
        suggested_call_type=call_type,
        auto_priority_score=priority,
        rationale=reasons,
        created_at=incident["created_at"] or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    )


def get_incident_risk_profile(incident_id: str) -> dict | None:
    return state.build_risk_profile(incident_id)


def launch_demo_scenario(payload: DemoScenarioRequest) -> dict:
    scenario = payload.scenario.strip().upper()
    templates: list[dict] = []

    if scenario == "HIGH_RISK_NIGHT":
        templates = [
            {
                "caller_name": "Store Clerk",
                "phone": "555-0101",
                "call_text": "Armed suspect with handgun fleeing convenience store after robbery.",
                "address": "120 Brookside Ave, Redlands",
                "lat": 34.0471,
                "lon": -117.1828,
            },
            {
                "caller_name": "Resident",
                "phone": "555-0102",
                "call_text": "Domestic fight escalating, child heard screaming, possible knife.",
                "address": "35 Cajon St, Redlands",
                "lat": 34.0556,
                "lon": -117.1825,
            },
            {
                "caller_name": "Campus Security",
                "phone": "555-0103",
                "call_text": "Possible overdose, not breathing outside university library.",
                "address": "550 University St, Redlands",
                "lat": 34.0643,
                "lon": -117.1634,
            },
        ]
    else:
        templates = [
            {
                "caller_name": "Transit Control",
                "phone": "555-0201",
                "call_text": "Minor traffic collision blocking lane, no injuries reported.",
                "address": "700 Orange St, Redlands",
                "lat": 34.0532,
                "lon": -117.1762,
            },
            {
                "caller_name": "Neighbor",
                "phone": "555-0202",
                "call_text": "Loud argument between partners, requesting Spanish-speaking officer.",
                "address": "910 Olive Ave, Redlands",
                "lat": 34.0503,
                "lon": -117.1716,
            },
            {
                "caller_name": "Teacher",
                "phone": "555-0203",
                "call_text": "Suspicious person near school entrance taking photos of students.",
                "address": "405 Schoolhouse Rd, Redlands",
                "lat": 34.0589,
                "lon": -117.1667,
            },
        ]

    created: list[dict] = []
    for item in templates:
        response = process_intake(IntakeRequest(**item))
        created.append(
            {
                "incident_id": response.call_id,
                "call_type": response.suggested_call_type,
                "priority": response.auto_priority_score,
                "address": response.normalized_address,
            }
        )

    return {
        "scenario": scenario,
        "created_count": len(created),
        "incidents": created,
    }
