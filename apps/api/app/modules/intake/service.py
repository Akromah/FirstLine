from datetime import datetime, timezone
from math import cos, sin
from random import Random
from typing import Literal

from pydantic import BaseModel, Field

from app.core.state import parse_utc, state
from app.modules.dispatch.service import AssignmentRequest, choose_unit
from app.modules.intel.service import infer_primary_california_code
from app.schemas.common import UnitSummary


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


class MockSeedRequest(BaseModel):
    units_count: int = Field(default=14, ge=4, le=40)
    incidents_count: int = Field(default=18, ge=4, le=120)
    clear_existing: bool = False
    auto_assign: bool = True


class PatrolSimulationRequest(BaseModel):
    clear_existing: bool = True
    tick_seconds: int = Field(default=12, ge=5, le=60)
    initial_calls: int = Field(default=4, ge=1, le=20)


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
    code_guess = infer_primary_california_code(payload.call_text, call_type)
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
        crime_label=(code_guess or {}).get("title"),
        primary_code=(f"{(code_guess or {}).get('code_family')} {(code_guess or {}).get('section')}" if code_guess else None),
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


MOCK_OFFICERS = [
    "Ofc. Maya Brooks",
    "Ofc. Julian Ortega",
    "Ofc. Connor Hale",
    "Ofc. Naomi Price",
    "Ofc. Isaiah Cole",
    "Ofc. Hannah Park",
    "Ofc. Victor Simmons",
    "Ofc. Leah Romero",
    "Ofc. Nolan Briggs",
    "Ofc. Amber Flores",
    "Ofc. Ryan Torres",
    "Ofc. Kendra Vasquez",
    "Ofc. Devin Alvarez",
    "Ofc. Sofia Bennett",
    "Ofc. Carter Knox",
    "Ofc. Talia Everett",
]

MOCK_SKILL_SETS = [
    ["Spanish", "Crisis"],
    ["K9"],
    ["SWAT", "Crisis"],
    ["Medical"],
    ["Traffic"],
    ["Spanish"],
    ["Crisis", "Medical"],
    ["K9", "Traffic"],
]

MOCK_CALL_LIBRARY = [
    {
        "caller_name": "Transit Dispatch",
        "phone": "555-3011",
        "call_text": "Two-vehicle traffic crash, debris in lane, one driver refusing to exchange info.",
        "address": "801 Orange St, Redlands",
        "lat": 34.0527,
        "lon": -117.1761,
    },
    {
        "caller_name": "Apartment Manager",
        "phone": "555-3012",
        "call_text": "Domestic disturbance escalating, neighbors report screaming and property damage.",
        "address": "223 Citrus Ave, Redlands",
        "lat": 34.0554,
        "lon": -117.1818,
    },
    {
        "caller_name": "Store Clerk",
        "phone": "555-3013",
        "call_text": "Shoplifting suspect fled on foot, staff requesting K9 track support.",
        "address": "110 Brookside Ave, Redlands",
        "lat": 34.0475,
        "lon": -117.1822,
    },
    {
        "caller_name": "Security Guard",
        "phone": "555-3014",
        "call_text": "Suspicious subject photographing school entrance and parked student vehicles.",
        "address": "402 Schoolhouse Rd, Redlands",
        "lat": 34.0592,
        "lon": -117.1669,
    },
    {
        "caller_name": "Neighbor",
        "phone": "555-3015",
        "call_text": "Possible overdose in alley, male not breathing, medics requested.",
        "address": "75 Cajon St, Redlands",
        "lat": 34.0559,
        "lon": -117.1821,
    },
    {
        "caller_name": "Caller",
        "phone": "555-3016",
        "call_text": "Road rage incident, one party threatening with possible handgun in vehicle.",
        "address": "150 Pearl Ave, Redlands",
        "lat": 34.0487,
        "lon": -117.1712,
    },
]


def _mock_callsign(index: int) -> str:
    sector = (index % 8) + 1
    letters = ["A", "B", "C", "L", "R", "S", "T", "V"]
    suffix = letters[index % len(letters)]
    return f"{sector}{suffix}{(20 + index):02d}"


