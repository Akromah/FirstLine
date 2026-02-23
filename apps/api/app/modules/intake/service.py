from datetime import datetime, timedelta, timezone
from math import cos, sin
from random import Random
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
    override_call_type: str | None = None


class IntakeResponse(BaseModel):
    call_id: str
    normalized_address: str
    geolocation: dict[str, float]
    duplicate_call_ids: list[str] = Field(default_factory=list)
    suggested_call_type: str
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
    live_mode: bool = False
    logged_in_unit_id: str | None = None
    min_call_interval_seconds: int = Field(default=20, ge=5, le=300)
    max_call_interval_seconds: int = Field(default=75, ge=8, le=600)
    max_active_calls: int = Field(default=10, ge=3, le=20)
    min_call_duration_seconds: int = Field(default=60, ge=60, le=600)
    max_call_duration_seconds: int = Field(default=600, ge=60, le=1800)


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
    detailed_patterns: list[tuple[str, list[str]]] = [
        ("Armed Robbery In Progress", ["armed robbery", "robbery in progress", "stickup"]),
        ("Strong-Arm Robbery", ["strong arm robbery", "strong armed", "purse snatch"]),
        ("Assault With Deadly Weapon", ["assault with deadly weapon", "adw", "knife attack", "machete"]),
        ("Domestic Violence Physical", ["domestic violence", "domestic battery", "partner hit"]),
        ("Domestic Disturbance Verbal", ["domestic disturbance", "loud argument", "verbal domestic"]),
        ("Shots Fired", ["shots fired", "gunshots", "rounds fired"]),
        ("Person With Weapon", ["person with weapon", "brandishing", "gun seen", "armed subject"]),
        ("Burglary Residential", ["residential burglary", "break in", "intruder", "window smashed"]),
        ("Burglary Commercial", ["commercial burglary", "business alarm", "store break-in"]),
        ("Vehicle Burglary", ["vehicle burglary", "car window", "tampering with vehicle"]),
        ("Auto Theft", ["stolen vehicle", "auto theft", "vehicle taken"]),
        ("Attempted Auto Theft", ["attempted auto theft", "catalytic converter", "trying to steal car"]),
        ("Carjacking", ["carjacking", "vehicle takeover", "driver forced out"]),
        ("DUI Driver", ["dui", "drunk driver", "impaired driver"]),
        ("Hit and Run Injury", ["hit and run injury", "left scene with injury"]),
        ("Hit and Run Property Damage", ["hit and run", "left scene", "vehicle fled"]),
        ("Major Injury Collision", ["major injury collision", "rollover", "extrication"]),
        ("Traffic Collision Blocking", ["traffic crash", "collision blocking", "accident blocking"]),
        ("Mental Health Crisis", ["mental health crisis", "5150", "behavioral crisis", "suicidal"]),
        ("Overdose", ["overdose", "not breathing", "narcan"]),
        ("Welfare Check", ["welfare check", "wellness check", "unable to contact"]),
        ("Missing Person", ["missing person", "runaway"]),
        ("Stalking", ["stalking", "being followed", "repeated threats"]),
        ("Criminal Threats", ["criminal threats", "threatened to kill", "death threat"]),
        ("Trespassing", ["trespassing", "refusing to leave", "unlawful entry"]),
        ("Vandalism", ["vandalism", "graffiti", "property damage"]),
        ("Narcotics Activity", ["narcotics", "drug activity", "possible sales"]),
        ("Disturbing the Peace", ["disturbing the peace", "fight in progress", "disorderly"]),
        ("Noise Complaint", ["noise complaint", "loud party", "loud music"]),
        ("Suspicious Person", ["suspicious person", "prowler", "loitering"]),
        ("Suspicious Vehicle", ["suspicious vehicle", "occupied suspicious", "circling block"]),
        ("Fraud Report", ["fraud", "forged check", "identity theft"]),
        ("Warrant Service Assist", ["warrant service", "warrant check"]),
    ]
    for label, patterns in detailed_patterns:
        if any(pattern in text for pattern in patterns):
            return label
    if any(k in text for k in ["car crash", "traffic", "hit and run", "accident"]):
        return "Traffic Collision"
    if any(k in text for k in ["chest pain", "medical", "unconscious", "overdose"]):
        return "Medical Aid"
    if any(k in text for k in ["domestic", "arguing", "husband", "wife"]):
        return "Domestic Disturbance"
    if any(k in text for k in ["break in", "burglary", "intruder", "window"]):
        return "Burglary"
    return "Unknown Call Type"


