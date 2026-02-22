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

    demo_response = client.post("/api/v1/intake/demo", json={"scenario": "SHIFT_START"})
    assert demo_response.status_code == 200
    assert demo_response.json()["created_count"] == 3

    unit_board_response = client.get("/api/v1/dispatch/unit-board")
    assert unit_board_response.status_code == 200
    assert len(unit_board_response.json()["units"]) >= 1

    availability_board_response = client.get("/api/v1/dispatch/availability-board")
    assert availability_board_response.status_code == 200
    availability_payload = availability_board_response.json()
    assert "available_units" in availability_payload
    assert "unavailable_units" in availability_payload

    priority_board_response = client.get("/api/v1/dispatch/priority-board", params={"limit": 5})
    assert priority_board_response.status_code == 200
    assert priority_board_response.json()["count"] >= 1

    risk_response = client.get(f"/api/v1/intake/risk/{incident_id}")
    assert risk_response.status_code == 200
    risk_payload = risk_response.json()
    assert risk_payload["risk_score"] >= 1

    intel_response = client.get("/api/v1/intel/lookup", params={"query": "Brandon"})
    assert intel_response.status_code == 200
    intel_payload = intel_response.json()
    assert len(intel_payload["records"]) >= 1
    assert len(intel_payload["warrants"]) >= 1

    incident_intel_response = client.get(f"/api/v1/intel/incident/{incident_id}")
    assert incident_intel_response.status_code == 200
    incident_intel_payload = incident_intel_response.json()
    assert "threat_indicators" in incident_intel_payload
    assert incident_intel_payload["totals"]["records"] >= 1

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

    officer_feed_response = client.get(f"/api/v1/officer/feed/{assignment_payload['recommended_unit_id']}")
    assert officer_feed_response.status_code == 200
    assert any(
        item["incident_id"] == incident_id
        for item in officer_feed_response.json()["assigned_incidents"]
    )

    detail_response = client.get(f"/api/v1/dispatch/incident/{incident_id}")
    assert detail_response.status_code == 200
    detail_payload = detail_response.json()
    assert detail_payload["incident"]["incident_id"] == incident_id
    assert "timeline" in detail_payload

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

    quick_actions_before_disposition = client.get(
        f"/api/v1/officer/quick-actions/{incident_id}",
        params={"unit_id": assignment_payload["recommended_unit_id"]},
    )
    assert quick_actions_before_disposition.status_code == 200
    assert quick_actions_before_disposition.json()["has_disposition"] is False

    clear_before_disposition = client.post(
        "/api/v1/officer/action",
        json={
            "incident_id": incident_id,
            "unit_id": assignment_payload["recommended_unit_id"],
            "action": "CLEAR",
        },
    )
    assert clear_before_disposition.status_code == 200
    assert clear_before_disposition.json()["ok"] is False
    assert "Finalize disposition" in clear_before_disposition.json()["error"]

    message_response = client.post(
        "/api/v1/officer/message",
        json={
            "from_unit": assignment_payload["recommended_unit_id"],
            "to_unit": "DISPATCH",
            "body": "Arrived on scene, requesting records check.",
            "incident_id": incident_id,
            "priority": "HIGH",
        },
    )
    assert message_response.status_code == 200
    assert message_response.json()["delivered"] is True
    assert message_response.json()["incident_id"] == incident_id

    inbox_response = client.get(f"/api/v1/officer/messages/{assignment_payload['recommended_unit_id']}")
    assert inbox_response.status_code == 200
    assert inbox_response.json()["message_count"] >= 1

    channel_response = client.get(f"/api/v1/officer/channel/{incident_id}")
    assert channel_response.status_code == 200
    assert channel_response.json()["message_count"] >= 1

    handoff_post_response = client.post(
        "/api/v1/officer/handoff",
        json={
            "incident_id": incident_id,
            "unit_id": assignment_payload["recommended_unit_id"],
            "note": "Scene secure. Witness in apartment 3B. Request day-shift follow-up.",
            "audience": "SUPERVISOR",
        },
    )
    assert handoff_post_response.status_code == 200
    assert handoff_post_response.json()["ok"] is True

    handoff_get_response = client.get(f"/api/v1/officer/handoff/{incident_id}")
    assert handoff_get_response.status_code == 200
    assert handoff_get_response.json()["note_count"] >= 1

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

    briefing_response = client.post(
        "/api/v1/ai/briefing",
        json={
            "incident_id": incident_id,
            "unit_id": assignment_payload["recommended_unit_id"],
        },
    )
    assert briefing_response.status_code == 200
    assert briefing_response.json()["risk_score"] >= 1

    disposition_draft_response = client.post(
        "/api/v1/ai/disposition-draft",
        json={
            "incident_id": incident_id,
            "unit_id": assignment_payload["recommended_unit_id"],
        },
    )
    assert disposition_draft_response.status_code == 200
    assert disposition_draft_response.json()["recommended_disposition_code"]

    command_response = client.get("/api/v1/command/overview")
    assert command_response.status_code == 200
    command_payload = command_response.json()
    assert command_payload["active_incidents"] >= 1
    assert command_payload["units_busy"] >= 1

    trend_response = client.get("/api/v1/command/trends", params={"periods": 6})
    assert trend_response.status_code == 200
    trend_payload = trend_response.json()
    assert trend_payload["periods"] == 6
    assert "average_response_minutes" in trend_payload["metrics"]

    executive_brief_response = client.get("/api/v1/command/executive-brief", params={"periods": 6})
    assert executive_brief_response.status_code == 200
    executive_brief_payload = executive_brief_response.json()
    assert "overview" in executive_brief_payload
    assert "priority_radar" in executive_brief_payload

    draft_response = client.post(
        "/api/v1/reporting/draft",
        json={
            "incident_id": incident_id,
            "unit_id": assignment_payload["recommended_unit_id"],
            "narrative": "Initial report draft pending supervisor review.",
            "structured_fields": {"case_type": "Domestic"},
            "template_id": "DOMESTIC_RESPONSE",
            "dictation_metadata": {"segments": 2, "seconds": 34},
            "status": "DRAFT",
        },
    )
    assert draft_response.status_code == 200
    draft_payload = draft_response.json()
    report_id = draft_payload["report_id"]

    template_response = client.get("/api/v1/reporting/templates", params={"incident_id": incident_id})
    assert template_response.status_code == 200
    template_payload = template_response.json()
    assert any(item["template_id"] == "DOMESTIC_RESPONSE" for item in template_payload["templates"])

    apply_template_response = client.post(
        "/api/v1/reporting/template/apply",
        json={
            "incident_id": incident_id,
            "unit_id": assignment_payload["recommended_unit_id"],
            "template_id": "DOMESTIC_RESPONSE",
            "include_timeline": True,
        },
    )
    assert apply_template_response.status_code == 200
    assert "Incident" in apply_template_response.json()["narrative"]

    evidence_response = client.post(
        "/api/v1/reporting/evidence",
        json={
            "incident_id": incident_id,
            "unit_id": assignment_payload["recommended_unit_id"],
            "evidence_type": "photo",
            "uri": "evidence://incidents/test/photo-88",
        },
    )
    assert evidence_response.status_code == 200
    assert len(evidence_response.json()["evidence_links"]) >= 1

    call_history_with_docs = client.get(
        f"/api/v1/officer/call-history/{assignment_payload['recommended_unit_id']}",
        params={"limit": 25},
    )
    assert call_history_with_docs.status_code == 200
    history_with_docs_payload = call_history_with_docs.json()
    history_with_docs_item = next(
        (item for item in history_with_docs_payload["calls"] if item["incident_id"] == incident_id),
        None,
    )
    assert history_with_docs_item is not None
    assert any(doc["doc_type"] == "REPORT_DRAFT" for doc in history_with_docs_item["documents"])
    assert any(doc["doc_type"].startswith("EVIDENCE_") for doc in history_with_docs_item["documents"])

    report_audit_response = client.post(
        "/api/v1/reporting/audit",
        json={
            "incident_id": incident_id,
            "unit_id": assignment_payload["recommended_unit_id"],
            "narrative": "Parties contacted on scene.",
            "structured_fields": {"case_type": "Domestic"},
        },
    )
    assert report_audit_response.status_code == 200
    report_audit_payload = report_audit_response.json()
    assert report_audit_payload["recommendation_count"] >= 1
    assert any(rec["recommendation_id"] == "dv-separation" for rec in report_audit_payload["recommendations"])
    assert any(rec["recommendation_id"] == "dv-marcy-card" for rec in report_audit_payload["recommendations"])

    readiness_before_disposition = client.get(
        f"/api/v1/reporting/readiness/{incident_id}",
        params={"unit_id": assignment_payload["recommended_unit_id"]},
    )
    assert readiness_before_disposition.status_code == 200
    assert readiness_before_disposition.json()["has_disposition"] is False

    hub_response = client.get("/api/v1/reporting/hub")
    assert hub_response.status_code == 200
    hub_payload = hub_response.json()
    assert any(draft["report_id"] == report_id for draft in hub_payload["drafts"])

    review_queue_response = client.get("/api/v1/reporting/review-queue")
    assert review_queue_response.status_code == 200
    assert review_queue_response.json()["review_count"] >= 1
    assert any(item["report_id"] == report_id for item in review_queue_response.json()["reports"])

    review_decision_response = client.post(
        "/api/v1/reporting/review",
        json={
            "report_id": report_id,
            "reviewer_id": "SUP-101",
            "decision": "APPROVE",
            "notes": "Narrative and evidence complete.",
        },
    )
    assert review_decision_response.status_code == 200
    assert review_decision_response.json()["review_status"] == "APPROVED"

    review_queue_after_approval = client.get("/api/v1/reporting/review-queue")
    assert review_queue_after_approval.status_code == 200
    assert all(item["report_id"] != report_id for item in review_queue_after_approval.json()["reports"])

    reporting_metrics_response = client.get("/api/v1/reporting/metrics")
    assert reporting_metrics_response.status_code == 200
    assert reporting_metrics_response.json()["total_reports"] >= 1

    reporting_response = client.post(
        "/api/v1/reporting/rms",
        json={
            "incident_id": incident_id,
            "unit_id": assignment_payload["recommended_unit_id"],
            "narrative": "Unit arrived on scene and stabilized reporting parties.",
            "field_updates": {"disposition": "On-scene mediation"},
            "template_id": "DOMESTIC_RESPONSE",
            "dictation_metadata": {"segments": 4, "seconds": 81},
        },
    )
    assert reporting_response.status_code == 200
    report_payload = reporting_response.json()
    assert report_payload["incident_context"]["address"] == "901 Orange St, Redlands"
    assert any(event["event"] == "unit_assigned" for event in report_payload["audit_trail"])
    assert report_payload["validation"]["has_disposition"] is False

    ai_report_response = client.post(
        "/api/v1/ai/report",
        json={
            "incident_id": incident_id,
            "unit_id": assignment_payload["recommended_unit_id"],
            "narrative": "Separated parties and assessed injuries.",
            "tone": "command",
        },
    )
    assert ai_report_response.status_code == 200
    assert "responded to" in ai_report_response.json()["improved_narrative"]

    fetch_draft_response = client.get(f"/api/v1/reporting/draft/{report_id}")
    assert fetch_draft_response.status_code == 200
    assert fetch_draft_response.json()["status"] in {"DRAFT", "SUBMITTED", "READY_FOR_COMMAND", "NEEDS_REVISION"}
    assert len(fetch_draft_response.json().get("evidence_links", [])) >= 1

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

    reporting_after_disposition = client.post(
        "/api/v1/reporting/rms",
        json={
            "incident_id": incident_id,
            "unit_id": assignment_payload["recommended_unit_id"],
            "narrative": "Disposition complete. Case closed.",
            "field_updates": {"disposition": "WARNING_ISSUED"},
        },
    )
    assert reporting_after_disposition.status_code == 200
    assert reporting_after_disposition.json()["validation"]["has_disposition"] is True

    readiness_after_disposition = client.get(
        f"/api/v1/reporting/readiness/{incident_id}",
        params={"unit_id": assignment_payload["recommended_unit_id"]},
    )
    assert readiness_after_disposition.status_code == 200
    assert readiness_after_disposition.json()["has_disposition"] is True

    call_history_after_close = client.get(
        f"/api/v1/officer/call-history/{assignment_payload['recommended_unit_id']}",
        params={"limit": 25},
    )
    assert call_history_after_close.status_code == 200
    history_after_close_payload = call_history_after_close.json()
    history_after_close_item = next(
        (item for item in history_after_close_payload["calls"] if item["incident_id"] == incident_id),
        None,
    )
    assert history_after_close_item is not None
    assert history_after_close_item["status"] == "CLOSED"
    assert history_after_close_item["disposition_code"] == "WARNING_ISSUED"

    quick_actions_after_disposition = client.get(
        f"/api/v1/officer/quick-actions/{incident_id}",
        params={"unit_id": assignment_payload["recommended_unit_id"]},
    )
    assert quick_actions_after_disposition.status_code == 200
    assert quick_actions_after_disposition.json()["has_disposition"] is True

    queue_after_close = client.get("/api/v1/dispatch/queue")
    assert queue_after_close.status_code == 200
    assert all(item["incident_id"] != incident_id for item in queue_after_close.json()["incidents"])

    mock_seed_response = client.post(
        "/api/v1/intake/mock-seed",
        json={
            "units_count": 8,
            "incidents_count": 10,
            "clear_existing": False,
            "auto_assign": True,
        },
    )
    assert mock_seed_response.status_code == 200
    mock_seed_payload = mock_seed_response.json()
    assert mock_seed_payload["units_created"] >= 8
    assert mock_seed_payload["incidents_created"] >= 10

    patrol_start_response = client.post(
        "/api/v1/intake/patrol-sim/start",
        json={
            "clear_existing": True,
            "tick_seconds": 5,
            "initial_calls": 4,
        },
    )
    assert patrol_start_response.status_code == 200
    patrol_start_payload = patrol_start_response.json()
    assert patrol_start_payload["started"] is True
    assert patrol_start_payload["dispatchable_units"] == 10
    assert patrol_start_payload["senior_units"] == 2
    assert patrol_start_payload["beats_active"] == [1, 2, 3, 4, 5]
    assert patrol_start_payload["call_types_loaded"] >= 50
    assert patrol_start_payload["call_locations_loaded"] >= 50

    patrol_status_response = client.get("/api/v1/intake/patrol-sim/status")
    assert patrol_status_response.status_code == 200
    patrol_status_payload = patrol_status_response.json()
    assert patrol_status_payload["enabled"] is True
    assert patrol_status_payload["dispatchable_units"] == 10
    assert patrol_status_payload["senior_units"] == 2

    patrol_map_response = client.get("/api/v1/map/overview")
    assert patrol_map_response.status_code == 200
    patrol_map_payload = patrol_map_response.json()
    assert len(patrol_map_payload["beats"]) == 5
    assert patrol_map_payload["patrol_simulation"]["enabled"] is True

    patrol_board_response = client.get("/api/v1/dispatch/availability-board")
    assert patrol_board_response.status_code == 200
    patrol_board_payload = patrol_board_response.json()
    all_board_units = patrol_board_payload["available_units"] + patrol_board_payload["unavailable_units"]
    assert any(unit["dispatchable"] is False for unit in all_board_units)

    patrol_intake_response = client.post(
        "/api/v1/intake/calls",
        json={
            "caller_name": "Beat test caller",
            "phone": "555-8900",
            "call_text": "Domestic disturbance in progress near beat boundary.",
            "address": "210 University St, Redlands",
            "lat": 34.0605,
            "lon": -117.1691,
        },
    )
    assert patrol_intake_response.status_code == 200
    patrol_incident_id = patrol_intake_response.json()["call_id"]

    patrol_assign_response = client.post(
        "/api/v1/dispatch/assign",
        json={
            "incident_id": patrol_incident_id,
            "required_skills": ["Crisis"],
            "incident_lat": 34.0605,
            "incident_lon": -117.1691,
        },
    )
    assert patrol_assign_response.status_code == 200
    patrol_assignment_payload = patrol_assign_response.json()
    assert patrol_assignment_payload["recommended_unit_id"] not in {"u-sgt-10", "u-lt-20"}
    assert patrol_assignment_payload["recommended_unit_id"] != "UNAVAILABLE"

    robbery_intake_response = client.post(
        "/api/v1/intake/calls",
        json={
            "caller_name": "Store Clerk",
            "phone": "555-9111",
            "call_text": "Strong armed robbery in progress, suspect grabbed cash and fled on foot.",
            "address": "99 State St, Redlands",
            "lat": 34.0587,
            "lon": -117.1831,
        },
    )
    assert robbery_intake_response.status_code == 200
    robbery_incident_id = robbery_intake_response.json()["call_id"]

    robbery_queue_response = client.get("/api/v1/dispatch/queue")
    assert robbery_queue_response.status_code == 200
    robbery_record = next(
        (item for item in robbery_queue_response.json()["incidents"] if item["incident_id"] == robbery_incident_id),
        None,
    )
    assert robbery_record is not None
    assert robbery_record["primary_code"] == "PC 211"
    assert robbery_record["crime_label"] == "Robbery"

    robbery_assign_response = client.post(
        "/api/v1/dispatch/assign",
        json={
            "incident_id": robbery_incident_id,
            "required_skills": ["Crisis"],
            "incident_lat": 34.0587,
            "incident_lon": -117.1831,
        },
    )
    assert robbery_assign_response.status_code == 200

    board_after_robbery = client.get("/api/v1/dispatch/availability-board")
    assert board_after_robbery.status_code == 200
    board_rows = board_after_robbery.json()["unavailable_units"]
    assert any("PC 211 Robbery" in row.get("call_display", "") for row in board_rows)

    policy_search_response = client.get("/api/v1/intel/policy/search", params={"query": "taser", "sort_by": "relevance"})
    assert policy_search_response.status_code == 200
    policy_search_payload = policy_search_response.json()
    assert policy_search_payload["result_count"] >= 1
    assert policy_search_payload["library_profile"]["source_agency"] == "East Palo Alto Police Department"
    assert any("Taser" in item["title"] for item in policy_search_payload["results"])

    taser_policy_response = client.get("/api/v1/intel/policy/2.245")
    assert taser_policy_response.status_code == 200
    taser_policy_payload = taser_policy_response.json()
    assert "Cross-draw" in taser_policy_payload["body"] or "Cross-draw" in taser_policy_payload["summary"]

    code_search_response = client.get("/api/v1/intel/code/search", params={"query": "robbery", "sort_by": "relevance"})
    assert code_search_response.status_code == 200
    code_search_payload = code_search_response.json()
    assert code_search_payload["best_guess"]["section"] == "211"

    strong_arm_search = client.get("/api/v1/intel/code/search", params={"query": "strong armed", "sort_by": "relevance"})
    assert strong_arm_search.status_code == 200
    strong_arm_payload = strong_arm_search.json()
    assert strong_arm_payload["best_guess"]["section"] == "211"

    code_detail_response = client.get("/api/v1/intel/code/PC-211")
    assert code_detail_response.status_code == 200
    assert code_detail_response.json()["title"] == "Robbery"
    assert code_detail_response.json()["official_source_connected"] is True
    assert "felonious taking" in code_detail_response.json()["official_source"]["section_text"].lower()

    robbery_audit_response = client.post(
        "/api/v1/reporting/audit",
        json={
            "incident_id": robbery_incident_id,
            "unit_id": robbery_assign_response.json()["recommended_unit_id"],
            "narrative": "Officers contacted suspect and victim and gathered statements.",
            "structured_fields": {"case_type": "Robbery"},
        },
    )
    assert robbery_audit_response.status_code == 200
    robbery_audit_payload = robbery_audit_response.json()
    assert any(rec["recommendation_id"] == "robbery-force-fear" for rec in robbery_audit_payload["recommendations"])

    live_start_response = client.post(
        "/api/v1/intake/patrol-sim/start",
        json={
            "clear_existing": True,
            "live_mode": True,
            "tick_seconds": 5,
            "initial_calls": 2,
            "logged_in_unit_id": "u-day-3",
            "min_call_interval_seconds": 30,
            "max_call_interval_seconds": 120,
            "max_active_calls": 10,
            "min_call_duration_seconds": 60,
            "max_call_duration_seconds": 600,
        },
    )
    assert live_start_response.status_code == 200
    live_start_payload = live_start_response.json()
    assert live_start_payload["profile"] == "LIVE_DEV"
    assert live_start_payload["logged_in_unit_id"] == "u-day-3"
    assert live_start_payload["max_active_calls"] == 10
    assert live_start_payload["call_types_loaded"] >= 50
    assert live_start_payload["call_locations_loaded"] >= 50

    live_status_response = client.get("/api/v1/intake/patrol-sim/status")
    assert live_status_response.status_code == 200
    live_status_payload = live_status_response.json()
    assert live_status_payload["enabled"] is True
    assert live_status_payload["profile"] == "LIVE_DEV"
    assert live_status_payload["logged_in_unit_id"] == "u-day-3"
    assert live_status_payload["call_types_loaded"] >= 50
    assert live_status_payload["call_locations_loaded"] >= 50

    live_tick_response = client.post("/api/v1/intake/patrol-sim/tick")
    assert live_tick_response.status_code == 200
    assert "advanced" in live_tick_response.json()

    live_intake_response = client.post(
        "/api/v1/intake/calls",
        json={
            "caller_name": "Live mode caller",
            "phone": "555-7000",
            "call_text": "Suspicious person peeking into parked cars.",
            "address": "355 Pearl Ave, Redlands",
            "lat": 34.0498,
            "lon": -117.1707,
        },
    )
    assert live_intake_response.status_code == 200
    live_incident_id = live_intake_response.json()["call_id"]

    excluded_assign_response = client.post(
        "/api/v1/dispatch/assign",
        json={
            "incident_id": live_incident_id,
            "required_skills": ["Crisis"],
            "incident_lat": 34.0498,
            "incident_lon": -117.1707,
            "exclude_unit_ids": ["u-day-3"],
        },
    )
    assert excluded_assign_response.status_code == 200
    assert excluded_assign_response.json()["recommended_unit_id"] != "u-day-3"
