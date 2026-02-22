from app.core.state import state


def lookup_public_safety_records(query: str) -> dict:
    payload = state.search_public_safety_records(query)
    payload["query"] = query
    payload["sources"] = ["Records", "Firearms Registry", "Warrant Index"]
    return payload


def get_person_profile(person_id: str) -> dict | None:
    return state.get_person_public_safety_profile(person_id)


def build_incident_intel_packet(incident_id: str) -> dict | None:
    incident = state.get_incident(incident_id)
    if not incident:
        return None

    address_query = incident.get("address") or ""
    caller_query = incident.get("caller_name") or ""
    address_hits = state.search_public_safety_records(address_query) if address_query else {"records": [], "firearms": [], "warrants": []}
    caller_hits = (
        state.search_public_safety_records(caller_query)
        if caller_query and caller_query.lower() not in {"unknown", "anonymous"}
        else {"records": [], "firearms": [], "warrants": []}
    )

    active_warrants = [
        item for item in address_hits.get("warrants", []) + caller_hits.get("warrants", [])
        if item.get("status") == "ACTIVE"
    ]
    active_firearms = [
        item for item in address_hits.get("firearms", []) + caller_hits.get("firearms", [])
        if item.get("status") == "ACTIVE"
    ]
    text = (incident.get("call_text") or "").lower()

    threat_indicators: list[str] = []
    if active_warrants:
        threat_indicators.append(f"{len(active_warrants)} active warrant hit(s) in related records.")
    if active_firearms:
        threat_indicators.append(f"{len(active_firearms)} active firearm registration(s) matched.")
    if "weapon" in text or "gun" in text or "armed" in text:
        threat_indicators.append("Caller text includes possible weapon mention.")
    if incident.get("priority", 0) >= 80:
        threat_indicators.append("High-priority call score suggests elevated caution.")
    if not threat_indicators:
        threat_indicators.append("No elevated intel indicators detected from current datasets.")

    return {
        "incident_id": incident_id,
        "incident": {
            "call_type": incident.get("call_type"),
            "priority": incident.get("priority"),
            "status": incident.get("status"),
            "address": incident.get("address"),
            "caller_name": incident.get("caller_name"),
        },
        "sources": ["Records", "Firearms Registry", "Warrant Index"],
        "queries": {
            "address_query": address_query,
            "caller_query": caller_query if caller_query and caller_query.lower() not in {"unknown", "anonymous"} else None,
        },
        "matches": {
            "address_records": address_hits.get("records", []),
            "address_firearms": address_hits.get("firearms", []),
            "address_warrants": address_hits.get("warrants", []),
            "caller_records": caller_hits.get("records", []),
            "caller_firearms": caller_hits.get("firearms", []),
            "caller_warrants": caller_hits.get("warrants", []),
        },
        "totals": {
            "records": len(address_hits.get("records", [])) + len(caller_hits.get("records", [])),
            "firearms": len(address_hits.get("firearms", [])) + len(caller_hits.get("firearms", [])),
            "warrants": len(address_hits.get("warrants", [])) + len(caller_hits.get("warrants", [])),
            "active_warrants": len(active_warrants),
        },
        "threat_indicators": threat_indicators,
    }
