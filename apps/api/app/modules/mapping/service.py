from datetime import datetime, timezone

from app.core.state import state
from app.schemas.common import UnitSummary


def get_live_units() -> list[UnitSummary]:
    return state.list_units()


def map_snapshot() -> dict:
    incidents = state.list_incident_summaries()
    high_priority_count = sum(1 for incident in incidents if incident.priority >= 70)
    patrol_status = state.patrol_simulation_status()

    return {
        "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "traffic_overlay": "moderate-heavy" if high_priority_count >= 2 else "moderate",
        "hot_zones": [
            {"name": "Downtown Redlands", "risk": "high", "score": min(98, 80 + (high_priority_count * 3))},
            {"name": "University District", "risk": "medium", "score": 61},
        ],
        "geofenced_alerts": [
            {
                "zone": "Redlands High School",
                "type": "School",
                "active": any("school" in incident.address.lower() for incident in incidents),
            },
            {
                "zone": "Redlands Community Hospital",
                "type": "Critical Site",
                "active": any("hospital" in incident.address.lower() for incident in incidents),
            },
        ],
        "beats": state.get_beat_overlays(),
        "patrol_simulation": patrol_status,
        "units": [unit.model_dump() for unit in get_live_units()],
        "active_incidents": [incident.model_dump() for incident in incidents[:10]],
    }
