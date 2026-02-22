from pydantic import BaseModel, Field


class Coordinates(BaseModel):
    lat: float
    lon: float


class UnitSummary(BaseModel):
    unit_id: str
    callsign: str
    officer_name: str | None = None
    role: str = "OFFICER"
    shift: str | None = None
    beat: int | None = None
    dispatchable: bool = True
    status: str
    coordinates: Coordinates
    skills: list[str] = Field(default_factory=list)
    workload_score: int = 0
    fatigue_score: int = 0


class IncidentSummary(BaseModel):
    incident_id: str
    call_type: str
    crime_label: str | None = None
    primary_code: str | None = None
    priority: int
    address: str
    coordinates: Coordinates
    status: str