def generate_mock_data(payload: MockSeedRequest) -> dict:
    rng = Random(42)
    if payload.clear_existing:
        state.clear_operational_state(clear_units=True)

    created_units: list[dict] = []
    created_incidents: list[dict] = []
    assigned_count = 0

    status_cycle = ["AVAILABLE", "AVAILABLE", "EN_ROUTE", "ON_SCENE", "BUSY", "AVAILABLE"]
    for idx in range(payload.units_count):
        unit = UnitSummary(
            unit_id=f"u-{700 + idx}",
            callsign=_mock_callsign(idx),
            officer_name=MOCK_OFFICERS[idx % len(MOCK_OFFICERS)],
            status=status_cycle[idx % len(status_cycle)],
            coordinates={
                "lat": 34.045 + (idx % 6) * 0.003 + (rng.random() * 0.001),
                "lon": -117.196 + (idx % 5) * 0.004 + (rng.random() * 0.001),
            },
            skills=MOCK_SKILL_SETS[idx % len(MOCK_SKILL_SETS)],
            workload_score=22 + (idx * 7) % 58,
            fatigue_score=18 + (idx * 9) % 62,
        )
        persisted = state.upsert_unit(unit)
        created_units.append(
            {
                "unit_id": persisted.unit_id,
                "callsign": persisted.callsign,
                "officer_name": persisted.officer_name,
                "status": persisted.status,
            }
        )

    for idx in range(payload.incidents_count):
        template = MOCK_CALL_LIBRARY[idx % len(MOCK_CALL_LIBRARY)]
        lat_offset = ((idx % 5) - 2) * 0.0011
        lon_offset = (((idx * 2) % 5) - 2) * 0.0012
        intake = process_intake(
            IntakeRequest(
                caller_name=template["caller_name"],
                phone=template["phone"],
                call_text=template["call_text"],
                address=template["address"],
                lat=template["lat"] + lat_offset,
                lon=template["lon"] + lon_offset,
            )
        )
        created_incidents.append(
            {
                "incident_id": intake.call_id,
                "call_type": intake.suggested_call_type,
                "priority": intake.auto_priority_score,
                "address": intake.normalized_address,
            }
        )

        if payload.auto_assign and idx % 2 == 0:
            incident = state.get_incident(intake.call_id)
            if incident:
                assignment = choose_unit(
                    AssignmentRequest(
                        incident_id=intake.call_id,
                        required_skills=incident.get("required_skills", []),
                        incident_lat=float(incident["coordinates"]["lat"]),
                        incident_lon=float(incident["coordinates"]["lon"]),
                    ),
                    commit=True,
                )
                assigned_count += 1
                if idx % 3 == 0:
                    state.record_officer_action(intake.call_id, assignment.recommended_unit_id, "ARRIVED")
                elif idx % 5 == 0:
                    state.record_officer_action(intake.call_id, assignment.recommended_unit_id, "EN_ROUTE")

    return {
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "units_created": len(created_units),
        "incidents_created": len(created_incidents),
        "assigned_incidents": assigned_count,
        "sample_units": created_units[:8],
        "sample_incidents": created_incidents[:10],
    }


