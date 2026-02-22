
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type Coordinates = { lat: number; lon: number };
type IncidentSummary = { incident_id: string; call_type: string; priority: number; address: string; coordinates: Coordinates; status: string };
type UnitSummary = { unit_id: string; callsign: string; status: string; coordinates: Coordinates; skills: string[]; workload_score: number; fatigue_score: number };
type UnitReadiness = {
  unit_id: string;
  callsign: string;
  status: string;
  skills: string[];
  workload_score: number;
  fatigue_score: number;
  active_assignments: number;
  readiness_score: number;
  requires_break: boolean;
};
type UnitBoard = { units: UnitReadiness[]; break_recommendations: string[] };
type PriorityRadar = {
  count: number;
  incidents: Array<{ incident_id: string; call_type: string; priority: number; status: string; address: string; risk_score: number; safety_alerts: string[] }>;
};
type ReportDraft = {
  report_id: string;
  incident_id: string;
  unit_id: string;
  narrative: string;
  status: string;
  updated_at: string;
  evidence_links?: Array<{ type: string; uri: string; added_at?: string }>;
};
type ReportingHub = { drafts: ReportDraft[]; missing_reports: Array<{ incident_id: string; call_type: string; priority: number }> };
type ReportingMetrics = {
  total_reports: number;
  submitted_reports: number;
  ready_for_command: number;
  changes_requested: number;
  avg_narrative_length: number;
  evidence_attachment_rate: number;
};
type ReviewQueue = {
  review_count: number;
  reports: Array<{ report_id: string; incident_id: string; unit_id: string; status: string; review_status?: string; review_notes?: string | null; updated_at: string; reasons: string[] }>;
};

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
type ReportTemplate = {
  template_id: string;
  label: string;
  sections: string[];
  default_fields: Record<string, string>;
  recommended: boolean;
};
type ReportTemplateCatalog = {
  templates: ReportTemplate[];
  incident_call_type?: string | null;
};
type MessageThread = {
  message_id: string;
  from_unit: string;
  to_unit: string;
  body: string;
  incident_id?: string | null;
  priority?: string;
  sent_at: string;
};
type MessageInbox = {
  unit_id: string;
  message_count: number;
  unread_estimate: number;
  messages: MessageThread[];
};
type IncidentChannel = {
  incident_id: string;
  message_count: number;
  messages: MessageThread[];
};
type OfficerFeed = {
  unit_id: string;
  assigned_incidents: Array<{
    incident_id: string;
    call_type: string;
    priority: number;
    address: string;
    status: string;
    history_at_address: string[];
  }>;
};
type CommandTrends = {
  periods: number;
  metrics: {
    active_incidents: { series: number[]; change: number };
    pending_calls: { series: number[]; change: number };
    units_busy: { series: number[]; change: number };
    average_response_minutes: { series: number[]; change: number };
  };
};
type AIReportAssist = {
  improved_narrative: string;
  key_points: string[];
  confidence: number;
  tone: string;
};

type IncidentDetail = {
  incident: {
    incident_id: string;
    status: string;
    assigned_unit_id?: string | null;
    disposition?: Record<string, unknown> | null;
  };
  elapsed_minutes: number;
  latest_action?: { event?: string; action?: string; unit_id?: string; time?: string } | null;
  timeline: Array<{ event: string; time: string; unit_id?: string; action?: string; summary?: string }>;
};
type ViewMode = "Dispatch" | "Field" | "Report" | "Intel";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";
const MAP_STYLE_URL =
  import.meta.env.VITE_MAP_STYLE_URL ?? "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const PREFS_KEY = "firstline_ui_prefs_v1";

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

function serializeFields(fields: Record<string, string>): string {
  return Object.entries(fields).map(([k, v]) => `${k}=${v}`).join(";");
}

function trendSeries(series: number[]): string {
  return series.map((value) => Number(value).toFixed(value % 1 === 0 ? 0 : 1)).join(" -> ");
}

function signed(value: number, suffix = ""): string {
  return `${value >= 0 ? "+" : ""}${value}${suffix}`;
}