def normalize_call_category(call_type: str, call_text: str) -> str:
    combined = f"{call_type} {call_text}".lower()
    if any(token in combined for token in ["traffic", "dui", "collision", "hit and run", "carjacking", "street racing", "reckless driver"]):
        return "TRAFFIC"
    if any(token in combined for token in ["medical", "overdose", "not breathing", "suicid", "welfare check", "mental health"]):
        return "MEDICAL"
    if any(token in combined for token in ["domestic", "spouse", "partner", "family violence"]):
        return "DOMESTIC"
    if any(token in combined for token in ["robbery", "assault", "weapon", "shots fired", "battery", "carjacking"]):
        return "VIOLENT"
    if any(token in combined for token in ["burglary", "theft", "vandalism", "fraud", "trespass"]):
        return "PROPERTY"
    return "OTHER"


def infer_required_skills(call_type: str, call_text: str) -> list[str]:
    text = call_text.lower()
    type_text = call_type.lower()
    category = normalize_call_category(call_type, call_text)
    skills: list[str] = []
    if category == "MEDICAL":
        skills.append("Medical")
    if category in {"DOMESTIC", "VIOLENT"}:
        skills.append("Crisis")
    if any(k in type_text for k in ["warrant", "weapon", "shots fired", "robbery"]):
        skills.append("Crisis")
    if any(k in text for k in ["spanish", "translation", "habla"]):
        skills.append("Spanish")
    if any(k in text for k in ["k9", "canine", "track"]):
        skills.append("K9")
    if any(k in text for k in ["active shooter", "hostage", "swat requested"]):
        skills.append("SWAT")
    return sorted(set(skills))


def process_intake(payload: IntakeRequest) -> IntakeResponse:
    priority, reasons = score_priority(payload.call_text, payload.address)
    call_type = (payload.override_call_type or "").strip() or suggest_call_type(payload.call_text)
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