BEAT_OVERLAYS = [
    {
        "beat_id": 1,
        "label": "Beat 1",
        "shift_coverage": ["DAY", "SWING"],
        "center": {"lat": 34.0612, "lon": -117.1942},
        "coordinates": [
            {"lat": 34.0668, "lon": -117.2005},
            {"lat": 34.0668, "lon": -117.1881},
            {"lat": 34.0553, "lon": -117.1881},
            {"lat": 34.0553, "lon": -117.2005},
        ],
    },
    {
        "beat_id": 2,
        "label": "Beat 2",
        "shift_coverage": ["DAY", "SWING"],
        "center": {"lat": 34.0611, "lon": -117.1816},
        "coordinates": [
            {"lat": 34.0668, "lon": -117.1880},
            {"lat": 34.0668, "lon": -117.1756},
            {"lat": 34.0553, "lon": -117.1756},
            {"lat": 34.0553, "lon": -117.1880},
        ],
    },
    {
        "beat_id": 3,
        "label": "Beat 3",
        "shift_coverage": ["DAY", "SWING"],
        "center": {"lat": 34.0611, "lon": -117.1690},
        "coordinates": [
            {"lat": 34.0668, "lon": -117.1755},
            {"lat": 34.0668, "lon": -117.1627},
            {"lat": 34.0553, "lon": -117.1627},
            {"lat": 34.0553, "lon": -117.1755},
        ],
    },
    {
        "beat_id": 4,
        "label": "Beat 4",
        "shift_coverage": ["DAY", "SWING"],
        "center": {"lat": 34.0491, "lon": -117.1820},
        "coordinates": [
            {"lat": 34.0552, "lon": -117.1880},
            {"lat": 34.0552, "lon": -117.1757},
            {"lat": 34.0430, "lon": -117.1757},
            {"lat": 34.0430, "lon": -117.1880},
        ],
    },
    {
        "beat_id": 5,
        "label": "Beat 5",
        "shift_coverage": ["DAY", "SWING"],
        "center": {"lat": 34.0491, "lon": -117.1688},
        "coordinates": [
            {"lat": 34.0552, "lon": -117.1756},
            {"lat": 34.0552, "lon": -117.1627},
            {"lat": 34.0430, "lon": -117.1627},
            {"lat": 34.0430, "lon": -117.1756},
        ],
    },
]

PATROL_CALL_LIBRARY = [
    {
        "beat": 1,
        "caller_name": "Transit Dispatch",
        "phone": "555-4801",
        "call_text": "Transit disturbance near downtown stop. One subject refusing to leave.",
        "address": "812 Eureka St, Redlands",
    },
    {
        "beat": 2,
        "caller_name": "Store Security",
        "phone": "555-4802",
        "call_text": "Shoplifting suspect detained, possible second suspect fleeing lot.",
        "address": "145 Olive Ave, Redlands",
    },
    {
        "beat": 3,
        "caller_name": "Resident",
        "phone": "555-4803",
        "call_text": "Domestic argument escalating, neighbors hearing threats and glass breaking.",
        "address": "304 University St, Redlands",
    },
    {
        "beat": 4,
        "caller_name": "Nurse",
        "phone": "555-4804",
        "call_text": "Subject in behavioral crisis outside urgent care refusing medical aid.",
        "address": "98 Brookside Ave, Redlands",
    },
    {
        "beat": 5,
        "caller_name": "Motorist",
        "phone": "555-4805",
        "call_text": "Road rage incident and possible handgun seen during traffic confrontation.",
        "address": "517 Pearl Ave, Redlands",
    },
]

PATROL_NAMES_DAY = [
    "Ofc. Adrian Vega",
    "Ofc. Natalie Price",
    "Ofc. Colin Archer",
    "Ofc. Mika Reyes",
    "Ofc. Jerome Hill",
]

PATROL_NAMES_SWING = [
    "Ofc. Lila Bennett",
    "Ofc. Ramon Flores",
    "Ofc. Serena Kane",
    "Ofc. David Owens",
    "Ofc. Tori Nguyen",
]

PATROL_RUNTIME = {
    "rng": Random(81),
}


def _beat_by_id(beat_id: int) -> dict:
    return next(item for item in BEAT_OVERLAYS if item["beat_id"] == beat_id)


def _beat_bounds(beat_id: int) -> tuple[float, float, float, float]:
    beat = _beat_by_id(beat_id)
    lats = [point["lat"] for point in beat["coordinates"]]
    lons = [point["lon"] for point in beat["coordinates"]]
    return min(lats), max(lats), min(lons), max(lons)


