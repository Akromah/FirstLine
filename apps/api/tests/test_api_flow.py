from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_intake_dispatch_reporting_flow() -> None:
    intake_response = client.post(
        "/api/v1/intake/calls",
        json={
            "caller_name": "Alex",
            "phone": "555-222-1111",
            "call_text": "Possible domestic dispute and screaming, neighbor requested Spanish speaker.",
            "address": "901 Orange St, Redlands",
            "lat": 34.0538,
            "lon": -117.1806,
        },
    )
    assert intake_response.status_code == 200
    intake_payload = intake_response.json()
    incident_id = intake_payload["call_id"]

    queue_response = client.get("/api/v1/dispatch/queue")
    assert queue_response.status_code == 200
    queue_payload = queue_response.json()
    assert any(incident["incident_id"] == incident_id for incident in queue_payload["incidents"])

    risk_response = client.get(f"/api/v1/intake/risk/{incident_id}")
    assert risk_response.status_code == 200
    risk_payload = risk_response.json()
    assert risk_payload["risk_score"] >= 1

    intel_response = client.get("/api/v1/intel/lookup", params={"query": "Brandon"})
    assert intel_response.status_code == 200
    intel_payload = intel_response.json()
    assert len(intel_payload["records"]) >= 1
    assert len(intel_payload["warrants"]) >= 1

    assign_response = client.post(
        "/api/v1/dispatch/assign",
        json={
            "incident_id": incident_id,
            "required_skills": ["Spanish", "Crisis"],
            "incident_lat": 34.0538,
            "incident_lon": -117.1806,
        },
    )
    assert assign_response.status_code == 200
    assignment_payload = assign_response.json()
    assert assignment_payload["recommended_unit_id"]
    assert assignment_payload["predicted_eta_minutes"] >= 2

    officer_response = client.post(
        "/api/v1/officer/action",
        json={
            "incident_id": incident_id,
            "unit_id": assignment_payload["recommended_unit_id"],
            "action": "ARRIVED",
        },
    )
    assert officer_response.status_code == 200
    assert officer_response.json()["ok"] is True

    ai_response = client.post(
        "/api/v1/ai/incident",
        json={
            "incident_id": incident_id,
            "prompt": "Generate next operational steps.",
        },
    )
    assert ai_response.status_code == 200
    ai_payload = ai_response.json()
    assert ai_payload["recommended_disposition_code"]
    assert len(ai_payload["next_actions"]) >= 1

    command_response = client.get("/api/v1/command/overview")
    assert command_response.status_code == 200
    command_payload = command_response.json()
    assert command_payload["active_incidents"] >= 1
    assert command_payload["units_busy"] >= 1

    draft_response = client.post(
        "/api/v1/reporting/draft",
        json={
            "incident_id": incident_id,
            "unit_id": assignment_payload["recommended_unit_id"],
            "narrative": "Initial report draft pending supervisor review.",
            "structured_fields": {"case_type": "Domestic"},
            "status": "DRAFT",
        },
    )
    assert draft_response.status_code == 200
    draft_payload = draft_response.json()
    report_id = draft_payload["report_id"]

    hub_response = client.get("/api/v1/reporting/hub")
    assert hub_response.status_code == 200
    hub_payload = hub_response.json()
    assert any(draft["report_id"] == report_id for draft in hub_payload["drafts"])

    reporting_response = client.post(
        "/api/v1/reporting/rms",
        json={
            "incident_id": incident_id,
            "unit_id": assignment_payload["recommended_unit_id"],
            "narrative": "Unit arrived on scene and stabilized reporting parties.",
            "field_updates": {"disposition": "On-scene mediation"},
        },
    )
    assert reporting_response.status_code == 200
    report_payload = reporting_response.json()
    assert report_payload["incident_context"]["address"] == "901 Orange St, Redlands"
    assert any(event["event"] == "unit_assigned" for event in report_payload["audit_trail"])

    fetch_draft_response = client.get(f"/api/v1/reporting/draft/{report_id}")
    assert fetch_draft_response.status_code == 200
    assert fetch_draft_response.json()["status"] in {"DRAFT", "SUBMITTED"}

    disposition_response = client.post(
        "/api/v1/dispatch/disposition",
        json={
            "incident_id": incident_id,
            "unit_id": assignment_payload["recommended_unit_id"],
            "disposition_code": "WARNING_ISSUED",
            "summary": "Primary parties separated and verbal warning issued.",
            "arrest_made": False,
            "citation_issued": False,
            "force_used": False,
        },
    )
    assert disposition_response.status_code == 200
    disposition_payload = disposition_response.json()
    assert disposition_payload["status"] == "CLOSED"

    queue_after_close = client.get("/api/v1/dispatch/queue")
    assert queue_after_close.status_code == 200
    assert all(item["incident_id"] != incident_id for item in queue_after_close.json()["incidents"])
