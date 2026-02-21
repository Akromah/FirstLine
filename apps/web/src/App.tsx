
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";

type Coordinates = { lat: number; lon: number };
type IncidentSummary = { incident_id: string; call_type: string; priority: number; address: string; coordinates: Coordinates; status: string };
type UnitSummary = { unit_id: string; callsign: string; status: string; coordinates: Coordinates; skills: string[]; workload_score: number; fatigue_score: number };
type ReportDraft = { report_id: string; incident_id: string; unit_id: string; narrative: string; status: string; updated_at: string };
type ReportingHub = { drafts: ReportDraft[]; missing_reports: Array<{ incident_id: string; call_type: string; priority: number }> };

type LookupResult = {
  records: Array<{ person_id: string; full_name: string; address: string; flags: string[] }>;
  firearms: Array<{ registration_id: string; owner_name: string; weapon_type: string; status: string }>;
  warrants: Array<{ warrant_id: string; subject_name: string; severity: string; status: string; reason: string }>;
};

type PersonProfile = {
  person: { person_id: string; full_name: string; address: string };
  officer_safety_flags: string[];
  firearms: Array<{ registration_id: string; weapon_type: string; status: string }>;
  warrants: Array<{ warrant_id: string; severity: string; status: string; reason: string }>;
};

type AIAssist = {
  summary: string;
  recommended_disposition_code: string;
  next_actions: string[];
  officer_safety_alerts: string[];
  confidence: number;
};

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";
const MAP_STYLE_URL =
  import.meta.env.VITE_MAP_STYLE_URL ?? "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return (await res.json()) as T;
}

function parseSkills(raw: string): string[] {
  return raw.split(",").map((v) => v.trim()).filter(Boolean);
}

function parseFields(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  raw.split(";").forEach((segment) => {
    const [k, ...rest] = segment.split("=");
    if (!k || rest.length === 0) return;
    out[k.trim()] = rest.join("=").trim();
  });
  return out;
}