PATROL_CALL_TYPES = [
    {"call_type": "Armed Robbery In Progress", "caller_name": "Store Clerk", "call_text": "Armed robbery in progress. Suspect threatened clerk with a handgun and took cash by force and fear."},
    {"call_type": "Strong-Arm Robbery", "caller_name": "Victim", "call_text": "Strong-armed robbery just occurred. Suspect grabbed phone from victim and pushed victim to the ground."},
    {"call_type": "Residential Burglary Audible Alarm", "caller_name": "Alarm Company", "call_text": "Residential burglary alarm. Rear window shattered and unknown subject entered residence."},
    {"call_type": "Commercial Burglary", "caller_name": "Business Owner", "call_text": "Commercial burglary at closed business. Front door pried and property missing."},
    {"call_type": "Vehicle Burglary", "caller_name": "Caller", "call_text": "Vehicle burglary in parking lot. Car window smashed and backpack stolen."},
    {"call_type": "Auto Theft", "caller_name": "Vehicle Owner", "call_text": "Auto theft report. Vehicle taken from driveway without consent."},
    {"call_type": "Attempted Auto Theft", "caller_name": "Neighbor", "call_text": "Attempted auto theft in progress. Subjects trying to remove catalytic converter."},
    {"call_type": "Carjacking", "caller_name": "Victim", "call_text": "Carjacking just occurred. Driver forced out of vehicle by threat and suspect fled with car."},
    {"call_type": "Assault With Deadly Weapon", "caller_name": "Witness", "call_text": "Assault with deadly weapon. Suspect swinging machete at pedestrians."},
    {"call_type": "Battery", "caller_name": "Victim", "call_text": "Battery call. Subject punched victim during argument."},
    {"call_type": "Domestic Violence Physical", "caller_name": "Neighbor", "call_text": "Domestic violence physical. Partner struck victim causing visible injury."},
    {"call_type": "Domestic Disturbance Verbal", "caller_name": "Neighbor", "call_text": "Domestic disturbance verbal with yelling, threats, and possible property damage."},
    {"call_type": "Child Welfare Check", "caller_name": "School Staff", "call_text": "Child welfare check requested. Juvenile appears abandoned and distressed."},
    {"call_type": "Elder Abuse Report", "caller_name": "Caregiver", "call_text": "Elder abuse report. Elder claims caregiver used force and took medications."},
    {"call_type": "Stalking", "caller_name": "Victim", "call_text": "Stalking report. Unknown subject repeatedly follows victim and waits outside home."},
    {"call_type": "Criminal Threats", "caller_name": "Victim", "call_text": "Criminal threats. Caller received death threat by text and voicemail."},
    {"call_type": "Brandishing Firearm", "caller_name": "Witness", "call_text": "Brandishing firearm during confrontation in parking lot."},
    {"call_type": "Shots Fired", "caller_name": "Multiple Callers", "call_text": "Shots fired heard from alley. Possible vehicle fleeing westbound."},
    {"call_type": "Person With Weapon", "caller_name": "Security", "call_text": "Person with weapon seen outside business, possibly armed with knife."},
    {"call_type": "Suspicious Person", "caller_name": "Resident", "call_text": "Suspicious person checking door handles and peeking into windows."},
    {"call_type": "Suspicious Vehicle", "caller_name": "Resident", "call_text": "Suspicious vehicle circling block repeatedly and stopping in front of homes."},
    {"call_type": "Trespassing", "caller_name": "Property Manager", "call_text": "Trespassing call. Subject refuses to leave private property."},
    {"call_type": "Vandalism Graffiti", "caller_name": "Business Owner", "call_text": "Vandalism and graffiti in progress on storefront."},
    {"call_type": "Vandalism Property Damage", "caller_name": "Resident", "call_text": "Vandalism report. Mailboxes broken and car tires slashed."},
    {"call_type": "Narcotics Activity", "caller_name": "Caller", "call_text": "Narcotics activity. Hand-to-hand transactions observed near alley."},
    {"call_type": "Overdose", "caller_name": "Friend", "call_text": "Possible overdose. Adult male not breathing, Narcan requested."},
    {"call_type": "Mental Health Crisis", "caller_name": "Family Member", "call_text": "Mental health crisis. Subject making suicidal statements and pacing in street."},
    {"call_type": "Welfare Check", "caller_name": "Family Member", "call_text": "Welfare check requested, no contact with elderly resident for two days."},
    {"call_type": "Missing Person", "caller_name": "Parent", "call_text": "Missing person juvenile did not return home after school."},
    {"call_type": "Found Child", "caller_name": "Resident", "call_text": "Found child alone at park and unable to locate guardian."},
    {"call_type": "DUI Driver", "caller_name": "Motorist", "call_text": "Possible DUI driver swerving across lanes and almost hit curb."},
    {"call_type": "Hit and Run Injury", "caller_name": "Witness", "call_text": "Hit and run injury collision. Vehicle fled scene after striking pedestrian."},
    {"call_type": "Hit and Run Property Damage", "caller_name": "Victim", "call_text": "Hit and run property damage. Parked vehicle struck and suspect fled."},
    {"call_type": "Major Injury Collision", "caller_name": "Motorist", "call_text": "Major injury traffic collision with rollover, occupants trapped."},
    {"call_type": "Traffic Collision Blocking", "caller_name": "Motorist", "call_text": "Traffic collision blocking lane with debris and arguing drivers."},
    {"call_type": "Reckless Driver", "caller_name": "Caller", "call_text": "Reckless driver speeding and weaving through traffic."},
    {"call_type": "Street Racing", "caller_name": "Resident", "call_text": "Street racing and burnouts in intersection."},
    {"call_type": "Disturbing the Peace", "caller_name": "Caller", "call_text": "Disturbing the peace, large fight in parking lot."},
    {"call_type": "Loud Party", "caller_name": "Neighbor", "call_text": "Loud party with possible underage drinking and disturbance."},
    {"call_type": "Noise Complaint", "caller_name": "Neighbor", "call_text": "Noise complaint for amplified music after quiet hours."},
    {"call_type": "Illegal Fireworks", "caller_name": "Resident", "call_text": "Illegal fireworks being launched near homes."},
    {"call_type": "Arson Attempt", "caller_name": "Witness", "call_text": "Possible arson attempt. Subject seen igniting trash enclosure."},
    {"call_type": "Medical Aid Assist", "caller_name": "EMS", "call_text": "Medical aid assist requested for combative patient in crisis."},
    {"call_type": "Suicide Attempt", "caller_name": "Family Member", "call_text": "Suicide attempt in progress, subject threatening self-harm."},
    {"call_type": "Battery On Officer Assist", "caller_name": "Officer Request", "call_text": "Assist requested. Subject battered officer during detention and fled."},
    {"call_type": "Resisting Arrest", "caller_name": "Witness", "call_text": "Subject resisting arrest and attempting to flee on foot."},
    {"call_type": "Warrant Service Assist", "caller_name": "Detective", "call_text": "Warrant service assist requested at residence with prior violence history."},
    {"call_type": "Fraud Report", "caller_name": "Bank Manager", "call_text": "Fraud report involving forged check and identity misuse."},
    {"call_type": "Identity Theft Report", "caller_name": "Victim", "call_text": "Identity theft report with unauthorized credit applications."},
    {"call_type": "Subject Down Not Breathing", "caller_name": "Caller", "call_text": "Subject down not breathing in parking lot, medical and police requested."},
    {"call_type": "Public Intoxication", "caller_name": "Business Staff", "call_text": "Public intoxication and disorderly behavior outside restaurant."},
]

