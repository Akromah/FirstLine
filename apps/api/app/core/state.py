from __future__ import annotations

from datetime import datetime, timezone
from threading import RLock

from app.schemas.common import IncidentSummary, UnitSummary


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_utc(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


class InMemoryState:
    def __init__(self) -> None:
        self._lock = RLock()
        self._incident_sequence = 1001
        self._message_sequence = 78000
        self._report_sequence = 5200

        self._units: dict[str, UnitSummary] = {
            "u-201": UnitSummary(
                unit_id="u-201",
                callsign="2A21",
                status="AVAILABLE",
                coordinates={"lat": 34.0567, "lon": -117.1956},
                skills=["Spanish", "Crisis"],
                workload_score=28,
                fatigue_score=35,
            ),
            "u-507": UnitSummary(
                unit_id="u-507",
                callsign="5L07",
                status="EN_ROUTE",
                coordinates={"lat": 34.0489, "lon": -117.1848},
                skills=["K9"],
                workload_score=64,
                fatigue_score=50,
            ),
            "u-310": UnitSummary(
                unit_id="u-310",
                callsign="3S10",
                status="AVAILABLE",
                coordinates={"lat": 34.0624, "lon": -117.1702},
                skills=["SWAT", "Spanish"],
                workload_score=42,
                fatigue_score=30,
            ),
            "u-404": UnitSummary(
                unit_id="u-404",
                callsign="4R04",
                status="AVAILABLE",
                coordinates={"lat": 34.0518, "lon": -117.1629},
                skills=["Medical", "Crisis"],
                workload_score=21,
                fatigue_score=24,
            ),
        }

        self._incidents: dict[str, dict] = {}
        self._messages: list[dict] = []
        self._report_drafts: dict[str, dict] = {}
        self._person_records: list[dict] = []
        self._firearms_registry: list[dict] = []
        self._warrant_registry: list[dict] = []
        self._seed_initial_incident()
        self._seed_reference_data()

    def _seed_initial_incident(self) -> None:
        now = utc_now_iso()
        incident_id = "INC-240118-1001"
        self._incidents[incident_id] = {
            "incident_id": incident_id,
            "call_type": "Domestic",
            "priority": 78,
            "address": "35 Cajon St, Redlands",
            "coordinates": {"lat": 34.0556, "lon": -117.1825},
            "status": "DISPATCHED",
            "assigned_unit_id": "u-507",
            "predicted_eta_minutes": 6,
            "confidence": 0.82,
            "duplicate_call_ids": [],
            "required_skills": ["Crisis"],
            "caller_name": "Unknown",
            "phone": None,
            "call_text": "Neighbors reporting shouting and possible domestic disturbance.",
            "created_at": now,
            "timeline": [
                {"event": "call_created", "time": now},
                {"event": "priority_scored", "time": now},
                {"event": "unit_assigned", "time": now, "unit_id": "u-507"},
            ],
            "disposition": None,
        }

    def _seed_reference_data(self) -> None:
        self._person_records = [
            {
                "person_id": "P-10012",
                "full_name": "Rosa Martinez",
                "dob": "1992-03-11",
                "address": "901 Orange St, Redlands",
                "aliases": ["Rosie Martinez"],
                "flags": ["Prior domestic witness", "Spanish primary"],
            },
            {
                "person_id": "P-10841",
                "full_name": "Brandon Keller",
                "dob": "1987-10-02",
                "address": "35 Cajon St, Redlands",
                "aliases": ["B. Keller"],
                "flags": ["Prior weapons arrest"],
            },
            {
                "person_id": "P-11355",
                "full_name": "Alyssa Nguyen",
                "dob": "1998-07-26",
                "address": "441 Citrus Ave, Redlands",
                "aliases": [],
                "flags": ["Mental health response history"],
            },
        ]
        self._firearms_registry = [
            {
                "registration_id": "FR-34002",
                "person_id": "P-10841",
                "owner_name": "Brandon Keller",
                "weapon_type": "Handgun",
                "serial_number": "K7P-9912-CA",
                "status": "ACTIVE",
            },
            {
                "registration_id": "FR-34193",
                "person_id": "P-10012",
                "owner_name": "Rosa Martinez",
                "weapon_type": "Shotgun",
                "serial_number": "RM-5501-8N",
                "status": "ACTIVE",
            },
        ]
        self._warrant_registry = [
            {
                "warrant_id": "W-88219",
                "person_id": "P-10841",
                "subject_name": "Brandon Keller",
                "severity": "FELONY",
                "status": "ACTIVE",
                "reason": "Failure to appear - weapons case",
            },
            {
                "warrant_id": "W-88003",
                "person_id": "P-11355",
                "subject_name": "Alyssa Nguyen",
                "severity": "MISDEMEANOR",
                "status": "SERVICED",
                "reason": "Contempt",
            },
        ]

    def _next_incident_id(self) -> str:
        self._incident_sequence += 1
        date_part = datetime.now(timezone.utc).strftime("%y%m%d")
        return f"INC-{date_part}-{self._incident_sequence:04d}"

    def _next_report_id(self) -> str:
        self._report_sequence += 1
        date_part = datetime.now(timezone.utc).strftime("%y%m%d")
        return f"RPT-{date_part}-{self._report_sequence:04d}"

    def list_units(self) -> list[UnitSummary]:
        with self._lock:
            return [unit.model_copy(deep=True) for unit in self._units.values()]

    def get_unit(self, unit_id: str) -> UnitSummary | None:
        with self._lock:
            unit = self._units.get(unit_id)
            return unit.model_copy(deep=True) if unit else None

    def update_unit_status(self, unit_id: str, status: str) -> bool:
        with self._lock:
            unit = self._units.get(unit_id)
            if not unit:
                return False
            unit.status = status
            return True

    def find_duplicate_incidents(self, normalized_address: str) -> list[str]:
        with self._lock:
            now = datetime.now(timezone.utc)
            matches: list[str] = []
            for incident in self._incidents.values():
                if incident["address"].lower() != normalized_address.lower():
                    continue
                created_at = parse_utc(incident["created_at"])
                if (now - created_at).total_seconds() <= 30 * 60:
                    matches.append(incident["incident_id"])
            return matches[:3]

    def create_incident(
        self,
        caller_name: str,
        phone: str | None,
        call_text: str,
        address: str,
        coordinates: dict[str, float],
        call_type: str,
        priority: int,
        duplicate_call_ids: list[str],
        rationale: list[str],
        required_skills: list[str],
    ) -> dict:
        with self._lock:
            incident_id = self._next_incident_id()
            now = utc_now_iso()
            incident = {
                "incident_id": incident_id,
                "call_type": call_type,
                "priority": priority,
                "address": address,
                "coordinates": coordinates,
                "status": "NEW",
                "assigned_unit_id": None,
                "predicted_eta_minutes": None,
                "confidence": None,
                "duplicate_call_ids": duplicate_call_ids,
                "required_skills": required_skills,
                "caller_name": caller_name,
                "phone": phone,
                "call_text": call_text,
                "created_at": now,
                "timeline": [
                    {"event": "call_created", "time": now},
                    {"event": "priority_scored", "time": now, "score": priority},
                    {"event": "intake_rationale", "time": now, "reasons": rationale},
                ],
                "disposition": None,
            }
            self._incidents[incident_id] = incident
            return incident.copy()

    def list_incident_summaries(self, include_closed: bool = False) -> list[IncidentSummary]:
        with self._lock:
            incidents = sorted(
                self._incidents.values(),
                key=lambda item: item["created_at"],
                reverse=True,
            )
            summaries: list[IncidentSummary] = []
            for incident in incidents:
                if not include_closed and incident["status"] == "CLOSED":
                    continue
                summaries.append(
                    IncidentSummary(
                        incident_id=incident["incident_id"],
                        call_type=incident["call_type"],
                        priority=incident["priority"],
                        address=incident["address"],
                        coordinates=incident["coordinates"],
                        status=incident["status"],
                    )
                )
            return summaries

    def get_incident(self, incident_id: str) -> dict | None:
        with self._lock:
            incident = self._incidents.get(incident_id)
            return incident.copy() if incident else None

    def get_assigned_incidents_for_unit(self, unit_id: str) -> list[dict]:
        with self._lock:
            output: list[dict] = []
            for incident in self._incidents.values():
                if incident.get("assigned_unit_id") != unit_id:
                    continue
                if incident["status"] == "CLOSED":
                    continue
                output.append(incident.copy())
            output.sort(key=lambda item: item["created_at"], reverse=True)
            return output

    def assign_incident(
        self,
        incident_id: str,
        unit_id: str,
        predicted_eta_minutes: int,
        confidence: float,
        reasons: list[str],
    ) -> bool:
        with self._lock:
            incident = self._incidents.get(incident_id)
            unit = self._units.get(unit_id)
            if not incident or not unit:
                return False
            now = utc_now_iso()
            incident["status"] = "DISPATCHED"
            incident["assigned_unit_id"] = unit_id
            incident["predicted_eta_minutes"] = predicted_eta_minutes
            incident["confidence"] = confidence
            incident["timeline"].append(
                {
                    "event": "unit_assigned",
                    "time": now,
                    "unit_id": unit_id,
                    "reasons": reasons,
                }
            )
            unit.status = "EN_ROUTE"
            return True

    def record_officer_action(self, incident_id: str, unit_id: str, action: str) -> bool:
        with self._lock:
            incident = self._incidents.get(incident_id)
            if not incident:
                return False
            now = utc_now_iso()
            normalized_action = action.strip().upper()
            incident["timeline"].append(
                {
                    "event": "officer_action",
                    "time": now,
                    "unit_id": unit_id,
                    "action": normalized_action,
                }
            )
            if normalized_action in {"ARRIVED", "ON_SCENE"}:
                incident["status"] = "ON_SCENE"
                unit = self._units.get(unit_id)
                if unit:
                    unit.status = "ON_SCENE"
            if normalized_action in {"CLEAR", "CLEARED"}:
                incident["status"] = "CLOSED"
                unit = self._units.get(unit_id)
                if unit:
                    unit.status = "AVAILABLE"
            return True

    def set_incident_disposition(
        self,
        incident_id: str,
        unit_id: str,
        disposition_code: str,
        summary: str,
        arrest_made: bool,
        citation_issued: bool,
        force_used: bool,
    ) -> dict | None:
        with self._lock:
            incident = self._incidents.get(incident_id)
            if not incident:
                return None
            now = utc_now_iso()
            incident["status"] = "CLOSED"
            incident["disposition"] = {
                "disposition_code": disposition_code,
                "summary": summary,
                "arrest_made": arrest_made,
                "citation_issued": citation_issued,
                "force_used": force_used,
                "closed_by_unit": unit_id,
                "closed_at": now,
            }
            incident["timeline"].append(
                {
                    "event": "disposition_finalized",
                    "time": now,
                    "unit_id": unit_id,
                    "code": disposition_code,
                    "summary": summary,
                }
            )
            unit = self._units.get(unit_id)
            if unit:
                unit.status = "AVAILABLE"
            return incident.copy()

    def upsert_report_draft(
        self,
        incident_id: str,
        unit_id: str,
        narrative: str,
        structured_fields: dict[str, str],
        status: str = "DRAFT",
    ) -> dict:
        with self._lock:
            now = utc_now_iso()
            existing = None
            for draft in self._report_drafts.values():
                if draft["incident_id"] == incident_id and draft["unit_id"] == unit_id and draft["status"] != "SUBMITTED":
                    existing = draft
                    break

            if existing:
                existing["narrative"] = narrative
                existing["structured_fields"] = structured_fields
                existing["status"] = status
                existing["updated_at"] = now
                report_id = existing["report_id"]
            else:
                report_id = self._next_report_id()
                self._report_drafts[report_id] = {
                    "report_id": report_id,
                    "incident_id": incident_id,
                    "unit_id": unit_id,
                    "narrative": narrative,
                    "structured_fields": structured_fields,
                    "status": status,
                    "created_at": now,
                    "updated_at": now,
                }
            self._incidents.get(incident_id, {}).get("timeline", []).append(
                {
                    "event": "report_draft_saved",
                    "time": now,
                    "unit_id": unit_id,
                    "status": status,
                }
            )
            return self._report_drafts[report_id].copy()

    def get_report_draft(self, report_id: str) -> dict | None:
        with self._lock:
            draft = self._report_drafts.get(report_id)
            return draft.copy() if draft else None

    def list_report_drafts(self, incident_id: str | None = None) -> list[dict]:
        with self._lock:
            drafts = list(self._report_drafts.values())
            if incident_id:
                drafts = [draft for draft in drafts if draft["incident_id"] == incident_id]
            drafts.sort(key=lambda item: item["updated_at"], reverse=True)
            return [draft.copy() for draft in drafts]

    def build_reporting_hub(self) -> dict:
        with self._lock:
            open_incidents = [
                incident
                for incident in self._incidents.values()
                if incident["status"] in {"ON_SCENE", "CLOSED", "DISPATCHED"}
            ]
            missing_reports: list[dict] = []
            for incident in open_incidents:
                has_report = any(
                    draft["incident_id"] == incident["incident_id"] and draft["status"] in {"DRAFT", "READY", "SUBMITTED"}
                    for draft in self._report_drafts.values()
                )
                if not has_report:
                    missing_reports.append(
                        {
                            "incident_id": incident["incident_id"],
                            "call_type": incident["call_type"],
                            "priority": incident["priority"],
                            "status": incident["status"],
                            "assigned_unit_id": incident.get("assigned_unit_id"),
                        }
                    )

            return {
                "generated_at": utc_now_iso(),
                "drafts": self.list_report_drafts(),
                "missing_reports": missing_reports,
            }

    def search_public_safety_records(self, query: str) -> dict:
        with self._lock:
            token = query.strip().lower()
            if not token:
                return {"records": [], "firearms": [], "warrants": []}

            records = [
                row.copy()
                for row in self._person_records
                if token in row["full_name"].lower()
                or token in row["address"].lower()
                or token in row["person_id"].lower()
                or any(token in alias.lower() for alias in row["aliases"])
            ]
            firearms = [
                row.copy()
                for row in self._firearms_registry
                if token in row["owner_name"].lower()
                or token in row["serial_number"].lower()
                or token in row["person_id"].lower()
            ]
            warrants = [
                row.copy()
                for row in self._warrant_registry
                if token in row["subject_name"].lower()
                or token in row["warrant_id"].lower()
                or token in row["person_id"].lower()
            ]

            return {"records": records, "firearms": firearms, "warrants": warrants}

    def get_person_public_safety_profile(self, person_id: str) -> dict | None:
        with self._lock:
            person = next((item for item in self._person_records if item["person_id"] == person_id), None)
            if not person:
                return None
            firearms = [item.copy() for item in self._firearms_registry if item["person_id"] == person_id]
            warrants = [item.copy() for item in self._warrant_registry if item["person_id"] == person_id]
            return {
                "person": person.copy(),
                "firearms": firearms,
                "warrants": warrants,
                "officer_safety_flags": person["flags"],
            }

    def generate_ai_assist(self, incident_id: str, prompt: str | None = None) -> dict | None:
        with self._lock:
            incident = self._incidents.get(incident_id)
            if not incident:
                return None
            risk = self.build_risk_profile(incident_id)
            unit_id = incident.get("assigned_unit_id")
            unit = self._units.get(unit_id) if unit_id else None
            recommended_disposition = "REPORT_ONLY"
            if incident["priority"] >= 85:
                recommended_disposition = "ARREST_MADE" if "weapon" in incident["call_text"].lower() else "REFERRED"
            elif incident["priority"] >= 65:
                recommended_disposition = "WARNING_ISSUED"

            summary = (
                f"{incident['call_type']} call at {incident['address']} priority {incident['priority']}. "
                f"Status {incident['status']}."
            )
            if unit:
                summary += f" Assigned unit {unit.callsign} ({unit.unit_id})."
            if prompt:
                summary += f" Operator prompt: {prompt.strip()}"

            return {
                "incident_id": incident_id,
                "generated_at": utc_now_iso(),
                "summary": summary,
                "recommended_disposition_code": recommended_disposition,
                "next_actions": [
                    "Confirm involved parties and IDs.",
                    "Run warrants and firearms checks for named subjects.",
                    "Capture final scene narrative and witness statements.",
                ],
                "officer_safety_alerts": risk["safety_alerts"] if risk else [],
                "confidence": round(min(0.97, 0.63 + (incident["priority"] / 300)), 2),
            }

    def add_message(self, from_unit: str, to_unit: str, body: str) -> dict:
        with self._lock:
            self._message_sequence += 1
            now = utc_now_iso()
            message = {
                "message_id": f"msg-{self._message_sequence}",
                "from_unit": from_unit,
                "to_unit": to_unit,
                "body": body,
                "sent_at": now,
            }
            self._messages.append(message)
            return message.copy()

    def build_command_snapshot(self) -> dict:
        with self._lock:
            incidents = list(self._incidents.values())
            active_incidents = [i for i in incidents if i["status"] != "CLOSED"]
            pending_calls = [i for i in incidents if i["status"] == "NEW"]
            assigned_incidents = [i for i in incidents if i.get("assigned_unit_id")]
            units = list(self._units.values())
            busy_units = [u for u in units if u.status not in {"AVAILABLE", "OFF_DUTY"}]
            high_priority = [i for i in active_incidents if i["priority"] >= 70]

            average_response_minutes = 0.0
            if assigned_incidents:
                eta_values = [i["predicted_eta_minutes"] for i in assigned_incidents if i["predicted_eta_minutes"]]
                if eta_values:
                    average_response_minutes = round(sum(eta_values) / len(eta_values), 1)

            total_calls = max(1, len(incidents))
            with_duplicates = sum(1 for i in incidents if i["duplicate_call_ids"])
            acceptance_rate = min(0.99, round(0.72 + (len(assigned_incidents) * 0.02), 2))
            duplicate_rate = round(with_duplicates / total_calls, 2)

            return {
                "generated_at": utc_now_iso(),
                "active_incidents": len(active_incidents),
                "pending_calls": len(pending_calls),
                "units_available": sum(1 for u in units if u.status == "AVAILABLE"),
                "units_busy": len(busy_units),
                "average_response_minutes": average_response_minutes,
                "high_risk_zones": [
                    {"name": "Downtown Grid", "severity": "high", "change_24h": f"+{8 + len(high_priority)}%"},
                    {"name": "University District", "severity": "medium", "change_24h": "+4%"},
                ],
                "dispatch_ai": {
                    "recommendation_acceptance_rate": acceptance_rate,
                    "duplicate_call_merge_rate": duplicate_rate,
                    "transcription_uptime": 0.996,
                },
            }

    def get_incident_timeline(self, incident_id: str) -> list[dict]:
        with self._lock:
            incident = self._incidents.get(incident_id)
            if not incident:
                return []
            return [event.copy() for event in incident["timeline"]]

    def build_risk_profile(self, incident_id: str) -> dict | None:
        with self._lock:
            incident = self._incidents.get(incident_id)
            if not incident:
                return None

            same_address = [
                item
                for item in self._incidents.values()
                if item["address"].lower() == incident["address"].lower()
            ]
            high_priority_history = [item for item in same_address if item["priority"] >= 70]
            mental_health_markers = ["mental", "suicidal", "schizo", "hallucination", "5150"]
            text = incident["call_text"].lower()
            mental_pattern = any(marker in text for marker in mental_health_markers)

            risk_score = min(
                100,
                int(
                    (incident["priority"] * 0.65)
                    + (len(same_address) * 8)
                    + (len(high_priority_history) * 5)
                    + (10 if incident["call_type"] == "Domestic" else 0)
                    + (12 if mental_pattern else 0)
                ),
            )
            safety_alerts: list[str] = []
            if incident["priority"] >= 85:
                safety_alerts.append("High-priority immediate response advised.")
            if len(high_priority_history) >= 2:
                safety_alerts.append("Address has repeated high-priority incident history.")
            if "weapon" in text or "gun" in text:
                safety_alerts.append("Possible weapon context detected.")

            return {
                "incident_id": incident_id,
                "address": incident["address"],
                "risk_score": risk_score,
                "history_count": len(same_address),
                "high_priority_history_count": len(high_priority_history),
                "mental_health_pattern_flag": mental_pattern,
                "safety_alerts": safety_alerts,
            }


state = InMemoryState()
