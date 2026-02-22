from datetime import datetime, timezone

from app.core.state import state
from app.schemas.common import UnitSummary

DEFAULT_BEAT_OVERLAYS = [
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


def get_live_units() -> list[UnitSummary]:
    return state.list_units()


def map_snapshot() -> dict:
    incidents = state.list_incident_summaries()
    high_priority_count = sum(1 for incident in incidents if incident.priority >= 70)
    patrol_status = state.patrol_simulation_status()
    beats = state.get_beat_overlays() or [item.copy() for item in DEFAULT_BEAT_OVERLAYS]

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
        "beats": beats,
        "patrol_simulation": patrol_status,
        "units": [unit.model_dump() for unit in get_live_units()],
        "active_incidents": [incident.model_dump() for incident in incidents[:10]],
    }