def _create_patrol_units() -> list[UnitSummary]:
    units: list[UnitSummary] = []
    for beat in range(1, 6):
        beat_meta = _beat_by_id(beat)
        units.append(
            UnitSummary(
                unit_id=f"u-day-{beat}",
                callsign=f"Car 1{beat}",
                officer_name=PATROL_NAMES_DAY[beat - 1],
                role="OFFICER",
                shift="DAY",
                beat=beat,
                dispatchable=True,
                status="AVAILABLE",
                coordinates={
                    "lat": beat_meta["center"]["lat"] + (beat * 0.0002),
                    "lon": beat_meta["center"]["lon"] - (beat * 0.0002),
                },
                skills=["Crisis", "Traffic"] if beat in {1, 2, 5} else ["Spanish", "Crisis"],
                workload_score=20 + beat * 4,
                fatigue_score=22 + beat * 3,
            )
        )
        units.append(
            UnitSummary(
                unit_id=f"u-swing-{beat}",
                callsign=f"Car 2{beat}",
                officer_name=PATROL_NAMES_SWING[beat - 1],
                role="OFFICER",
                shift="SWING",
                beat=beat,
                dispatchable=True,
                status="AVAILABLE",
                coordinates={
                    "lat": beat_meta["center"]["lat"] - (beat * 0.00015),
                    "lon": beat_meta["center"]["lon"] + (beat * 0.00015),
                },
                skills=["K9"] if beat == 4 else ["Spanish", "Traffic"],
                workload_score=24 + beat * 3,
                fatigue_score=20 + beat * 2,
            )
        )

    units.append(
        UnitSummary(
            unit_id="u-sgt-10",
            callsign="Sgt 10",
            officer_name="Sgt. Elena Ruiz",
            role="SERGEANT",
            shift="DAY",
            beat=3,
            dispatchable=False,
            status="AVAILABLE",
            coordinates={"lat": 34.0609, "lon": -117.1693},
            skills=["Supervisor", "Crisis"],
            workload_score=18,
            fatigue_score=26,
        )
    )
    units.append(
        UnitSummary(
            unit_id="u-lt-20",
            callsign="Lt 20",
            officer_name="Lt. Marcus Hale",
            role="LIEUTENANT",
            shift="SWING",
            beat=2,
            dispatchable=False,
            status="AVAILABLE",
            coordinates={"lat": 34.0605, "lon": -117.1823},
            skills=["Supervisor"],
            workload_score=16,
            fatigue_score=24,
        )
    )
    return units


def _dispatch_new_incident(incident_id: str) -> bool:
    incident = state.get_incident(incident_id)
    if not incident:
        return False
    assignment = choose_unit(
        AssignmentRequest(
            incident_id=incident_id,
            required_skills=incident.get("required_skills", []),
            incident_lat=float(incident["coordinates"]["lat"]),
            incident_lon=float(incident["coordinates"]["lon"]),
        ),
        commit=True,
    )
    return assignment.recommended_unit_id != "UNAVAILABLE"


def _create_patrol_call(template_index: int) -> bool:
    template = PATROL_CALL_LIBRARY[template_index % len(PATROL_CALL_LIBRARY)]
    beat = _beat_by_id(int(template["beat"]))
    lat_min, lat_max, lon_min, lon_max = _beat_bounds(int(template["beat"]))
    rng: Random = PATROL_RUNTIME["rng"]
    lat = beat["center"]["lat"] + ((rng.random() - 0.5) * (lat_max - lat_min) * 0.65)
    lon = beat["center"]["lon"] + ((rng.random() - 0.5) * (lon_max - lon_min) * 0.65)
    intake = process_intake(
        IntakeRequest(
            caller_name=template["caller_name"],
            phone=template["phone"],
            call_text=template["call_text"],
            address=template["address"],
            lat=lat,
            lon=lon,
        )
    )
    assigned = _dispatch_new_incident(intake.call_id)
    state.mark_patrol_call_generated(assigned=assigned)
    return assigned


def start_patrol_simulation(payload: PatrolSimulationRequest) -> dict:
    if payload.clear_existing:
        state.clear_operational_state(clear_units=True)

    units = _create_patrol_units()
    for unit in units:
        state.upsert_unit(unit)

    state.set_beat_overlays(BEAT_OVERLAYS)
    state.set_patrol_simulation(enabled=True, profile="BEAT_10X5", tick_seconds=payload.tick_seconds)

    assigned = 0
    for idx in range(payload.initial_calls):
        if _create_patrol_call(idx):
            assigned += 1

    status = state.patrol_simulation_status()
    return {
        "started": True,
        "profile": "BEAT_10X5",
        "tick_seconds": payload.tick_seconds,
        "dispatchable_units": status["dispatchable_units"],
        "senior_units": status["senior_units"],
        "beats_active": status["beats_active"],
        "initial_calls": payload.initial_calls,
        "initial_assigned": assigned,
    }