REDLANDS_PATROL_LOCATIONS = [
    {"beat": 1, "address": "1 E State St, Redlands"},
    {"beat": 2, "address": "101 W State St, Redlands"},
    {"beat": 3, "address": "205 E Citrus Ave, Redlands"},
    {"beat": 4, "address": "312 Brookside Ave, Redlands"},
    {"beat": 5, "address": "417 Pearl Ave, Redlands"},
    {"beat": 1, "address": "522 Cajon St, Redlands"},
    {"beat": 2, "address": "608 Orange St, Redlands"},
    {"beat": 3, "address": "715 University St, Redlands"},
    {"beat": 4, "address": "823 Colton Ave, Redlands"},
    {"beat": 5, "address": "902 New York St, Redlands"},
    {"beat": 1, "address": "66 E Olive Ave, Redlands"},
    {"beat": 2, "address": "145 Olive Ave, Redlands"},
    {"beat": 3, "address": "233 Eureka St, Redlands"},
    {"beat": 4, "address": "318 San Bernardino Ave, Redlands"},
    {"beat": 5, "address": "409 Alabama St, Redlands"},
    {"beat": 1, "address": "512 Church St, Redlands"},
    {"beat": 2, "address": "633 Fern Ave, Redlands"},
    {"beat": 3, "address": "744 Barton Rd, Redlands"},
    {"beat": 4, "address": "855 Tennessee St, Redlands"},
    {"beat": 5, "address": "966 Lugonia Ave, Redlands"},
    {"beat": 1, "address": "1101 Redlands Blvd, Redlands"},
    {"beat": 2, "address": "118 E High Ave, Redlands"},
    {"beat": 3, "address": "224 W High Ave, Redlands"},
    {"beat": 4, "address": "337 E Pioneer Ave, Redlands"},
    {"beat": 5, "address": "449 W Pioneer Ave, Redlands"},
    {"beat": 1, "address": "553 E Cypress Ave, Redlands"},
    {"beat": 2, "address": "667 W Cypress Ave, Redlands"},
    {"beat": 3, "address": "772 E Sunset Dr, Redlands"},
    {"beat": 4, "address": "884 W Sunset Dr, Redlands"},
    {"beat": 5, "address": "995 Nevada St, Redlands"},
    {"beat": 1, "address": "108 E Stuart Ave, Redlands"},
    {"beat": 2, "address": "217 W Stuart Ave, Redlands"},
    {"beat": 3, "address": "326 E Crescent Ave, Redlands"},
    {"beat": 4, "address": "438 W Crescent Ave, Redlands"},
    {"beat": 5, "address": "549 Judson St, Redlands"},
    {"beat": 1, "address": "658 Garden St, Redlands"},
    {"beat": 2, "address": "763 Franklin Ave, Redlands"},
    {"beat": 3, "address": "872 Bellevue Ave, Redlands"},
    {"beat": 4, "address": "981 Dearborn St, Redlands"},
    {"beat": 5, "address": "1096 Tribuna Ave, Redlands"},
    {"beat": 1, "address": "120 E Palm Ave, Redlands"},
    {"beat": 2, "address": "232 W Palm Ave, Redlands"},
    {"beat": 3, "address": "341 E Brockton Ave, Redlands"},
    {"beat": 4, "address": "457 W Brockton Ave, Redlands"},
    {"beat": 5, "address": "568 Kansas St, Redlands"},
    {"beat": 1, "address": "675 Park Ave, Redlands"},
    {"beat": 2, "address": "784 Center St, Redlands"},
    {"beat": 3, "address": "893 Grant St, Redlands"},
    {"beat": 4, "address": "1004 Clay St, Redlands"},
    {"beat": 5, "address": "1115 Via Vista Dr, Redlands"},
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
    "incident_timers": {},
    "excluded_unit_id": None,
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


def _dispatch_new_incident(incident_id: str, excluded_unit_id: str | None = None) -> tuple[bool, str | None]:
    incident = state.get_incident(incident_id)
    if not incident:
        return False, None
    assignment = choose_unit(
        AssignmentRequest(
            incident_id=incident_id,
            required_skills=incident.get("required_skills", []),
            incident_lat=float(incident["coordinates"]["lat"]),
            incident_lon=float(incident["coordinates"]["lon"]),
            exclude_unit_ids=[excluded_unit_id] if excluded_unit_id else [],
        ),
        commit=True,
    )
    if assignment.recommended_unit_id == "UNAVAILABLE":
        return False, None
    return True, assignment.recommended_unit_id


def _register_incident_timer(
    incident_id: str,
    unit_id: str,
    min_call_duration_seconds: int,
    max_call_duration_seconds: int,
) -> None:
    incident = state.get_incident(incident_id)
    if not incident:
        return
    rng: Random = PATROL_RUNTIME["rng"]
    now = datetime.now(timezone.utc)
    travel_seconds = rng.randint(35, 120)
    scene_seconds = rng.randint(min_call_duration_seconds, max_call_duration_seconds)
    PATROL_RUNTIME["incident_timers"][incident_id] = {
        "unit_id": unit_id,
        "target_lat": float(incident["coordinates"]["lat"]),
        "target_lon": float(incident["coordinates"]["lon"]),
        "en_route_event_at": (now + timedelta(seconds=max(8, int(travel_seconds * 0.25)))).isoformat().replace("+00:00", "Z"),
        "on_scene_at": (now + timedelta(seconds=travel_seconds)).isoformat().replace("+00:00", "Z"),
        "clear_at": (now + timedelta(seconds=travel_seconds + scene_seconds)).isoformat().replace("+00:00", "Z"),
    }


def _create_patrol_call(
    template_index: int,
    excluded_unit_id: str | None = None,
    min_call_duration_seconds: int = 60,
    max_call_duration_seconds: int = 600,
) -> dict:
    call_profile = PATROL_CALL_TYPES[template_index % len(PATROL_CALL_TYPES)]
    location_index = (template_index * 7) % len(REDLANDS_PATROL_LOCATIONS)
    location = REDLANDS_PATROL_LOCATIONS[location_index]
    beat_id = int(location["beat"])
    beat = _beat_by_id(beat_id)
    lat_min, lat_max, lon_min, lon_max = _beat_bounds(beat_id)
    rng: Random = PATROL_RUNTIME["rng"]
    lat = beat["center"]["lat"] + ((rng.random() - 0.5) * (lat_max - lat_min) * 0.65)
    lon = beat["center"]["lon"] + ((rng.random() - 0.5) * (lon_max - lon_min) * 0.65)
    phone_suffix = 5000 + (template_index % 900)
    intake = process_intake(
        IntakeRequest(
            caller_name=call_profile["caller_name"],
            phone=f"555-{phone_suffix:04d}",
            call_text=call_profile["call_text"],
            address=str(location["address"]),
            lat=lat,
            lon=lon,
            override_call_type=call_profile["call_type"],
        )
    )
    assigned, unit_id = _dispatch_new_incident(intake.call_id, excluded_unit_id=excluded_unit_id)
    if assigned and unit_id:
        _register_incident_timer(
            incident_id=intake.call_id,
            unit_id=unit_id,
            min_call_duration_seconds=min_call_duration_seconds,
            max_call_duration_seconds=max_call_duration_seconds,
        )
    state.mark_patrol_call_generated(assigned=assigned)
    return {"incident_id": intake.call_id, "assigned": assigned, "unit_id": unit_id}


def _schedule_next_call_due(min_interval_seconds: int, max_interval_seconds: int) -> str:
    rng: Random = PATROL_RUNTIME["rng"]
    due_seconds = rng.randint(min_interval_seconds, max_interval_seconds)
    due_at = (datetime.now(timezone.utc) + timedelta(seconds=due_seconds)).isoformat().replace("+00:00", "Z")
    state.update_patrol_simulation(next_call_due_at=due_at)
    return due_at


def _active_incident_count() -> int:
    return len(state.list_incident_summaries(include_closed=False))


def start_patrol_simulation(payload: PatrolSimulationRequest) -> dict:
    if payload.clear_existing:
        state.clear_operational_state(clear_units=True)

    units = _create_patrol_units()
    for unit in units:
        state.upsert_unit(unit)

    min_call_interval = min(payload.min_call_interval_seconds, payload.max_call_interval_seconds)
    max_call_interval = max(payload.min_call_interval_seconds, payload.max_call_interval_seconds)
    min_call_duration = min(payload.min_call_duration_seconds, payload.max_call_duration_seconds)
    max_call_duration = max(payload.min_call_duration_seconds, payload.max_call_duration_seconds)
    max_active_calls = max(3, min(payload.max_active_calls, 20))

    PATROL_RUNTIME["incident_timers"] = {}
    PATROL_RUNTIME["excluded_unit_id"] = payload.logged_in_unit_id.strip() if payload.logged_in_unit_id else None

    state.set_beat_overlays(BEAT_OVERLAYS)
    state.set_patrol_simulation(
        enabled=True,
        profile="LIVE_DEV" if payload.live_mode else "BEAT_10X5",
        tick_seconds=payload.tick_seconds,
        metadata={
            "min_call_interval_seconds": min_call_interval,
            "max_call_interval_seconds": max_call_interval,
            "max_active_calls": max_active_calls,
            "min_call_duration_seconds": min_call_duration,
            "max_call_duration_seconds": max_call_duration,
            "logged_in_unit_id": PATROL_RUNTIME["excluded_unit_id"],
            "call_types_loaded": len(PATROL_CALL_TYPES),
            "call_locations_loaded": len(REDLANDS_PATROL_LOCATIONS),
        },
    )

    assigned = 0
    initial_calls = min(payload.initial_calls, max_active_calls)
    for idx in range(initial_calls):
        created = _create_patrol_call(
            idx,
            excluded_unit_id=PATROL_RUNTIME["excluded_unit_id"],
            min_call_duration_seconds=min_call_duration,
            max_call_duration_seconds=max_call_duration,
        )
        if created["assigned"]:
            assigned += 1

    next_due_at = _schedule_next_call_due(min_call_interval, max_call_interval)
    status = state.patrol_simulation_status()
    return {
        "started": True,
        "profile": "LIVE_DEV" if payload.live_mode else "BEAT_10X5",
        "live_mode": payload.live_mode,
        "tick_seconds": payload.tick_seconds,
        "dispatchable_units": status["dispatchable_units"],
        "senior_units": status["senior_units"],
        "beats_active": status["beats_active"],
        "initial_calls": initial_calls,
        "initial_assigned": assigned,
        "max_active_calls": max_active_calls,
        "next_call_due_at": next_due_at,
        "logged_in_unit_id": PATROL_RUNTIME["excluded_unit_id"],
        "call_types_loaded": len(PATROL_CALL_TYPES),
        "call_locations_loaded": len(REDLANDS_PATROL_LOCATIONS),
    }


def stop_patrol_simulation() -> dict:
    PATROL_RUNTIME["incident_timers"] = {}
    PATROL_RUNTIME["excluded_unit_id"] = None
    state.set_patrol_simulation(
        enabled=False,
        profile="OFF",
        tick_seconds=12,
        metadata={
            "min_call_interval_seconds": 30,
            "max_call_interval_seconds": 120,
            "max_active_calls": 10,
            "min_call_duration_seconds": 60,
            "max_call_duration_seconds": 600,
            "logged_in_unit_id": None,
            "call_types_loaded": len(PATROL_CALL_TYPES),
            "call_locations_loaded": len(REDLANDS_PATROL_LOCATIONS),
        },
    )
    return {"stopped": True, "profile": "OFF", "status": state.patrol_simulation_status()}


def patrol_simulation_status() -> dict:
    status = state.patrol_simulation_status()
    status["timed_incidents"] = len(PATROL_RUNTIME["incident_timers"])
    return status


def _auto_close_incident(incident: dict) -> None:
    unit_id = incident.get("assigned_unit_id")
    if not unit_id:
        return
    text = (incident.get("call_text") or "").lower()
    call_type = str(incident.get("call_type") or "Unknown")
    category = normalize_call_category(call_type, text)
    disposition = "REPORT_ONLY"
    if "weapon" in text or "gun" in text:
        disposition = "ARREST_MADE"
    elif category == "TRAFFIC":
        disposition = "WARNING_ISSUED"
    elif category == "MEDICAL":
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
    state.mark_patrol_call_resolved()


def _move_toward(current_lat: float, current_lon: float, target_lat: float, target_lon: float, ratio: float = 0.26) -> tuple[float, float]:
    return (
        current_lat + ((target_lat - current_lat) * ratio),
        current_lon + ((target_lon - current_lon) * ratio),
    )


def advance_patrol_simulation(force: bool = False) -> dict:
    status = state.patrol_simulation_status()
    if not status.get("enabled"):
        return {"advanced": False, "reason": "simulation_disabled"}

    last_tick_raw = status.get("last_tick")
    tick_seconds = int(status.get("tick_seconds") or 12)
    if last_tick_raw and not force:
        elapsed = (datetime.now(timezone.utc) - parse_utc(str(last_tick_raw))).total_seconds()
        if elapsed < tick_seconds:
            return {"advanced": False, "reason": "tick_interval", "next_in_seconds": int(tick_seconds - elapsed)}

    state.mark_patrol_tick()
    status = state.patrol_simulation_status()
    tick_index = status.get("tick_index", 0)
    now = datetime.now(timezone.utc)
    excluded_unit_id = str(status.get("logged_in_unit_id") or PATROL_RUNTIME.get("excluded_unit_id") or "")

    incident_timers: dict = PATROL_RUNTIME["incident_timers"]
    for incident_id, timer in list(incident_timers.items()):
        incident = state.get_incident(incident_id)
        if not incident or incident["status"] == "CLOSED":
            incident_timers.pop(incident_id, None)
            continue

        unit_id = str(timer.get("unit_id") or incident.get("assigned_unit_id") or "")
        if not unit_id:
            incident_timers.pop(incident_id, None)
            continue

        target_lat = float(timer.get("target_lat") or incident["coordinates"]["lat"])
        target_lon = float(timer.get("target_lon") or incident["coordinates"]["lon"])
        unit = state.get_unit(unit_id)
        if unit and incident["status"] in {"DISPATCHED", "EN_ROUTE"}:
            moved_lat, moved_lon = _move_toward(
                current_lat=float(unit.coordinates.lat),
                current_lon=float(unit.coordinates.lon),
                target_lat=target_lat,
                target_lon=target_lon,
            )
            state.update_unit_coordinates(unit_id, moved_lat, moved_lon)

        en_route_event_at = parse_utc(str(timer["en_route_event_at"]))
        on_scene_at = parse_utc(str(timer["on_scene_at"]))
        clear_at = parse_utc(str(timer["clear_at"]))

        if incident["status"] == "DISPATCHED" and now >= en_route_event_at:
            state.record_officer_action(incident_id, unit_id, "EN_ROUTE")
        if incident["status"] in {"DISPATCHED", "EN_ROUTE"} and now >= on_scene_at:
            state.record_officer_action(incident_id, unit_id, "ON_SCENE")
            state.update_unit_coordinates(unit_id, target_lat, target_lon)
        if incident["status"] == "ON_SCENE":
            state.update_unit_coordinates(unit_id, target_lat, target_lon)
            if now >= clear_at:
                _auto_close_incident(incident)
                incident_timers.pop(incident_id, None)

    for unit in state.list_units():
        if not unit.dispatchable or unit.status != "AVAILABLE" or unit.beat is None:
            continue
        if excluded_unit_id and unit.unit_id == excluded_unit_id:
            continue
        beat = _beat_by_id(unit.beat)
        lat_min, lat_max, lon_min, lon_max = _beat_bounds(unit.beat)
        lat_radius = (lat_max - lat_min) * 0.28
        lon_radius = (lon_max - lon_min) * 0.28
        unit_seed = sum(ord(ch) for ch in unit.unit_id) * 0.001
        lat = beat["center"]["lat"] + (sin((tick_index * 0.55) + unit_seed) * lat_radius)
        lon = beat["center"]["lon"] + (cos((tick_index * 0.55) + unit_seed) * lon_radius)
        state.update_unit_coordinates(unit.unit_id, lat=lat, lon=lon)

    min_call_interval = int(status.get("min_call_interval_seconds") or 30)
    max_call_interval = int(status.get("max_call_interval_seconds") or 120)
    min_call_duration = int(status.get("min_call_duration_seconds") or 60)
    max_call_duration = int(status.get("max_call_duration_seconds") or 600)
    max_active_calls = int(status.get("max_active_calls") or 10)
    active_count = _active_incident_count()
    generated = 0
    next_call_due_at_raw = status.get("next_call_due_at")
    if not next_call_due_at_raw:
        next_call_due_at_raw = _schedule_next_call_due(min_call_interval, max_call_interval)

    if active_count < max_active_calls and now >= parse_utc(str(next_call_due_at_raw)):
        _create_patrol_call(
            template_index=tick_index + active_count,
            excluded_unit_id=excluded_unit_id or None,
            min_call_duration_seconds=min_call_duration,
            max_call_duration_seconds=max_call_duration,
        )
        generated = 1
        _schedule_next_call_due(min_call_interval, max_call_interval)
    elif active_count >= max_active_calls and now >= parse_utc(str(next_call_due_at_raw)):
        _schedule_next_call_due(30, 60)

    refreshed_status = state.patrol_simulation_status()
    return {
        "advanced": True,
        "tick_index": tick_index,
        "active_incidents": _active_incident_count(),
        "calls_generated_this_tick": generated,
        "next_call_due_at": refreshed_status.get("next_call_due_at"),
        "timed_incidents": len(PATROL_RUNTIME["incident_timers"]),
    }