export default function App() {
  const [started, setStarted] = useState(false);
  const [sessionRole, setSessionRole] = useState("Dispatcher");
  const [viewMode, setViewMode] = useState<ViewMode>("Dispatch");
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState("Console initialized.");

  const [queue, setQueue] = useState<IncidentSummary[]>([]);
  const [units, setUnits] = useState<UnitSummary[]>([]);
  const [command, setCommand] = useState<any>(null);
  const [commandTrends, setCommandTrends] = useState<CommandTrends | null>(null);
  const [unitBoard, setUnitBoard] = useState<UnitBoard | null>(null);
  const [priorityBoard, setPriorityBoard] = useState<PriorityRadar | null>(null);
  const [mapData, setMapData] = useState<any>(null);
  const [mapReady, setMapReady] = useState(false);
  const [reportHub, setReportHub] = useState<ReportingHub | null>(null);
  const [reportingMetrics, setReportingMetrics] = useState<ReportingMetrics | null>(null);
  const [reviewQueue, setReviewQueue] = useState<ReviewQueue | null>(null);
  const [incidentDetail, setIncidentDetail] = useState<IncidentDetail | null>(null);

  const [selectedIncidentId, setSelectedIncidentId] = useState("");
  const selectedIncident = useMemo(
    () => queue.find((item) => item.incident_id === selectedIncidentId) ?? queue[0],
    [queue, selectedIncidentId]
  );

  const [requiredSkills, setRequiredSkills] = useState("Crisis");
  const [recommendation, setRecommendation] = useState<any>(null);
  const [assignment, setAssignment] = useState<any>(null);
  const [riskProfile, setRiskProfile] = useState<any>(null);
  const [showMapUnits, setShowMapUnits] = useState(true);
  const [showMapIncidents, setShowMapIncidents] = useState(true);

  const [statusUnitId, setStatusUnitId] = useState("u-201");
  const [statusValue, setStatusValue] = useState("AVAILABLE");

  const [callerName, setCallerName] = useState("Unknown");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("35 Cajon St, Redlands");
  const [lat, setLat] = useState("34.0556");
  const [lon, setLon] = useState("-117.1825");
  const [callText, setCallText] = useState("Neighbors reporting loud domestic dispute, possible weapon.");
  const [demoScenario, setDemoScenario] = useState("SHIFT_START");

  const [dispositionCode, setDispositionCode] = useState("WARNING_ISSUED");
  const [dispositionSummary, setDispositionSummary] = useState("Scene stabilized and verbal warning issued.");
  const [arrestMade, setArrestMade] = useState(false);
  const [citationIssued, setCitationIssued] = useState(false);
  const [forceUsed, setForceUsed] = useState(false);

  const [reportNarrative, setReportNarrative] = useState("Initial narrative pending.");
  const [reportFields, setReportFields] = useState("case_type=Domestic;supervisor_review=Pending");
  const [reportSummary, setReportSummary] = useState("");
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  const [lastAutoSavedAt, setLastAutoSavedAt] = useState("");
  const [templateCatalog, setTemplateCatalog] = useState<ReportTemplateCatalog | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState("GENERAL_INCIDENT");
  const [reportTone, setReportTone] = useState("professional");
  const [reportAssist, setReportAssist] = useState<AIReportAssist | null>(null);
  const [reportEvidenceType, setReportEvidenceType] = useState("photo");
  const [reportEvidenceUri, setReportEvidenceUri] = useState("");
  const [reportEvidence, setReportEvidence] = useState<Array<{ type: string; uri: string; added_at?: string }>>([]);
  const [reviewNotesByReport, setReviewNotesByReport] = useState<Record<string, string>>({});
  const [dictationSegments, setDictationSegments] = useState(0);
  const [dictationSeconds, setDictationSeconds] = useState(0);
  const [dictationSupported, setDictationSupported] = useState(false);
  const [isDictating, setIsDictating] = useState(false);
  const [dictationStatus, setDictationStatus] = useState("Dictation idle.");
  const [dictationInterim, setDictationInterim] = useState("");
  const [messageInbox, setMessageInbox] = useState<MessageInbox | null>(null);
  const [officerFeed, setOfficerFeed] = useState<OfficerFeed | null>(null);
  const [messageTarget, setMessageTarget] = useState("DISPATCH");
  const [messagePriority, setMessagePriority] = useState("NORMAL");
  const [channelIncidentId, setChannelIncidentId] = useState("");
  const [incidentChannel, setIncidentChannel] = useState<IncidentChannel | null>(null);
  const [sendToIncidentChannel, setSendToIncidentChannel] = useState(true);
  const [messageBody, setMessageBody] = useState("");
  const [messageStatus, setMessageStatus] = useState("");

  const [intelQuery, setIntelQuery] = useState("Brandon");
  const [lookup, setLookup] = useState<LookupResult | null>(null);
  const [profile, setProfile] = useState<PersonProfile | null>(null);

  const [aiPrompt, setAiPrompt] = useState("Provide next actions and final disposition.");
  const [aiAssist, setAiAssist] = useState<AIAssist | null>(null);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const mapLibRef = useRef<any>(null);
  const markerRefs = useRef<any[]>([]);
  const selectedIncidentIdRef = useRef(selectedIncidentId);
  const statusUnitIdRef = useRef(statusUnitId);
  const dictationRef = useRef<any>(null);
  const dictationStartRef = useRef<number | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PREFS_KEY);
      if (!raw) return;
      const prefs = JSON.parse(raw) as Record<string, unknown>;
      if (typeof prefs.sessionRole === "string") setSessionRole(prefs.sessionRole);
      if (typeof prefs.viewMode === "string") setViewMode(prefs.viewMode as ViewMode);
      if (typeof prefs.statusUnitId === "string") setStatusUnitId(prefs.statusUnitId);
      if (typeof prefs.showMapUnits === "boolean") setShowMapUnits(prefs.showMapUnits);
      if (typeof prefs.showMapIncidents === "boolean") setShowMapIncidents(prefs.showMapIncidents);
      if (typeof prefs.autoSaveEnabled === "boolean") setAutoSaveEnabled(prefs.autoSaveEnabled);
    } catch {
      // Ignore malformed local preference payloads.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        PREFS_KEY,
        JSON.stringify({
          sessionRole,
          viewMode,
          statusUnitId,
          showMapUnits,
          showMapIncidents,
          autoSaveEnabled,
        })
      );
    } catch {
      // Ignore storage write failures.
    }
  }, [sessionRole, viewMode, statusUnitId, showMapUnits, showMapIncidents, autoSaveEnabled]);

  useEffect(() => {
    selectedIncidentIdRef.current = selectedIncidentId;
  }, [selectedIncidentId]);

  useEffect(() => {
    statusUnitIdRef.current = statusUnitId;
  }, [statusUnitId]);

  useEffect(() => {
    async function loadOfficerPanels() {
      if (!statusUnitId) {
        setMessageInbox(null);
        setOfficerFeed(null);
        return;
      }
      try {
        const [inbox, feed] = await Promise.all([
          fetchJson<MessageInbox>(`/api/v1/officer/messages/${statusUnitId}?limit=12`),
          fetchJson<OfficerFeed>(`/api/v1/officer/feed/${statusUnitId}`),
        ]);
        setMessageInbox(inbox);
        setOfficerFeed(feed);
      } catch {
        setMessageInbox(null);
        setOfficerFeed(null);
      }
    }
    loadOfficerPanels();
  }, [statusUnitId]);

  useEffect(() => {
    async function loadIncidentChannel() {
      if (!channelIncidentId) {
        setIncidentChannel(null);
        return;
      }
      try {
        const channel = await fetchJson<IncidentChannel>(`/api/v1/officer/channel/${channelIncidentId}?limit=10`);
        setIncidentChannel(channel);
      } catch {
        setIncidentChannel(null);
      }
    }
    loadIncidentChannel();
  }, [channelIncidentId]);

  useEffect(() => {
    if (sessionRole === "Officer") setViewMode("Field");
    if (sessionRole === "Supervisor") setViewMode("Dispatch");
    if (sessionRole === "Dispatcher") setViewMode("Dispatch");
  }, [sessionRole]);

  async function refreshDashboard() {
    try {
      const feedPromise = statusUnitIdRef.current
        ? fetchJson<OfficerFeed>(`/api/v1/officer/feed/${statusUnitIdRef.current}`).catch(() => null)
        : Promise.resolve(null);
      const inboxPromise = statusUnitIdRef.current
        ? fetchJson<MessageInbox>(`/api/v1/officer/messages/${statusUnitIdRef.current}?limit=12`).catch(() => null)
        : Promise.resolve(null);
      const channelPromise = selectedIncidentIdRef.current
        ? fetchJson<IncidentChannel>(`/api/v1/officer/channel/${selectedIncidentIdRef.current}?limit=10`).catch(() => null)
        : Promise.resolve(null);
      const [q, u, ub, pb, c, ct, m, h, rm, rq, inbox, feed, channel] = await Promise.all([
        fetchJson<{ incidents: IncidentSummary[] }>("/api/v1/dispatch/queue"),
        fetchJson<{ units: UnitSummary[] }>("/api/v1/dispatch/units"),
        fetchJson<UnitBoard>("/api/v1/dispatch/unit-board"),
        fetchJson<PriorityRadar>("/api/v1/dispatch/priority-board?limit=6"),
        fetchJson<any>("/api/v1/command/overview"),
        fetchJson<CommandTrends>("/api/v1/command/trends?periods=6"),
        fetchJson<any>("/api/v1/map/overview"),
        fetchJson<ReportingHub>("/api/v1/reporting/hub"),
        fetchJson<ReportingMetrics>("/api/v1/reporting/metrics"),
        fetchJson<ReviewQueue>("/api/v1/reporting/review-queue"),
        inboxPromise,
        feedPromise,
        channelPromise,
      ]);
      setQueue(q.incidents);
      setUnits(u.units);
      setUnitBoard(ub);
      setPriorityBoard(pb);
      setCommand(c);
      setCommandTrends(ct);
      setMapData(m);
      setReportHub(h);
      setReportingMetrics(rm);
      setReviewQueue(rq);
      setMessageInbox(inbox);
      setOfficerFeed(feed);
      setIncidentChannel(channel);
      if (!selectedIncidentIdRef.current && q.incidents.length > 0) setSelectedIncidentId(q.incidents[0].incident_id);
      if (!statusUnitIdRef.current && u.units.length > 0) setStatusUnitId(u.units[0].unit_id);
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
    let canceled = false;
    import("maplibre-gl").then((module) => {
      if (canceled || !mapContainerRef.current || mapRef.current) return;
      const maplibregl = module.default;
      mapLibRef.current = maplibregl;
      const map = new maplibregl.Map({
        container: mapContainerRef.current,
        style: MAP_STYLE_URL,
        center: [-117.1825, 34.0556],
        zoom: 12,
        attributionControl: false,
      });
      mapRef.current = map;
      setMapReady(true);
    }).catch(() => {
      setBanner("Map library failed to load.");
    });
    return () => {
      canceled = true;
      markerRefs.current.forEach((marker) => marker.remove());
      markerRefs.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
      mapLibRef.current = null;
      setMapReady(false);
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !mapData || !mapLibRef.current) return;
    markerRefs.current.forEach((m) => m.remove());
    markerRefs.current = [];

    if (showMapUnits) {
      mapData.units.forEach((unit: UnitSummary) => {
        const el = document.createElement("div");
        el.className = `map-unit-marker status-${unit.status.toLowerCase().replace("_", "-")}`;
        el.innerText = `${unit.callsign}\n${unit.status}`;
        markerRefs.current.push(new mapLibRef.current.Marker({ element: el }).setLngLat([unit.coordinates.lon, unit.coordinates.lat]).addTo(mapRef.current!));
      });
    }

    if (showMapIncidents) {
      mapData.active_incidents.forEach((incident: IncidentSummary) => {
        const el = document.createElement("div");
        el.className = "map-incident-marker";
        el.innerText = `P${incident.priority}`;
        markerRefs.current.push(new mapLibRef.current.Marker({ element: el }).setLngLat([incident.coordinates.lon, incident.coordinates.lat]).addTo(mapRef.current!));
      });
    }

    if (selectedIncident) {
      mapRef.current.flyTo({ center: [selectedIncident.coordinates.lon, selectedIncident.coordinates.lat], zoom: 13, speed: 0.6 });
    }
  }, [mapData, selectedIncident, mapReady, showMapUnits, showMapIncidents]);

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
    setChannelIncidentId(selectedIncident.incident_id);
  }, [selectedIncident?.incident_id]);

  useEffect(() => {
    if (!selectedIncident || !reportHub) {
      setReportEvidence([]);
      return;
    }
    const related = reportHub.drafts.find(
      (draft) => draft.incident_id === selectedIncident.incident_id && draft.unit_id === statusUnitId
    );
    setReportEvidence(related?.evidence_links ?? []);
  }, [reportHub, selectedIncident?.incident_id, statusUnitId]);

  useEffect(() => {
    async function loadDetail() {
      if (!selectedIncident) {
        setIncidentDetail(null);
        return;
      }
      try {
        const detail = await fetchJson<IncidentDetail>(`/api/v1/dispatch/incident/${selectedIncident.incident_id}`);
        setIncidentDetail(detail);
      } catch {
        setIncidentDetail(null);
      }
    }
    loadDetail();
  }, [selectedIncident?.incident_id, queue.length]);

  useEffect(() => {
    async function loadTemplates() {
      if (!selectedIncident) {
        setTemplateCatalog(null);
        setSelectedTemplateId("GENERAL_INCIDENT");
        return;
      }
      try {
        const catalog = await fetchJson<ReportTemplateCatalog>(`/api/v1/reporting/templates?incident_id=${selectedIncident.incident_id}`);
        setTemplateCatalog(catalog);
        const recommended = catalog.templates.find((item) => item.recommended);
        if (recommended) setSelectedTemplateId(recommended.template_id);
      } catch {
        setTemplateCatalog(null);
      }
    }
    loadTemplates();
  }, [selectedIncident?.incident_id]);

  useEffect(() => {
    if (!autoSaveEnabled || !selectedIncident || !statusUnitId) return;
    const timer = window.setTimeout(async () => {
      try {
        await fetchJson("/api/v1/reporting/draft", {
          method: "POST",
          body: JSON.stringify({
            incident_id: selectedIncident.incident_id,
            unit_id: statusUnitId,
            narrative: reportNarrative,
            structured_fields: parseFields(reportFields),
            template_id: selectedTemplateId,
            dictation_metadata: { segments: dictationSegments, seconds: dictationSeconds },
            status: "DRAFT",
          }),
        });
        setLastAutoSavedAt(new Date().toLocaleTimeString());
      } catch {
        // Best-effort autosave should not interrupt operator workflow.
      }
    }, 18000);

    return () => window.clearTimeout(timer);
  }, [
    autoSaveEnabled,
    selectedIncident?.incident_id,
    statusUnitId,
    reportNarrative,
    reportFields,
    selectedTemplateId,
    dictationSegments,
    dictationSeconds,
  ]);

  useEffect(() => {
    const speechCtor = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!speechCtor) {
      setDictationSupported(false);
      setDictationStatus("Dictation unavailable in this browser.");
      return;
    }

    const recognition = new speechCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      let finalTranscript = "";
      let interimTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcript = result?.[0]?.transcript ?? "";
        if (result.isFinal) finalTranscript += transcript;
        else interimTranscript += transcript;
      }

      if (finalTranscript.trim()) {
        setReportNarrative((prev) => `${prev.trim()} ${finalTranscript.trim()}`.trim());
        setDictationSegments((prev) => prev + 1);
        setDictationStatus("Dictation captured.");
      } else if (interimTranscript.trim()) {
        setDictationStatus("Listening...");
      }
      setDictationInterim(interimTranscript.trim());
    };

    recognition.onerror = (event: any) => {
      setDictationStatus(`Dictation error: ${event?.error ?? "unknown"}.`);
      setIsDictating(false);
      setDictationInterim("");
    };

    recognition.onend = () => {
      if (dictationStartRef.current) {
        const elapsed = Math.max(1, Math.round((Date.now() - dictationStartRef.current) / 1000));
        setDictationSeconds((prev) => prev + elapsed);
      }
      setIsDictating(false);
      setDictationInterim("");
      dictationStartRef.current = null;
      setDictationStatus((current) => (current.startsWith("Dictation error") ? current : "Dictation stopped."));
    };

    dictationRef.current = recognition;
    setDictationSupported(true);

    return () => {
      try {
        recognition.stop();
      } catch {
        // noop
      }
      dictationRef.current = null;
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!started || viewMode !== "Field") return;
      const active = document.activeElement?.tagName;
      if (active === "INPUT" || active === "TEXTAREA" || active === "SELECT") return;

      const key = event.key.toLowerCase();
      if (key === "a") {
        event.preventDefault();
        handleOfficerAction("ACCEPT");
      }
      if (key === "e") {
        event.preventDefault();
        handleOfficerAction("EN_ROUTE");
      }
      if (key === "o") {
        event.preventDefault();
        handleOfficerAction("ON_SCENE");
      }
      if (key === "c") {
        event.preventDefault();
        handleOfficerAction("CLEAR");
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [started, viewMode, selectedIncident?.incident_id, statusUnitId]);

  useEffect(() => {
    function onGlobalKeyDown(event: KeyboardEvent) {
      if (!started || !event.altKey) return;
      const active = document.activeElement?.tagName;
      if (active === "INPUT" || active === "TEXTAREA" || active === "SELECT") return;

      if (event.key === "1") {
        event.preventDefault();
        setViewMode("Dispatch");
      }
      if (event.key === "2") {
        event.preventDefault();
        setViewMode("Field");
      }
      if (event.key === "3") {
        event.preventDefault();
        setViewMode("Report");
      }
      if (event.key === "4") {
        event.preventDefault();
        setViewMode("Intel");
      }
    }

    window.addEventListener("keydown", onGlobalKeyDown);
    return () => window.removeEventListener("keydown", onGlobalKeyDown);
  }, [started]);

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

  async function handleLaunchDemoScenario() {
    setLoading(true);
    try {
      const result = await fetchJson<{ scenario: string; created_count: number; incidents: Array<{ incident_id: string; call_type: string; priority: number }> }>("/api/v1/intake/demo", {
        method: "POST",
        body: JSON.stringify({ scenario: demoScenario }),
      });
      setBanner(`Demo scenario ${result.scenario} created ${result.created_count} incidents.`);
      if (result.incidents.length > 0) setSelectedIncidentId(result.incidents[0].incident_id);
      await refreshDashboard();
    } catch (error) {
      setBanner(`Demo scenario failed: ${(error as Error).message}`);
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
          template_id: selectedTemplateId,
          dictation_metadata: { segments: dictationSegments, seconds: dictationSeconds },
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
          template_id: selectedTemplateId,
          dictation_metadata: { segments: dictationSegments, seconds: dictationSeconds },
        }),
      });
      const warnings = (payload.validation?.warnings ?? []).join(" ");
      setReportSummary(
        `RMS payload ${payload.report_id} ${payload.submission_status}. ${warnings}`.trim()
      );
      await refreshDashboard();
    } catch (error) {
      setBanner(`RMS export failed: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleAttachEvidence() {
    if (!selectedIncident || !statusUnitId || !reportEvidenceUri.trim()) return;
    setLoading(true);
    try {
      const payload = await fetchJson<{ evidence_links: Array<{ type: string; uri: string; added_at?: string }> }>("/api/v1/reporting/evidence", {
        method: "POST",
        body: JSON.stringify({
          incident_id: selectedIncident.incident_id,
          unit_id: statusUnitId,
          evidence_type: reportEvidenceType,
          uri: reportEvidenceUri.trim(),
        }),
      });
      setReportEvidence(payload.evidence_links);
      setReportEvidenceUri("");
      setReportSummary(`Evidence linked (${payload.evidence_links.length} items).`);
      await refreshDashboard();
    } catch (error) {
      setBanner(`Evidence link failed: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleReviewDecision(reportId: string, decision: "APPROVE" | "REJECT") {
    setLoading(true);
    try {
      const notes = reviewNotesByReport[reportId] ?? "";
      await fetchJson("/api/v1/reporting/review", {
        method: "POST",
        body: JSON.stringify({
          report_id: reportId,
          reviewer_id: "SUP-001",
          decision,
          notes,
        }),
      });
      setBanner(`Report ${reportId} ${decision === "APPROVE" ? "approved" : "sent back"} by supervisor.`);
      setReviewNotesByReport((prev) => ({ ...prev, [reportId]: "" }));
      await refreshDashboard();
    } catch (error) {
      setBanner(`Review action failed: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  function handleStartDictation() {
    if (!dictationSupported || !dictationRef.current || isDictating) return;
    try {
      dictationRef.current.start();
      dictationStartRef.current = Date.now();
      setIsDictating(true);
      setDictationInterim("");
      setDictationStatus("Listening...");
    } catch {
      setDictationStatus("Unable to start dictation. Check microphone permission.");
    }
  }

  function handleStopDictation() {
    if (!dictationRef.current || !isDictating) return;
    if (dictationStartRef.current) {
      const elapsed = Math.max(1, Math.round((Date.now() - dictationStartRef.current) / 1000));
      setDictationSeconds((prev) => prev + elapsed);
      dictationStartRef.current = null;
    }
    dictationRef.current.stop();
    setIsDictating(false);
    setDictationInterim("");
    setDictationStatus("Dictation stopped.");
  }

  async function handleApplyTemplate() {
    if (!selectedIncident || !statusUnitId) return;
    setLoading(true);
    try {
      const payload = await fetchJson<{ narrative: string; structured_fields: Record<string, string> }>("/api/v1/reporting/template/apply", {
        method: "POST",
        body: JSON.stringify({
          incident_id: selectedIncident.incident_id,
          unit_id: statusUnitId,
          template_id: selectedTemplateId,
          include_timeline: true,
        }),
      });
      setReportNarrative(payload.narrative);
      const merged = { ...payload.structured_fields, ...parseFields(reportFields) };
      setReportFields(serializeFields(merged));
      setReportSummary(`Applied template ${selectedTemplateId}.`);
    } catch (error) {
      setBanner(`Template apply failed: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleAiReportAssist() {
    if (!selectedIncident || !statusUnitId) return;
    setLoading(true);
    try {
      const result = await fetchJson<AIReportAssist>("/api/v1/ai/report", {
        method: "POST",
        body: JSON.stringify({
          incident_id: selectedIncident.incident_id,
          unit_id: statusUnitId,
          narrative: reportNarrative,
          tone: reportTone,
        }),
      });
      setReportAssist(result);
      setReportNarrative(result.improved_narrative);
      setReportSummary(`AI report assist ${Math.round(result.confidence * 100)}% confidence.`);
    } catch (error) {
      setBanner(`AI report assist failed: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  function appendNarrativeBlock(label: string) {
    const block = `\n${label}: `;
    setReportNarrative((prev) => `${prev.trimEnd()}${block}`);
  }

  async function handleSendMessage() {
    if (!statusUnitId || !messageTarget || !messageBody.trim()) return;
    setLoading(true);
    try {
      const incidentId = sendToIncidentChannel ? (channelIncidentId || selectedIncident?.incident_id || null) : null;
      await fetchJson("/api/v1/officer/message", {
        method: "POST",
        body: JSON.stringify({
          from_unit: statusUnitId,
          to_unit: messageTarget,
          body: messageBody.trim(),
          incident_id: incidentId,
          priority: messagePriority,
        }),
      });
      setMessageBody("");
      setMessageStatus(`Message sent to ${messageTarget}${incidentId ? ` on ${incidentId}` : ""}.`);
      const [inbox, channel] = await Promise.all([
        fetchJson<MessageInbox>(`/api/v1/officer/messages/${statusUnitId}?limit=12`),
        incidentId ? fetchJson<IncidentChannel>(`/api/v1/officer/channel/${incidentId}?limit=10`) : Promise.resolve(null),
      ]);
      setMessageInbox(inbox);
      if (channel) setIncidentChannel(channel);
    } catch (error) {
      setBanner(`Secure message failed: ${(error as Error).message}`);
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
      if (result.error) {
        setBanner(result.error);
        return;
      }
      setBanner(`Incident ${result.incident_id} closed as ${result.disposition.disposition_code}.`);
      await refreshDashboard();
    } catch (error) {
      setBanner(`Disposition failed: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  async function runIntelLookup(query: string) {
    setLoading(true);
    try {
      const result = await fetchJson<LookupResult>(`/api/v1/intel/lookup?query=${encodeURIComponent(query)}`);
      setLookup(result);
      setBanner(`Intel hit count: ${result.records.length + result.firearms.length + result.warrants.length}`);
    } catch (error) {
      setBanner(`Intel lookup failed: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleLookup() {
    await runIntelLookup(intelQuery);
  }

  async function handleQuickIntel(mode: "ADDRESS" | "CALLER" | "WARRANTS") {
    if (mode === "ADDRESS") {
      const query = selectedIncident?.address ?? intelQuery;
      setIntelQuery(query);
      await runIntelLookup(query);
      return;
    }
    if (mode === "CALLER") {
      const query = callerName || intelQuery;
      setIntelQuery(query);
      await runIntelLookup(query);
      return;
    }
    const query = "W-";
    setIntelQuery(query);
    await runIntelLookup(query);
  }

  function handleExportIncidentPacket() {
    if (!selectedIncident) return;
    const payload = {
      exported_at: new Date().toISOString(),
      incident: selectedIncident,
      incident_detail: incidentDetail,
      risk_profile: riskProfile,
      ai_assist: aiAssist,
      report_summary: reportSummary,
      report_fields: parseFields(reportFields),
      evidence_links: reportEvidence,
      channel_messages: incidentChannel?.messages ?? [],
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${selectedIncident.incident_id}-packet.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
    setBanner(`Exported incident packet for ${selectedIncident.incident_id}.`);
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

  async function handleQuickCode(action: "EN_ROUTE" | "ON_SCENE" | "CLEAR") {
    await handleOfficerAction(action);
    if (action === "EN_ROUTE") setStatusValue("EN_ROUTE");
    if (action === "ON_SCENE") setStatusValue("ON_SCENE");
    if (action === "CLEAR") setStatusValue("AVAILABLE");
  }

  const dispositionReady = Boolean(incidentDetail?.incident?.disposition);
  const recentTimeline = (incidentDetail?.timeline ?? []).slice(0, 4);
  const showDispatch = viewMode === "Dispatch";
  const showField = viewMode === "Field";
  const showReport = viewMode === "Report";
  const showIntel = viewMode === "Intel";

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
        <span className="chip">Supervisor review: {reviewQueue?.review_count ?? 0}</span>
        <span className="chip">Break flags: {unitBoard?.break_recommendations.length ?? 0}</span>
        <span className="chip">Priority radar: {priorityBoard?.incidents.filter((item) => item.risk_score >= 80).length ?? 0} high risk</span>
      </div>

      <main className="layout">
        <section className="main-column">
          {showDispatch ? (
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
            <div className="template-row">
              <label className="form-field">
                Demo Scenario
                <select value={demoScenario} onChange={(e) => setDemoScenario(e.target.value)}>
                  <option value="SHIFT_START">SHIFT_START</option>
                  <option value="HIGH_RISK_NIGHT">HIGH_RISK_NIGHT</option>
                </select>
              </label>
              <div className="form-field">
                <span>Stage Investor Demo Data</span>
                <button type="button" className="dispatch-secondary" onClick={handleLaunchDemoScenario} disabled={loading}>
                  Launch Scenario
                </button>
              </div>
            </div>
            <div className="dispatch-banner">{banner}</div>
          </article>
          ) : null}

          {(showDispatch || showField) ? (
          <article className="card map-card">
            <div className="map-header"><h2>Unified Live Map</h2><p>Live unit status and incident priority overlays.</p></div>
            <div className="toggle-row">
              <label><input type="checkbox" checked={showMapUnits} onChange={(e) => setShowMapUnits(e.target.checked)} /> Units</label>
              <label><input type="checkbox" checked={showMapIncidents} onChange={(e) => setShowMapIncidents(e.target.checked)} /> Incidents</label>
              <button
                type="button"
                className="dispatch-secondary"
                onClick={() => {
                  if (!selectedIncident || !mapRef.current) return;
                  mapRef.current.flyTo({ center: [selectedIncident.coordinates.lon, selectedIncident.coordinates.lat], zoom: 13, speed: 0.6 });
                }}
              >
                Center Selected
              </button>
            </div>
            <div className="map-canvas"><div className="maplibre-map" ref={mapContainerRef} /></div>
          </article>
          ) : null}

          {(showDispatch || showField || showReport) ? (
          <article className="card panel">
            <h2>Active Queue</h2>
            {queue.map((incident) => (
              <button key={incident.incident_id} type="button" className="list-row" onClick={() => setSelectedIncidentId(incident.incident_id)}>
                <div><strong>{incident.incident_id} - {incident.call_type}</strong><p>{incident.address}</p></div>
                <div className="queue-meta"><span className="badge">P{incident.priority}</span><span className="badge soft">{incident.status}</span></div>
              </button>
            ))}
          </article>
          ) : null}
          {(showDispatch || showField) ? (
          <article className="card panel">
            <h2>Priority Radar</h2>
            <p className="section-subtitle">Top risk-ranked incidents with safety context.</p>
            {(priorityBoard?.incidents ?? []).map((item) => (
              <button key={item.incident_id} type="button" className="list-row" onClick={() => setSelectedIncidentId(item.incident_id)}>
                <div>
                  <strong>{item.incident_id} · {item.call_type}</strong>
                  <p>{item.address}</p>
                  <p>{item.safety_alerts.join(" | ") || "No immediate safety flags."}</p>
                </div>
                <div className="queue-meta">
                  <span className="badge">R{item.risk_score}</span>
                  <span className="badge soft">{item.status}</span>
                </div>
              </button>
            ))}
          </article>
          ) : null}
          {(showField || showDispatch) ? (
          <article className="card panel">
            <h2>Field Operations</h2>
            <p className="section-subtitle">
              {selectedIncident?.incident_id ?? "No incident"} · Elapsed {incidentDetail?.elapsed_minutes ?? 0}m
            </p>
            <div className="dev-actions"><button type="button" onClick={handleExportIncidentPacket} disabled={!selectedIncident}>Export Incident Packet</button></div>
            <div className="dispatch-banner">
              Latest action:{" "}
              {incidentDetail?.latest_action?.action ??
                incidentDetail?.latest_action?.event ??
                "No action recorded"}
            </div>
            <div className="timeline-list">
              {recentTimeline.map((event, index) => (
                <div key={`${event.time}-${index}`} className="timeline-item">
                  <strong>{event.event}</strong>
                  <p>
                    {event.time}
                    {event.action ? ` · ${event.action}` : ""}
                    {event.unit_id ? ` · ${event.unit_id}` : ""}
                  </p>
                </div>
              ))}
            </div>
          </article>
          ) : null}
          {showField ? (
          <article className="card panel">
            <h2>Assigned Call Deck</h2>
            <p className="section-subtitle">Keyboard shortcuts: A Accept · E En Route · O On Scene · C Clear</p>
            {(officerFeed?.assigned_incidents ?? []).length === 0 ? <div className="dispatch-banner">No active assignments for {statusUnitId}.</div> : null}
            {(officerFeed?.assigned_incidents ?? []).map((call) => (
              <div key={call.incident_id} className="hub-row">
                <strong>{call.incident_id} · {call.call_type} · P{call.priority}</strong>
                <p>{call.address} · {call.status}</p>
                <p>History: {call.history_at_address.join(" | ")}</p>
                <div className="call-actions">
                  <button type="button" onClick={() => { setSelectedIncidentId(call.incident_id); handleOfficerAction("ACCEPT"); }} disabled={loading}>Accept</button>
                  <button type="button" onClick={() => { setSelectedIncidentId(call.incident_id); handleOfficerAction("EN_ROUTE"); }} disabled={loading}>En Route</button>
                  <button type="button" onClick={() => { setSelectedIncidentId(call.incident_id); handleOfficerAction("ON_SCENE"); }} disabled={loading}>On Scene</button>
                  <button type="button" onClick={() => { setSelectedIncidentId(call.incident_id); handleOfficerAction("CLEAR"); }} disabled={loading}>Clear</button>
                </div>
              </div>
            ))}
          </article>
          ) : null}
          {(showReport || showField || showDispatch) ? (
          <article className="card panel">
            <h2>Report Writing Hub</h2>
            <p className="section-subtitle">Incident: <strong>{selectedIncident?.incident_id ?? "None selected"}</strong></p>
            <div className="template-row">
              <label className="form-field">
                Template
                <select value={selectedTemplateId} onChange={(e) => setSelectedTemplateId(e.target.value)}>
                  {(templateCatalog?.templates ?? []).map((template) => (
                    <option key={template.template_id} value={template.template_id}>
                      {template.label}{template.recommended ? " (Recommended)" : ""}
                    </option>
                  ))}
                  {(templateCatalog?.templates ?? []).length === 0 ? <option value="GENERAL_INCIDENT">General Incident</option> : null}
                </select>
              </label>
              <label className="form-field">
                AI Tone
                <select value={reportTone} onChange={(e) => setReportTone(e.target.value)}>
                  <option value="professional">Professional</option>
                  <option value="command">Command</option>
                  <option value="plain">Plain</option>
                </select>
              </label>
            </div>
            <div className="button-grid">
              <button type="button" onClick={handleApplyTemplate} disabled={loading || !selectedIncident}>
                Apply Template
              </button>
              <button type="button" onClick={handleAiReportAssist} disabled={loading || !selectedIncident}>
                AI Refine Narrative
              </button>
            </div>
            <div className="button-grid">
              <button type="button" onClick={() => appendNarrativeBlock("Witness Statements")} disabled={loading}>Insert Witness Section</button>
              <button type="button" onClick={() => appendNarrativeBlock("Evidence Collected")} disabled={loading}>Insert Evidence Section</button>
              <button type="button" onClick={() => appendNarrativeBlock("Use of Force Analysis")} disabled={loading}>Insert Force Section</button>
              <button type="button" onClick={() => appendNarrativeBlock("Medical Follow-Up")} disabled={loading}>Insert Medical Section</button>
            </div>
            <div className="toggle-row">
              <label><input type="checkbox" checked={autoSaveEnabled} onChange={(e) => setAutoSaveEnabled(e.target.checked)} /> Auto-save draft</label>
            </div>
            <div className="dispatch-banner">Auto-save: {autoSaveEnabled ? "On" : "Off"} {lastAutoSavedAt ? `· Last ${lastAutoSavedAt}` : ""}</div>
            <div className="dictation-controls">
              <div className="dictation-row">
                <button type="button" onClick={handleStartDictation} disabled={loading || !dictationSupported || isDictating}>
                  {isDictating ? "Listening..." : "Start Dictation"}
                </button>
                <button type="button" onClick={handleStopDictation} disabled={!isDictating}>
                  Stop Dictation
                </button>
              </div>
              <div className={`dictation-status ${isDictating ? "live" : ""}`}>{dictationStatus}</div>
              <div className="dictation-preview">Segments: {dictationSegments} · Total capture: {dictationSeconds}s</div>
              {dictationInterim ? <div className="dictation-preview">{dictationInterim}</div> : null}
            </div>
            <div className="dispatch-form-grid">
              <label className="form-field">Evidence Type<select value={reportEvidenceType} onChange={(e) => setReportEvidenceType(e.target.value)}><option value="photo">photo</option><option value="video">video</option><option value="bodycam">bodycam</option><option value="document">document</option></select></label>
              <label className="form-field">Evidence URI<input value={reportEvidenceUri} onChange={(e) => setReportEvidenceUri(e.target.value)} placeholder="evidence://incidents/... or secure https://..." /></label>
            </div>
            <div className="dev-actions"><button type="button" onClick={handleAttachEvidence} disabled={loading || !reportEvidenceUri.trim()}>Attach Evidence Link</button></div>
            <div className="timeline-list">
              {reportEvidence.slice(0, 4).map((item, idx) => (
                <div key={`${item.uri}-${idx}`} className="timeline-item">
                  <strong>{item.type}</strong>
                  <p>{item.uri}</p>
                  <p>{item.added_at ?? ""}</p>
                </div>
              ))}
            </div>
            <div className="dispatch-form-grid">
              <label className="form-field wide">Narrative Draft<textarea value={reportNarrative} onChange={(e) => setReportNarrative(e.target.value)} /></label>
              <label className="form-field wide">Structured Fields (key=value;key2=value2)<input value={reportFields} onChange={(e) => setReportFields(e.target.value)} /></label>
            </div>
            <div className="button-grid">
              <button type="button" onClick={handleSaveDraft} disabled={loading}>Save Draft</button>
              <button type="button" onClick={handleGenerateReport} disabled={loading || !dispositionReady}>
                Submit RMS Payload
              </button>
            </div>
            {!dispositionReady ? (
              <div className="dispatch-banner">Finalize disposition before final RMS submission.</div>
            ) : null}
            {reportSummary ? <div className="dispatch-banner">{reportSummary}</div> : null}
            {reportAssist ? <div className="ai-box"><p>{reportAssist.improved_narrative}</p><p>Key points: {reportAssist.key_points.join(" | ")}</p></div> : null}
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
          ) : null}

          {(showIntel || showField) ? (
          <article className="card panel">
            <h2>Records and Warrants Hub</h2>
            <div className="search-row">
              <input value={intelQuery} onChange={(e) => setIntelQuery(e.target.value)} />
              <button type="button" onClick={handleLookup} disabled={loading}>Run Lookup</button>
            </div>
            <div className="button-grid">
              <button type="button" onClick={() => handleQuickIntel("ADDRESS")} disabled={loading}>Lookup Selected Address</button>
              <button type="button" onClick={() => handleQuickIntel("CALLER")} disabled={loading}>Lookup Caller Name</button>
              <button type="button" onClick={() => handleQuickIntel("WARRANTS")} disabled={loading}>Lookup Warrants</button>
              <button type="button" onClick={() => { setIntelQuery("Brandon"); handleLookup(); }} disabled={loading}>Load Demo Person</button>
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
                <h3>Firearms Registry</h3>
                {(lookup?.firearms ?? []).map((entry) => (
                  <div key={entry.registration_id} className="hub-row"><strong>{entry.registration_id} - {entry.weapon_type}</strong><p>{entry.owner_name} · {entry.status}</p></div>
                ))}
              </div>
            </div>
            {profile ? <div className="profile-card"><strong>Profile - {profile.person.full_name} ({profile.person.person_id})</strong><p>Address: {profile.person.address}</p><p>Safety flags: {profile.officer_safety_flags.join(", ") || "None"}</p></div> : null}
          </article>
          ) : null}
        </section>

        <aside className="right-column">
          {(showDispatch || showReport) ? (
          <article className="card panel">
            <h2>Command Dashboard</h2>
            <div className="kpi-grid">
              <div className="kpi"><span>Active Incidents</span><strong>{command?.active_incidents ?? 0}</strong></div>
              <div className="kpi"><span>Pending Calls</span><strong>{command?.pending_calls ?? 0}</strong></div>
              <div className="kpi"><span>Units Available</span><strong>{command?.units_available ?? 0}</strong></div>
              <div className="kpi"><span>Avg ETA</span><strong>{command?.average_response_minutes ?? 0}m</strong></div>
            </div>
          </article>
          ) : null}
          {(showDispatch || showField) ? (
          <article className="card panel">
            <h2>Unit Readiness Board</h2>
            <p className="section-subtitle">Fatigue and workload guardrail for dispatch decisions.</p>
            {(unitBoard?.units ?? []).slice(0, 5).map((unit) => (
              <div key={unit.unit_id} className="hub-row">
                <strong>{unit.callsign} · {unit.status}</strong>
                <p>{unit.unit_id} · Assignments {unit.active_assignments} · Fatigue {unit.fatigue_score} · Workload {unit.workload_score}</p>
                <div className="readiness-bar"><div className={`readiness-fill ${unit.requires_break ? "risk" : ""}`} style={{ width: `${unit.readiness_score}%` }} /></div>
                <p>Readiness {unit.readiness_score}/100 · {unit.requires_break ? "Break recommended" : "Operational"}</p>
                <p>Skills: {unit.skills.join(", ")}</p>
              </div>
            ))}
          </article>
          ) : null}
          {(showDispatch || showReport) ? (
          <article className="card panel">
            <h2>Operational Trends</h2>
            <p className="section-subtitle">Last {commandTrends?.periods ?? 0} snapshots</p>
            <div className="hub-row">
              <strong>Active Incidents ({signed(commandTrends?.metrics.active_incidents.change ?? 0)})</strong>
              <p>{trendSeries(commandTrends?.metrics.active_incidents.series ?? [])}</p>
            </div>
            <div className="hub-row">
              <strong>Avg ETA ({signed(commandTrends?.metrics.average_response_minutes.change ?? 0, "m")})</strong>
              <p>{trendSeries(commandTrends?.metrics.average_response_minutes.series ?? [])}</p>
            </div>
            <div className="hub-row">
              <strong>Units Busy ({signed(commandTrends?.metrics.units_busy.change ?? 0)})</strong>
              <p>{trendSeries(commandTrends?.metrics.units_busy.series ?? [])}</p>
            </div>
          </article>
          ) : null}
          {(showDispatch || showReport) ? (
          <article className="card panel">
            <h2>Supervisor Review Queue</h2>
            <p className="section-subtitle">{reviewQueue?.review_count ?? 0} reports flagged for review</p>
            {(reviewQueue?.reports ?? []).slice(0, 5).map((item) => (
              <div key={item.report_id} className="hub-row">
                <strong>{item.report_id} · {item.incident_id}</strong>
                <p>{item.unit_id} · {item.status} · Review: {item.review_status ?? "PENDING"}</p>
                <p>{item.updated_at}</p>
                <p>{item.reasons.join(" | ")}</p>
                {item.review_notes ? <p>Latest notes: {item.review_notes}</p> : null}
                <label className="form-field">
                  Review Notes
                  <input
                    value={reviewNotesByReport[item.report_id] ?? ""}
                    onChange={(e) => setReviewNotesByReport((prev) => ({ ...prev, [item.report_id]: e.target.value }))}
                    placeholder="Optional supervisor note"
                  />
                </label>
                <div className="button-grid">
                  <button type="button" onClick={() => setSelectedIncidentId(item.incident_id)} disabled={loading}>Open Incident</button>
                  <button type="button" onClick={() => handleReviewDecision(item.report_id, "APPROVE")} disabled={loading}>Approve</button>
                  <button type="button" onClick={() => handleReviewDecision(item.report_id, "REJECT")} disabled={loading}>Request Changes</button>
                </div>
              </div>
            ))}
            {(reviewQueue?.reports ?? []).length === 0 ? <div className="dispatch-banner">No reports currently require supervisor intervention.</div> : null}
          </article>
          ) : null}
          {(showDispatch || showReport) ? (
          <article className="card panel">
            <h2>Reporting Pipeline Metrics</h2>
            <div className="kpi-grid">
              <div className="kpi"><span>Total Reports</span><strong>{reportingMetrics?.total_reports ?? 0}</strong></div>
              <div className="kpi"><span>Submitted</span><strong>{reportingMetrics?.submitted_reports ?? 0}</strong></div>
              <div className="kpi"><span>Ready For Command</span><strong>{reportingMetrics?.ready_for_command ?? 0}</strong></div>
              <div className="kpi"><span>Changes Requested</span><strong>{reportingMetrics?.changes_requested ?? 0}</strong></div>
            </div>
            <div className="dispatch-banner">
              Avg narrative length {reportingMetrics?.avg_narrative_length ?? 0} chars · Evidence rate {Math.round((reportingMetrics?.evidence_attachment_rate ?? 0) * 100)}%
            </div>
          </article>
          ) : null}

          {(showDispatch || showReport) ? (
          <article className="card panel">
            <h2>AI Operations Engine</h2>
            <p className="section-subtitle">Incident: {selectedIncident?.incident_id ?? "None selected"}</p>
            <label className="form-field">Prompt<input value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} /></label>
            <div className="dev-actions"><button type="button" onClick={handleAiAssist} disabled={loading}>Generate AI Assist</button></div>
            {aiAssist ? <div className="ai-box"><p>{aiAssist.summary}</p><p>Recommendation: <strong>{aiAssist.recommended_disposition_code}</strong></p><p>Next actions: {aiAssist.next_actions.join(" | ")}</p><p>Safety alerts: {aiAssist.officer_safety_alerts.join(" | ") || "None"}</p></div> : null}
          </article>
          ) : null}

          {showDispatch ? (
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
          ) : null}

          {(showDispatch || showField || showReport) ? (
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
          ) : null}

          {showField ? (
          <article className="card panel">
            <h2>Mobile Officer Controls</h2>
            <div className="dispatch-form-grid">
              <label className="form-field">Unit<select value={statusUnitId} onChange={(e) => setStatusUnitId(e.target.value)}>{units.map((u) => <option key={u.unit_id} value={u.unit_id}>{u.callsign} ({u.unit_id})</option>)}</select></label>
              <label className="form-field">Status<select value={statusValue} onChange={(e) => setStatusValue(e.target.value)}><option value="AVAILABLE">AVAILABLE</option><option value="EN_ROUTE">EN_ROUTE</option><option value="ON_SCENE">ON_SCENE</option><option value="BUSY">BUSY</option></select></label>
            </div>
            <div className="dev-actions"><button type="button" onClick={handleStatusUpdate} disabled={loading}>Push Status Update</button></div>
            <div className="call-actions">
              <button type="button" onClick={() => handleOfficerAction("ACCEPT")} disabled={loading}>Accept</button>
              <button type="button" onClick={() => handleOfficerAction("ARRIVED")} disabled={loading}>Arrived</button>
              <button type="button" onClick={() => handleOfficerAction("ON_SCENE")} disabled={loading}>On Scene</button>
              <button type="button" onClick={() => handleOfficerAction("CLEAR")} disabled={loading}>Clear Call</button>
            </div>
          </article>
          ) : null}

          {(showField || showDispatch) ? (
          <article className="card panel">
            <h2>Secure Messaging</h2>
            <p className="section-subtitle">Unit {statusUnitId} · Inbox {messageInbox?.message_count ?? 0}</p>
            <div className="dispatch-form-grid">
              <label className="form-field">To<input value={messageTarget} onChange={(e) => setMessageTarget(e.target.value)} placeholder="DISPATCH or unit id" /></label>
              <label className="form-field">Priority<select value={messagePriority} onChange={(e) => setMessagePriority(e.target.value)}><option value="NORMAL">NORMAL</option><option value="HIGH">HIGH</option><option value="URGENT">URGENT</option></select></label>
              <label className="form-field">Incident Channel<input value={channelIncidentId} onChange={(e) => setChannelIncidentId(e.target.value)} placeholder="INC-..." /></label>
              <label className="form-field">Unread Estimate<input value={String(messageInbox?.unread_estimate ?? 0)} readOnly /></label>
              <label className="form-field wide">Message<textarea value={messageBody} onChange={(e) => setMessageBody(e.target.value)} placeholder="Short tactical update..." /></label>
            </div>
            <div className="toggle-row">
              <label><input type="checkbox" checked={sendToIncidentChannel} onChange={(e) => setSendToIncidentChannel(e.target.checked)} /> Tag to incident channel</label>
            </div>
            <div className="dev-actions"><button type="button" onClick={handleSendMessage} disabled={loading || !messageBody.trim()}>Send Secure Message</button></div>
            {messageStatus ? <div className="dispatch-banner">{messageStatus}</div> : null}
            <div className="hub-grid">
              <div className="hub-col">
                <h3>Inbox</h3>
                <div className="timeline-list">
                  {(messageInbox?.messages ?? []).slice(0, 5).map((message) => (
                    <div key={message.message_id} className="timeline-item">
                      <strong>{message.from_unit} {"->"} {message.to_unit}</strong>
                      <p>{message.sent_at}</p>
                      <p>{message.priority ?? "NORMAL"} {message.incident_id ? `· ${message.incident_id}` : ""}</p>
                      <p>{message.body}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="hub-col">
                <h3>Incident Channel {incidentChannel?.incident_id ?? ""}</h3>
                <div className="timeline-list">
                  {(incidentChannel?.messages ?? []).slice(0, 5).map((message) => (
                    <div key={`channel-${message.message_id}`} className="timeline-item">
                      <strong>{message.from_unit}</strong>
                      <p>{message.sent_at}</p>
                      <p>{message.priority ?? "NORMAL"}</p>
                      <p>{message.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </article>
          ) : null}

          <article className="card panel">
            <h2>Hotkeys</h2>
            <div className="hub-row"><strong>View Navigation</strong><p>Alt+1 Dispatch · Alt+2 Field · Alt+3 Report · Alt+4 Intel</p></div>
            <div className="hub-row"><strong>Field Actions</strong><p>A Accept · E En Route · O On Scene · C Clear</p></div>
          </article>
        </aside>
      </main>

      <nav className="bottom-nav">
        {(["Dispatch", "Field", "Report", "Intel"] as ViewMode[]).map((mode) => (
          <button key={mode} type="button" className={viewMode === mode ? "active" : ""} onClick={() => setViewMode(mode)}>
            {mode}
          </button>
        ))}
      </nav>
    </div>
  );
}