def stop_patrol_simulation() -> dict:
    state.set_patrol_simulation(enabled=False, profile="OFF", tick_seconds=12)
    return {"stopped": True, "profile": "OFF", "status": state.patrol_simulation_status()}


def patrol_simulation_status() -> dict:
    return state.patrol_simulation_status()


def _auto_close_incident(incident: dict) -> None:
    unit_id = incident.get("assigned_unit_id")
    if not unit_id:
        return
    text = (incident.get("call_text") or "").lower()
    call_type = (incident.get("call_type") or "Unknown").upper()
    disposition = "REPORT_ONLY"
    if "weapon" in text or "gun" in text:
        disposition = "ARREST_MADE"
    elif call_type == "TRAFFIC":
        disposition = "WARNING_ISSUED"
    elif call_type == "MEDICAL":
        disposition = "REFERRED"
    summary = (
        f"{incident['call_type']} call stabilized by {unit_id}. "
        f"Scene cleared and CAD closeout logged for beat operations."
    )
    state.set_incident_disposition(
        incident_id=incident["incident_id"],
        unit_id=unit_id,
        disposition_code=disposition,
        summary=summary,
        arrest_made=disposition == "ARREST_MADE",
        citation_issued=disposition == "WARNING_ISSUED",
        force_used=False,
    )


def advance_patrol_simulation() -> dict:
    status = state.patrol_simulation_status()
    if not status.get("enabled"):
        return {"advanced": False, "reason": "simulation_disabled"}

    last_tick_raw = status.get("last_tick")
    tick_seconds = int(status.get("tick_seconds") or 12)
    if last_tick_raw:
        elapsed = (datetime.now(timezone.utc) - parse_utc(str(last_tick_raw))).total_seconds()
        if elapsed < tick_seconds:
            return {"advanced": False, "reason": "tick_interval", "next_in_seconds": int(tick_seconds - elapsed)}

    state.mark_patrol_tick()
    tick_index = state.patrol_simulation_status().get("tick_index", 0)

    for unit in state.list_units():
        if not unit.dispatchable or unit.status != "AVAILABLE" or unit.beat is None:
            continue
        beat = _beat_by_id(unit.beat)
        lat_min, lat_max, lon_min, lon_max = _beat_bounds(unit.beat)
        lat_radius = (lat_max - lat_min) * 0.28
        lon_radius = (lon_max - lon_min) * 0.28
        unit_seed = sum(ord(ch) for ch in unit.unit_id) * 0.001
        lat = beat["center"]["lat"] + (sin((tick_index * 0.55) + unit_seed) * lat_radius)
        lon = beat["center"]["lon"] + (cos((tick_index * 0.55) + unit_seed) * lon_radius)
        state.update_unit_coordinates(unit.unit_id, lat=lat, lon=lon)

    active_incidents = state.list_incident_summaries(include_closed=False)
    for summary in active_incidents:
        incident = state.get_incident(summary.incident_id)
        if not incident:
            continue
        unit_id = incident.get("assigned_unit_id")
        if not unit_id:
            continue
        if incident["status"] == "DISPATCHED" and tick_index % 2 == 0:
            state.record_officer_action(incident["incident_id"], unit_id, "EN_ROUTE")
        elif incident["status"] == "EN_ROUTE" and tick_index % 3 == 0:
            state.record_officer_action(incident["incident_id"], unit_id, "ON_SCENE")
        elif incident["status"] == "ON_SCENE" and tick_index % 5 == 0:
            _auto_close_incident(incident)

    active_count = len(state.list_incident_summaries(include_closed=False))
    generated = 0
    if active_count < 6 or tick_index % 2 == 1:
        if _create_patrol_call(template_index=tick_index + active_count):
            generated += 1
        if active_count < 4 and tick_index % 3 == 0:
            if _create_patrol_call(template_index=tick_index + active_count + 1):
                generated += 1

    return {
        "advanced": True,
        "tick_index": tick_index,
        "active_incidents": len(state.list_incident_summaries(include_closed=False)),
        "calls_generated_this_tick": generated,
    }