export default function App() {
  const [started, setStarted] = useState(false);
  const [sessionRole, setSessionRole] = useState("Dispatcher");
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState("Console initialized.");

  const [queue, setQueue] = useState<IncidentSummary[]>([]);
  const [units, setUnits] = useState<UnitSummary[]>([]);
  const [command, setCommand] = useState<any>(null);
  const [mapData, setMapData] = useState<any>(null);
  const [reportHub, setReportHub] = useState<ReportingHub | null>(null);

  const [selectedIncidentId, setSelectedIncidentId] = useState("");
  const selectedIncident = useMemo(
    () => queue.find((item) => item.incident_id === selectedIncidentId) ?? queue[0],
    [queue, selectedIncidentId]
  );

  const [requiredSkills, setRequiredSkills] = useState("Crisis");
  const [recommendation, setRecommendation] = useState<any>(null);
  const [assignment, setAssignment] = useState<any>(null);
  const [riskProfile, setRiskProfile] = useState<any>(null);

  const [statusUnitId, setStatusUnitId] = useState("u-201");
  const [statusValue, setStatusValue] = useState("AVAILABLE");

  const [callerName, setCallerName] = useState("Unknown");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("35 Cajon St, Redlands");
  const [lat, setLat] = useState("34.0556");
  const [lon, setLon] = useState("-117.1825");
  const [callText, setCallText] = useState("Neighbors reporting loud domestic dispute, possible weapon.");

  const [dispositionCode, setDispositionCode] = useState("WARNING_ISSUED");
  const [dispositionSummary, setDispositionSummary] = useState("Scene stabilized and verbal warning issued.");
  const [arrestMade, setArrestMade] = useState(false);
  const [citationIssued, setCitationIssued] = useState(false);
  const [forceUsed, setForceUsed] = useState(false);

  const [reportNarrative, setReportNarrative] = useState("Initial narrative pending.");
  const [reportFields, setReportFields] = useState("case_type=Domestic;supervisor_review=Pending");
  const [reportSummary, setReportSummary] = useState("");

  const [intelQuery, setIntelQuery] = useState("Brandon");
  const [lookup, setLookup] = useState<LookupResult | null>(null);
  const [profile, setProfile] = useState<PersonProfile | null>(null);

  const [aiPrompt, setAiPrompt] = useState("Provide next actions and final disposition.");
  const [aiAssist, setAiAssist] = useState<AIAssist | null>(null);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRefs = useRef<maplibregl.Marker[]>([]);

  async function refreshDashboard() {
    try {
      const [q, u, c, m, h] = await Promise.all([
        fetchJson<{ incidents: IncidentSummary[] }>("/api/v1/dispatch/queue"),
        fetchJson<{ units: UnitSummary[] }>("/api/v1/dispatch/units"),
        fetchJson<any>("/api/v1/command/overview"),
        fetchJson<any>("/api/v1/map/overview"),
        fetchJson<ReportingHub>("/api/v1/reporting/hub"),
      ]);
      setQueue(q.incidents);
      setUnits(u.units);
      setCommand(c);
      setMapData(m);
      setReportHub(h);
      if (!selectedIncidentId && q.incidents.length > 0) setSelectedIncidentId(q.incidents[0].incident_id);
      if (!statusUnitId && u.units.length > 0) setStatusUnitId(u.units[0].unit_id);
    } catch (error) {
      setBanner(`API sync failed: ${(error as Error).message}`);
    }
  }
  useEffect(() => {
    refreshDashboard();
    const timer = window.setInterval(refreshDashboard, 12000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: MAP_STYLE_URL,
      center: [-117.1825, 34.0556],
      zoom: 12,
      attributionControl: false,
    });
    mapRef.current = map;
    return () => {
      markerRefs.current.forEach((marker) => marker.remove());
      markerRefs.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !mapData) return;
    markerRefs.current.forEach((m) => m.remove());
    markerRefs.current = [];

    mapData.units.forEach((unit: UnitSummary) => {
      const el = document.createElement("div");
      el.className = `map-unit-marker status-${unit.status.toLowerCase().replace("_", "-")}`;
      el.innerText = `${unit.callsign}\n${unit.status}`;
      markerRefs.current.push(new maplibregl.Marker({ element: el }).setLngLat([unit.coordinates.lon, unit.coordinates.lat]).addTo(mapRef.current!));
    });

    mapData.active_incidents.forEach((incident: IncidentSummary) => {
      const el = document.createElement("div");
      el.className = "map-incident-marker";
      el.innerText = `P${incident.priority}`;
      markerRefs.current.push(new maplibregl.Marker({ element: el }).setLngLat([incident.coordinates.lon, incident.coordinates.lat]).addTo(mapRef.current!));
    });

    if (selectedIncident) {
      mapRef.current.flyTo({ center: [selectedIncident.coordinates.lon, selectedIncident.coordinates.lat], zoom: 13, speed: 0.6 });
    }
  }, [mapData, selectedIncident]);

  useEffect(() => {
    async function loadRisk() {
      if (!selectedIncident) {
        setRiskProfile(null);
        return;
      }
      try {
        setRiskProfile(await fetchJson<any>(`/api/v1/intake/risk/${selectedIncident.incident_id}`));
      } catch {
        setRiskProfile(null);
      }
    }
    loadRisk();
  }, [selectedIncident]);

  useEffect(() => {
    if (!selectedIncident) return;
    setReportNarrative(`Incident ${selectedIncident.incident_id}: ${selectedIncident.call_type} at ${selectedIncident.address}.`);
  }, [selectedIncident?.incident_id]);

  async function handleCreateCall(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    try {
      const intake = await fetchJson<any>("/api/v1/intake/calls", {
        method: "POST",
        body: JSON.stringify({
          caller_name: callerName,
          phone: phone || null,
          call_text: callText,
          address: address || null,
          lat: lat ? Number(lat) : null,
          lon: lon ? Number(lon) : null,
        }),
      });
      setBanner(`New call ${intake.call_id} scored ${intake.auto_priority_score} (${intake.suggested_call_type}).`);
      setSelectedIncidentId(intake.call_id);
      await refreshDashboard();
    } catch (error) {
      setBanner(`Call intake failed: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleRecommend() {
    if (!selectedIncident) return;
    setLoading(true);
    try {
      const result = await fetchJson<any>("/api/v1/recommendation/unit", {
        method: "POST",
        body: JSON.stringify({
          incident_id: selectedIncident.incident_id,
          call_type: selectedIncident.call_type,
          priority: selectedIncident.priority,
          incident_lat: selectedIncident.coordinates.lat,
          incident_lon: selectedIncident.coordinates.lon,
          required_skills: parseSkills(requiredSkills),
        }),
      });
      setRecommendation(result);
      setBanner(`Recommended ${result.recommendation.callsign} ETA ${result.recommendation.predicted_eta_minutes}m.`);
    } catch (error) {
      setBanner(`Recommendation failed: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleAssign() {
    if (!selectedIncident) return;
    setLoading(true);
    try {
      const result = await fetchJson<any>("/api/v1/dispatch/assign", {
        method: "POST",
        body: JSON.stringify({
          incident_id: selectedIncident.incident_id,
          incident_lat: selectedIncident.coordinates.lat,
          incident_lon: selectedIncident.coordinates.lon,
          required_skills: parseSkills(requiredSkills),
        }),
      });
      setAssignment(result);
      setBanner(`Assigned ${result.callsign} to ${result.incident_id}.`);
      await refreshDashboard();
    } catch (error) {
      setBanner(`Assignment failed: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleStatusUpdate() {
    if (!statusUnitId) return;
    setLoading(true);
    try {
      await fetchJson("/api/v1/officer/status", { method: "POST", body: JSON.stringify({ unit_id: statusUnitId, status: statusValue }) });
      setBanner(`${statusUnitId} -> ${statusValue}`);
      await refreshDashboard();
    } catch (error) {
      setBanner(`Status update failed: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleOfficerAction(action: string) {
    if (!selectedIncident || !statusUnitId) return;
    setLoading(true);
    try {
      await fetchJson("/api/v1/officer/action", { method: "POST", body: JSON.stringify({ incident_id: selectedIncident.incident_id, unit_id: statusUnitId, action }) });
      setBanner(`Officer action recorded: ${action}`);
      await refreshDashboard();
    } catch (error) {
      setBanner(`Officer action failed: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }
  async function handleSaveDraft() {
    if (!selectedIncident || !statusUnitId) return;
    setLoading(true);
    try {
      const draft = await fetchJson<ReportDraft>("/api/v1/reporting/draft", {
        method: "POST",
        body: JSON.stringify({
          incident_id: selectedIncident.incident_id,
          unit_id: statusUnitId,
          narrative: reportNarrative,
          structured_fields: parseFields(reportFields),
          status: "DRAFT",
        }),
      });
      setReportSummary(`Draft ${draft.report_id} saved at ${draft.updated_at}.`);
      await refreshDashboard();
    } catch (error) {
      setBanner(`Draft save failed: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateReport() {
    if (!selectedIncident || !statusUnitId) return;
    setLoading(true);
    try {
      const payload = await fetchJson<any>("/api/v1/reporting/rms", {
        method: "POST",
        body: JSON.stringify({
          incident_id: selectedIncident.incident_id,
          unit_id: statusUnitId,
          narrative: reportNarrative,
          field_updates: parseFields(reportFields),
        }),
      });
      setReportSummary(`RMS payload ${payload.report_id} built with ${payload.audit_trail.length} audit events.`);
      await refreshDashboard();
    } catch (error) {
      setBanner(`RMS export failed: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleFinalizeDisposition() {
    if (!selectedIncident || !statusUnitId) return;
    setLoading(true);
    try {
      const result = await fetchJson<any>("/api/v1/dispatch/disposition", {
        method: "POST",
        body: JSON.stringify({
          incident_id: selectedIncident.incident_id,
          unit_id: statusUnitId,
          disposition_code: dispositionCode,
          summary: dispositionSummary,
          arrest_made: arrestMade,
          citation_issued: citationIssued,
          force_used: forceUsed,
        }),
      });
      setBanner(`Incident ${result.incident_id} closed as ${result.disposition.disposition_code}.`);
      await refreshDashboard();
    } catch (error) {
      setBanner(`Disposition failed: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleLookup() {
    setLoading(true);
    try {
      const result = await fetchJson<LookupResult>(`/api/v1/intel/lookup?query=${encodeURIComponent(intelQuery)}`);
      setLookup(result);
      setBanner(`Intel hit count: ${result.records.length + result.firearms.length + result.warrants.length}`);
    } catch (error) {
      setBanner(`Intel lookup failed: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleLoadProfile(personId: string) {
    setLoading(true);
    try {
      setProfile(await fetchJson<PersonProfile>(`/api/v1/intel/profile/${personId}`));
    } catch (error) {
      setBanner(`Profile lookup failed: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleAiAssist() {
    if (!selectedIncident) return;
    setLoading(true);
    try {
      const result = await fetchJson<AIAssist>("/api/v1/ai/incident", {
        method: "POST",
        body: JSON.stringify({ incident_id: selectedIncident.incident_id, prompt: aiPrompt }),
      });
      setAiAssist(result);
      setDispositionCode(result.recommended_disposition_code);
      setBanner(`AI assist generated with ${Math.round(result.confidence * 100)}% confidence.`);
    } catch (error) {
      setBanner(`AI assist failed: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  if (!started) {
    return (
      <div className="login-shell">
        <section className="login-card">
          <h1>FirstLine CAD</h1>
          <p>Map-first operations with AI dispatch, reporting, and intelligence access.</p>
          <div className="role-select">
            {["Dispatcher", "Officer", "Supervisor"].map((role) => (
              <button key={role} type="button" className={`role-option ${sessionRole === role ? "active" : ""}`} onClick={() => setSessionRole(role)}>
                {role}
              </button>
            ))}
          </div>
          <div className="login-actions">
            <button className="dispatch-primary" type="button" onClick={() => setStarted(true)}>Enter Console</button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div>
          <h1>FirstLine Operations</h1>
          <p>Unified console for intake, dispatch, officer actions, intelligence, and reporting.</p>
        </div>
        <div className="top-role-row">
          <span className="role-badge">{sessionRole}</span>
          <button className="dispatch-secondary" type="button" onClick={refreshDashboard}>Refresh</button>
        </div>
      </header>

      <div className="chip-row">
        <span className="chip">Traffic: {mapData?.traffic_overlay ?? "n/a"}</span>
        <span className="chip">Hot zones: {mapData?.hot_zones.length ?? 0}</span>
        <span className="chip">Geofence alerts: {mapData?.geofenced_alerts.filter((item: any) => item.active).length ?? 0}</span>
        <span className="chip">Report drafts: {reportHub?.drafts.length ?? 0}</span>
      </div>

      <main className="layout">
        <section className="main-column">
          <article className="card panel">
            <h2>Smart Call Intake</h2>
            <p className="section-subtitle">Structured intake with geolocation and AI-ready notes.</p>
            <form className="dispatch-form-grid" onSubmit={handleCreateCall}>
              <label className="form-field">Caller<input value={callerName} onChange={(e) => setCallerName(e.target.value)} /></label>
              <label className="form-field">Phone<input value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
              <label className="form-field">Address<input value={address} onChange={(e) => setAddress(e.target.value)} /></label>
              <label className="form-field">Required Skills<input value={requiredSkills} onChange={(e) => setRequiredSkills(e.target.value)} placeholder="Crisis, Spanish, K9" /></label>
              <label className="form-field">Latitude<input value={lat} onChange={(e) => setLat(e.target.value)} /></label>
              <label className="form-field">Longitude<input value={lon} onChange={(e) => setLon(e.target.value)} /></label>
              <label className="form-field wide">Call Notes<textarea value={callText} onChange={(e) => setCallText(e.target.value)} /></label>
              <div className="form-actions form-field wide"><button className="dispatch-primary" type="submit" disabled={loading}>{loading ? "Submitting..." : "Create Intake Call"}</button></div>
            </form>
            <div className="dispatch-banner">{banner}</div>
          </article>

          <article className="card map-card">
            <div className="map-header"><h2>Unified Live Map</h2><p>Live unit status and incident priority overlays.</p></div>
            <div className="map-canvas"><div className="maplibre-map" ref={mapContainerRef} /></div>
          </article>

          <article className="card panel">
            <h2>Active Queue</h2>
            {queue.map((incident) => (
              <button key={incident.incident_id} type="button" className="list-row" onClick={() => setSelectedIncidentId(incident.incident_id)}>
                <div><strong>{incident.incident_id} - {incident.call_type}</strong><p>{incident.address}</p></div>
                <div className="queue-meta"><span className="badge">P{incident.priority}</span><span className="badge soft">{incident.status}</span></div>
              </button>
            ))}
          </article>
          <article className="card panel">
            <h2>Report Writing Hub</h2>
            <p className="section-subtitle">Incident: <strong>{selectedIncident?.incident_id ?? "None selected"}</strong></p>
            <div className="dispatch-form-grid">
              <label className="form-field wide">Narrative Draft<textarea value={reportNarrative} onChange={(e) => setReportNarrative(e.target.value)} /></label>
              <label className="form-field wide">Structured Fields (key=value;key2=value2)<input value={reportFields} onChange={(e) => setReportFields(e.target.value)} /></label>
            </div>
            <div className="button-grid">
              <button type="button" onClick={handleSaveDraft} disabled={loading}>Save Draft</button>
              <button type="button" onClick={handleGenerateReport} disabled={loading}>Submit RMS Payload</button>
            </div>
            {reportSummary ? <div className="dispatch-banner">{reportSummary}</div> : null}
            <div className="hub-grid">
              <div className="hub-col">
                <h3>Drafts</h3>
                {(reportHub?.drafts ?? []).slice(0, 4).map((draft) => (
                  <div key={draft.report_id} className="hub-row"><strong>{draft.report_id}</strong><p>{draft.incident_id} - {draft.status}</p></div>
                ))}
              </div>
              <div className="hub-col">
                <h3>Missing Reports</h3>
                {(reportHub?.missing_reports ?? []).slice(0, 4).map((item) => (
                  <div key={item.incident_id} className="hub-row"><strong>{item.incident_id}</strong><p>{item.call_type} P{item.priority}</p></div>
                ))}
              </div>
            </div>
          </article>

          <article className="card panel">
            <h2>Records and Warrants Hub</h2>
            <div className="search-row">
              <input value={intelQuery} onChange={(e) => setIntelQuery(e.target.value)} />
              <button type="button" onClick={handleLookup} disabled={loading}>Run Lookup</button>
            </div>
            <div className="hub-grid">
              <div className="hub-col">
                <h3>Persons</h3>
                {(lookup?.records ?? []).map((record) => (
                  <button key={record.person_id} type="button" className="list-row static intel-row" onClick={() => handleLoadProfile(record.person_id)}>
                    <div><strong>{record.full_name}</strong><p>{record.person_id}</p></div><span className="badge soft">Profile</span>
                  </button>
                ))}
              </div>
              <div className="hub-col">
                <h3>Warrants</h3>
                {(lookup?.warrants ?? []).map((warrant) => (
                  <div key={warrant.warrant_id} className="hub-row"><strong>{warrant.warrant_id} - {warrant.severity}</strong><p>{warrant.subject_name}</p></div>
                ))}
              </div>
            </div>
            {profile ? <div className="profile-card"><strong>Profile - {profile.person.full_name} ({profile.person.person_id})</strong><p>Address: {profile.person.address}</p><p>Safety flags: {profile.officer_safety_flags.join(", ") || "None"}</p></div> : null}
          </article>
        </section>

        <aside className="right-column">
          <article className="card panel">
            <h2>Command Dashboard</h2>
            <div className="kpi-grid">
              <div className="kpi"><span>Active Incidents</span><strong>{command?.active_incidents ?? 0}</strong></div>
              <div className="kpi"><span>Pending Calls</span><strong>{command?.pending_calls ?? 0}</strong></div>
              <div className="kpi"><span>Units Available</span><strong>{command?.units_available ?? 0}</strong></div>
              <div className="kpi"><span>Avg ETA</span><strong>{command?.average_response_minutes ?? 0}m</strong></div>
            </div>
          </article>

          <article className="card panel">
            <h2>AI Operations Engine</h2>
            <p className="section-subtitle">Incident: {selectedIncident?.incident_id ?? "None selected"}</p>
            <label className="form-field">Prompt<input value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} /></label>
            <div className="dev-actions"><button type="button" onClick={handleAiAssist} disabled={loading}>Generate AI Assist</button></div>
            {aiAssist ? <div className="ai-box"><p>{aiAssist.summary}</p><p>Recommendation: <strong>{aiAssist.recommended_disposition_code}</strong></p><p>Next actions: {aiAssist.next_actions.join(" | ")}</p><p>Safety alerts: {aiAssist.officer_safety_alerts.join(" | ") || "None"}</p></div> : null}
          </article>

          <article className="card panel">
            <h2>Recommendation Engine</h2>
            <p className="section-subtitle">Selected incident: <strong>{selectedIncident?.incident_id ?? "None"}</strong></p>
            {riskProfile ? <div className="dispatch-banner">Risk {riskProfile.risk_score}/100 - history {riskProfile.history_count} - alerts: {riskProfile.safety_alerts.join(" | ") || "none"}</div> : null}
            <div className="button-grid">
              <button type="button" onClick={handleRecommend} disabled={loading}>Recommend Unit</button>
              <button type="button" onClick={handleAssign} disabled={loading}>Dispatch Unit</button>
            </div>
            {recommendation ? <div className="dispatch-banner">{recommendation.recommendation.callsign} ({recommendation.recommendation.recommended_unit_id}) - ETA {recommendation.recommendation.predicted_eta_minutes}m - Fallbacks: {recommendation.fallback_unit_ids.join(", ") || "none"}</div> : null}
            {assignment ? <div className="dispatch-banner">Assigned {assignment.callsign}. Confidence {Math.round(assignment.confidence * 100)}%.</div> : null}
          </article>

          <article className="card panel">
            <h2>Call Disposition</h2>
            <div className="dispatch-form-grid">
              <label className="form-field">Code<select value={dispositionCode} onChange={(e) => setDispositionCode(e.target.value)}><option value="WARNING_ISSUED">WARNING_ISSUED</option><option value="REPORT_ONLY">REPORT_ONLY</option><option value="ARREST_MADE">ARREST_MADE</option><option value="REFERRED">REFERRED</option><option value="UNFOUNDED">UNFOUNDED</option></select></label>
              <label className="form-field">Unit<select value={statusUnitId} onChange={(e) => setStatusUnitId(e.target.value)}>{units.map((u) => <option key={u.unit_id} value={u.unit_id}>{u.callsign} ({u.unit_id})</option>)}</select></label>
              <label className="form-field wide">Disposition Summary<textarea value={dispositionSummary} onChange={(e) => setDispositionSummary(e.target.value)} /></label>
            </div>
            <div className="toggle-row">
              <label><input type="checkbox" checked={arrestMade} onChange={(e) => setArrestMade(e.target.checked)} /> Arrest made</label>
              <label><input type="checkbox" checked={citationIssued} onChange={(e) => setCitationIssued(e.target.checked)} /> Citation issued</label>
              <label><input type="checkbox" checked={forceUsed} onChange={(e) => setForceUsed(e.target.checked)} /> Force used</label>
            </div>
            <div className="dev-actions"><button type="button" onClick={handleFinalizeDisposition} disabled={loading}>Finalize Disposition</button></div>
          </article>

          <article className="card panel">
            <h2>Mobile Officer Controls</h2>
            <div className="dispatch-form-grid">
              <label className="form-field">Unit<select value={statusUnitId} onChange={(e) => setStatusUnitId(e.target.value)}>{units.map((u) => <option key={u.unit_id} value={u.unit_id}>{u.callsign} ({u.unit_id})</option>)}</select></label>
              <label className="form-field">Status<select value={statusValue} onChange={(e) => setStatusValue(e.target.value)}><option value="AVAILABLE">AVAILABLE</option><option value="EN_ROUTE">EN_ROUTE</option><option value="ON_SCENE">ON_SCENE</option><option value="BUSY">BUSY</option></select></label>
            </div>
            <div className="dev-actions"><button type="button" onClick={handleStatusUpdate} disabled={loading}>Push Status Update</button></div>
            <div className="call-actions">
              <button type="button" onClick={() => handleOfficerAction("ARRIVED")} disabled={loading}>Arrived</button>
              <button type="button" onClick={() => handleOfficerAction("ON_SCENE")} disabled={loading}>On Scene</button>
              <button type="button" onClick={() => handleOfficerAction("CLEAR")} disabled={loading}>Clear Call</button>
            </div>
          </article>
        </aside>
      </main>
    </div>
  );
}
