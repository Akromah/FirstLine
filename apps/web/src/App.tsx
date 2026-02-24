
import { FormEvent, KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo, useRef, useState } from "react";

type Coordinates = { lat: number; lon: number };
type IncidentSummary = {
  incident_id: string;
  call_type: string;
  crime_label?: string | null;
  primary_code?: string | null;
  priority: number;
  address: string;
  coordinates: Coordinates;
  status: string;
};
type UnitSummary = {
  unit_id: string;
  callsign: string;
  officer_name?: string | null;
  role: string;
  shift?: string | null;
  beat?: number | null;
  dispatchable: boolean;
  status: string;
  coordinates: Coordinates;
  skills: string[];
  workload_score: number;
  fatigue_score: number;
};
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
type UnitAvailabilityBoard = {
  summary: { available_count: number; unavailable_count: number; active_assignments: number };
  available_units: Array<{
    unit_id: string;
    callsign: string;
    officer_name: string;
    role: string;
    shift?: string | null;
    beat?: number | null;
    dispatchable: boolean;
    dispatch_note: string;
    status_code: string;
    current_location: string;
    skills: string[];
    workload_score: number;
    fatigue_score: number;
  }>;
  unavailable_units: Array<{
    unit_id: string;
    callsign: string;
    officer_name: string;
    role: string;
    shift?: string | null;
    beat?: number | null;
    dispatchable: boolean;
    dispatch_note: string;
    status_code: string;
    current_location: string;
    skills: string[];
    incident_id?: string | null;
    call_type: string;
    crime_label?: string | null;
    primary_code?: string | null;
    call_display?: string;
    incident_status: string;
    predicted_eta_minutes?: number | null;
    last_action: string;
    disposition_code?: string | null;
    disposition_summary?: string | null;
  }>;
};
type DispatchWorkflowRow = {
  incident_id: string;
  call_display: string;
  call_type: string;
  primary_code?: string | null;
  crime_label?: string | null;
  priority: number;
  address: string;
  status: string;
  phase: string;
  assigned_unit_id?: string | null;
  assigned_callsign?: string | null;
  assigned_officer?: string | null;
  unit_status?: string | null;
  created_at: string;
  elapsed_minutes: number;
  latest_event?: string | null;
  latest_action?: string | null;
  latest_event_time?: string | null;
  disposition_code?: string | null;
  disposition_summary?: string | null;
  closed_at?: string | null;
};
type DispatchWorkflowBoard = {
  summary: {
    total_calls: number;
    active_calls: number;
    resolved_calls: number;
    queued_calls: number;
    assigned_calls: number;
    on_scene_calls: number;
  };
  active_workflows: DispatchWorkflowRow[];
  resolved_workflows: DispatchWorkflowRow[];
};
type BeatOverlay = {
  beat_id: number;
  label: string;
  shift_coverage: string[];
  center: Coordinates;
  coordinates?: Coordinates[];
  boundary_roads?: string[];
  border_paths?: Array<{
    name: string;
    coordinates: Coordinates[];
  }>;
};
type PatrolSimulationStatus = {
  enabled: boolean;
  profile: string;
  started_at?: string | null;
  tick_seconds: number;
  last_tick?: string | null;
  last_call?: string | null;
  next_call_due_at?: string | null;
  calls_generated: number;
  calls_auto_assigned: number;
  calls_resolved?: number;
  calls_received?: number;
  calls_assigned?: number;
  min_call_interval_seconds?: number;
  max_call_interval_seconds?: number;
  max_active_calls?: number;
  min_call_duration_seconds?: number;
  max_call_duration_seconds?: number;
  logged_in_unit_id?: string | null;
  call_types_loaded?: number;
  call_locations_loaded?: number;
  timed_incidents?: number;
  tick_index: number;
  dispatchable_units: number;
  senior_units: number;
  beats_active: number[];
  active_incidents: number;
};
type MapOverview = {
  timestamp: string;
  traffic_overlay: string;
  hot_zones: Array<{ name: string; risk: string; score: number }>;
  geofenced_alerts: Array<{ zone: string; type: string; active: boolean }>;
  beats: BeatOverlay[];
  patrol_simulation: PatrolSimulationStatus;
  units: UnitSummary[];
  active_incidents: IncidentSummary[];
};
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
type ReportDraftDetail = ReportDraft & {
  structured_fields?: Record<string, string>;
  template_id?: string | null;
  review_status?: string;
  review_notes?: string | null;
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
type ReportReadiness = {
  incident_id: string;
  report_id?: string | null;
  has_disposition: boolean;
  has_draft: boolean;
  has_template: boolean;
  narrative_length: number;
  narrative_min_chars: number;
  has_narrative: boolean;
  evidence_count: number;
  review_required: boolean;
  review_status: string;
  review_complete: boolean;
  blockers: string[];
  ready_for_submission: boolean;
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
type IncidentIntelPacket = {
  incident_id: string;
  queries: { address_query: string; caller_query?: string | null };
  totals: { records: number; firearms: number; warrants: number; active_warrants: number };
  threat_indicators: string[];
};
type PolicySectionHit = {
  section_id: string;
  title: string;
  category: string;
  tags: string[];
  summary: string;
  snippet: string;
  source_agency?: string | null;
  source_policy_id?: string | null;
  source_policy_title?: string | null;
  source_url?: string | null;
  match_score: number;
};
type PolicySearchResponse = {
  query: string;
  sort_by: "relevance" | "title" | "section";
  result_count: number;
  library_profile?: {
    library_name?: string;
    simulated_agency?: string;
    source_agency?: string;
    source_collection?: string;
    source_url?: string;
    notes?: string;
  };
  best_guess?: PolicySectionHit | null;
  results: PolicySectionHit[];
};
type PolicySectionDetail = {
  section_id: string;
  title: string;
  category: string;
  tags: string[];
  summary: string;
  body: string;
  source_agency?: string | null;
  source_policy_id?: string | null;
  source_policy_title?: string | null;
  source_url?: string | null;
  library_profile?: {
    library_name?: string;
    simulated_agency?: string;
    source_agency?: string;
    source_collection?: string;
    source_url?: string;
    notes?: string;
  };
};
type CodeResult = {
  code_key: string;
  code_family: string;
  section: string;
  title: string;
  offense_level: string;
  summary: string;
  aliases: string[];
  keywords: string[];
  statute_url: string;
  library_source?: string;
  official_source_connected?: boolean;
  official_source?: {
    source: string;
    source_url: string;
    chapter: string;
    section_label: string;
    section_text: string;
    history?: string;
    retrieved_at: string;
  } | null;
  match_score: number;
  match_reasons: string[];
};
type CodeBestGuess = {
  code_key: string;
  code_family: string;
  section: string;
  title: string;
  summary: string;
  offense_level: string;
  statute_url: string;
  library_source?: string;
  confidence: number;
  reasons: string[];
};
type CodeSearchResponse = {
  query: string;
  sort_by: "relevance" | "numeric" | "alpha";
  result_count: number;
  best_guess?: CodeBestGuess | null;
  results: CodeResult[];
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
type AIBriefing = {
  briefing: string;
  risk_score: number;
  hazards: string[];
  checklist: string[];
};
type AIDispositionDraft = {
  incident_id: string;
  unit_id?: string | null;
  recommended_disposition_code: string;
  summary: string;
  arrest_made: boolean;
  citation_issued: boolean;
  force_used: boolean;
  requires_supervisor_review: boolean;
  confidence: number;
  reasons: string[];
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
type HandoffNote = {
  note_id: string;
  incident_id: string;
  unit_id: string;
  audience: string;
  note: string;
  created_at: string;
};
type HandoffFeed = {
  incident_id: string;
  note_count: number;
  notes: HandoffNote[];
};
type MessagingContact = {
  unit_id: string;
  display_name: string;
  subtitle: string;
  status: string;
  unread_count: number;
  last_message_at?: string | null;
  last_message_preview?: string | null;
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
type OfficerCallHistory = {
  unit_id: string;
  history_date_utc: string;
  call_count: number;
  calls: Array<{
    incident_id: string;
    call_display: string;
    call_type: string;
    priority: number;
    address: string;
    status: string;
    created_at: string;
    closed_at?: string | null;
    disposition_code?: string | null;
    disposition_summary?: string | null;
    document_count: number;
    documents: Array<{
      doc_type: string;
      report_id?: string | null;
      status?: string | null;
      review_status?: string | null;
      updated_at?: string | null;
      uri?: string | null;
    }>;
  }>;
};
type QuickActionsPolicy = {
  incident_id: string;
  unit_id?: string | null;
  incident_status: string;
  assigned_unit_id?: string | null;
  has_disposition: boolean;
  actions: Array<{ action: string; label: string; enabled: boolean; reason: string }>;
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
type CommandReportQueue = {
  report_count: number;
  pending_review_count: number;
  reports: Array<{
    report_id: string;
    incident_id: string;
    unit_id: string;
    template_id?: string | null;
    status: string;
    review_status?: string | null;
    review_notes?: string | null;
    updated_at: string;
    narrative_preview: string;
    narrative_length: number;
    incident_status?: string | null;
    call_type?: string | null;
    primary_code?: string | null;
    priority?: number | null;
    requires_supervisor_review: boolean;
    disposition_code?: string | null;
  }>;
};
type CommandCallHistory = {
  generated_at: string;
  history_date_utc: string;
  shift_filter: string;
  include_open: boolean;
  call_count: number;
  resolved_count: number;
  open_count: number;
  report_count: number;
  timeline_line_count: number;
  calls: Array<{
    incident_id: string;
    call_display: string;
    call_type: string;
    primary_code?: string | null;
    crime_label?: string | null;
    priority: number;
    address: string;
    status: string;
    created_at: string;
    closed_at?: string | null;
    assigned_unit_id?: string | null;
    assigned_callsign?: string | null;
    assigned_officer?: string | null;
    assigned_shift?: string | null;
    handling_unit_id?: string | null;
    handling_unit_label?: string | null;
    disposition_code?: string | null;
    disposition_summary?: string | null;
    requires_supervisor_review?: boolean;
    timeline_lines: Array<{
      line_no: number;
      time: string;
      event: string;
      unit_id?: string | null;
      unit_label?: string | null;
      line: string;
    }>;
    timeline_line_count: number;
    reports: Array<{
      report_id: string;
      unit_id?: string | null;
      unit_label?: string | null;
      status: string;
      review_status?: string | null;
      review_notes?: string | null;
      updated_at: string;
      narrative?: string;
      structured_fields?: Record<string, string>;
      evidence_links?: Array<{ type: string; uri: string; added_at?: string }>;
      evidence_count: number;
    }>;
    report_count: number;
  }>;
};
type AIReportAssist = {
  improved_narrative: string;
  key_points: string[];
  confidence: number;
  tone: string;
};
type ReportAuditRecommendation = {
  recommendation_id: string;
  severity: "REQUIRED" | "RECOMMENDED";
  category: string;
  title: string;
  detail: string;
  suggested_text: string;
  legal_reference?: string | null;
};
type ReportAuditResult = {
  generated_at: string;
  incident_id: string;
  unit_id?: string | null;
  crime_label?: string | null;
  primary_code?: string | null;
  recommendation_count: number;
  required_count: number;
  all_clear: boolean;
  recommendations: ReportAuditRecommendation[];
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
type ModulePanel =
  | "mapOnly"
  | "intake"
  | "queue"
  | "priorityRadar"
  | "fieldOps"
  | "assignedDeck"
  | "callHistory"
  | "reportHub"
  | "intelHub"
  | "policyHub"
  | "codeHub"
  | "commandDash"
  | "commandReports"
  | "commandCallHistory"
  | "unitReadiness"
  | "opTrends"
  | "reviewQueue"
  | "reportingMetrics"
  | "aiOps"
  | "recommendation"
  | "disposition"
  | "mobileControls"
  | "messaging"
  | "hotkeys";
type ModuleGroupId = "ops" | "field" | "reporting" | "intel" | "command" | "system";
type ModuleButton = {
  id: ModulePanel;
  label: string;
  icon: string;
  iconStyle?: "default" | "policyBook" | "codeBook";
  group: ModuleGroupId;
  visible: boolean;
  badge?: number;
};

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").trim().replace(/\/$/, "");
const MAP_STYLE_URL =
  import.meta.env.VITE_MAP_STYLE_URL ?? "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const MAP_FALLBACK_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [
    {
      id: "osm-raster",
      type: "raster",
      source: "osm",
    },
  ],
};
const PREFS_KEY = "firstline_ui_prefs_v1";
const MESSAGE_UI_PREFS_KEY = "firstline_message_ui_v1";

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const localFallbackBases = [
    "http://127.0.0.1:4100",
    "http://localhost:4100",
    "http://127.0.0.1:4000",
    "http://localhost:4000",
  ];
  const candidates = API_BASE ? [API_BASE, "", ...localFallbackBases] : ["", ...localFallbackBases];
  const bases = Array.from(new Set(candidates));
  let lastError: Error | null = null;

  for (let index = 0; index < bases.length; index += 1) {
    const base = bases[index];
    const url = `${base}${path}`;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 7000);
    try {
      const res = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      });
      window.clearTimeout(timeout);
      if (!res.ok) {
        const err = new Error(`Request failed: ${res.status}`);
        if (index < bases.length - 1) {
          lastError = err;
          continue;
        }
        throw err;
      }
      return (await res.json()) as T;
    } catch (error) {
      window.clearTimeout(timeout);
      const err = error as Error;
      if (index < bases.length - 1) {
        lastError = err;
        continue;
      }
      throw err;
    }
  }

  throw lastError ?? new Error("Request failed");
}

async function fetchJsonSafe<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    return await fetchJson<T>(path, init);
  } catch {
    return null;
  }
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

function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

function formatClockDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const hh = String(hrs).padStart(2, "0");
  const mm = String(mins).padStart(2, "0");
  const ss = String(secs).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function shortStatusCode(statusCode: string): string {
  const normalized = statusCode.trim().toUpperCase();
  if (normalized.includes("ON_SCENE")) return "SC";
  if (normalized.includes("EN_ROUTE")) return "EN";
  if (normalized.includes("TRANSPORT")) return "TR";
  if (normalized.includes("BUSY")) return "BU";
  if (normalized.includes("AVAILABLE")) return "AV";
  if (normalized.includes("OFF_DUTY")) return "OD";
  return normalized.slice(0, 2);
}

function normalizeStatusLabel(status?: string | null): string {
  const normalized = String(status ?? "").trim().toUpperCase();
  if (!normalized) return "Unknown";
  if (normalized.includes("ON_SCENE")) return "On Scene";
  if (normalized.includes("EN_ROUTE")) return "En Route";
  if (normalized.includes("TRANSPORT")) return "Transport";
  if (normalized.includes("BUSY")) return "Busy";
  if (normalized.includes("AVAILABLE")) return "Available";
  if (normalized.includes("OFF_DUTY")) return "Off Duty";
  if (normalized === "ONLINE") return "Online";
  return normalized.replaceAll("_", " ");
}

function statusTone(status?: string | null): "available" | "busy" | "offline" | "other" {
  const normalized = String(status ?? "").trim().toUpperCase();
  if (normalized.includes("AVAILABLE") || normalized === "ONLINE") return "available";
  if (normalized.includes("OFF_DUTY")) return "offline";
  if (["ON_SCENE", "EN_ROUTE", "TRANSPORT", "BUSY"].some((token) => normalized.includes(token))) return "busy";
  return "other";
}

function shiftDigit(shift?: string | null): string {
  const normalized = String(shift ?? "").trim().toUpperCase();
  if (normalized.startsWith("DAY")) return "1";
  if (normalized.startsWith("SWING")) return "2";
  if (normalized.startsWith("NIGHT")) return "3";
  return "1";
}

function unitNumberByShape(unitLike: {
  shift?: string | null;
  beat?: number | null;
  unit_id?: string | null;
  callsign?: string | null;
} | null | undefined): string {
  if (!unitLike) return "--";
  if (typeof unitLike.beat === "number" && unitLike.beat > 0) {
    return `${shiftDigit(unitLike.shift)}${unitLike.beat}`;
  }
  const unitId = String(unitLike.unit_id ?? "");
  const idMatch = unitId.match(/^u-(day|swing|night)-(\d+)$/i);
  if (idMatch) {
    const shiftMap: Record<string, string> = { day: "1", swing: "2", night: "3" };
    return `${shiftMap[idMatch[1].toLowerCase()] ?? "1"}${idMatch[2]}`;
  }
  const callsign = String(unitLike.callsign ?? "");
  const carMatch = callsign.match(/(?:car|unit)\s*([123])(\d+)/i);
  if (carMatch) return `${carMatch[1]}${carMatch[2]}`;
  const digits = callsign.match(/\d+/g)?.join("");
  if (digits) return digits.slice(0, 3);
  return "--";
}

function officerLastName(name?: string | null): string {
  const raw = String(name ?? "").trim();
  if (!raw) return "Unit";
  const scrubbed = raw.replace(/^(Ofc\.|Officer|Sgt\.|Sergeant|Lt\.|Lieutenant)\s+/i, "").trim();
  const parts = scrubbed.split(/\s+/).filter(Boolean);
  return parts[parts.length - 1] ?? "Unit";
}

function compactUnitLabel(unitLike: {
  shift?: string | null;
  beat?: number | null;
  unit_id?: string | null;
  callsign?: string | null;
  officer_name?: string | null;
} | null | undefined): string {
  if (!unitLike) return "Unknown";
  if (String(unitLike.unit_id ?? "").toUpperCase() === "DISPATCH") return "Dispatch";
  const number = unitNumberByShape(unitLike);
  const lastName = officerLastName(unitLike.officer_name ?? unitLike.callsign ?? null);
  return `${number} ${lastName}`.trim();
}

function formatMessageTimestamp(value?: string | null): string {
  if (!value) return "";
  const stamp = new Date(value);
  if (Number.isNaN(stamp.getTime())) return value;
  const now = Date.now();
  const elapsed = now - stamp.getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  if (elapsed < dayMs) return stamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (elapsed < 7 * dayMs) return stamp.toLocaleDateString([], { weekday: "short" });
  return stamp.toLocaleDateString([], { month: "numeric", day: "numeric" });
}

function incidentDispatchLabel(incident: IncidentSummary | null | undefined): string {
  if (!incident) return "Unknown";
  const code = (incident.primary_code ?? "").trim();
  const crime = (incident.crime_label ?? incident.call_type).trim();
  return code ? `${code} ${crime}` : crime;
}

function defaultViewForRole(role: string): ViewMode {
  if (role === "Officer") return "Field";
  if (role === "Supervisor") return "Report";
  return "Dispatch";
}

export default function App() {
  const [started, setStarted] = useState(false);
  const [sessionRole, setSessionRole] = useState("Dispatcher");
  const [viewMode, setViewMode] = useState<ViewMode>("Dispatch");
  const [activeModule, setActiveModule] = useState<ModulePanel>("queue");
  const [liveSimPanelOpen, setLiveSimPanelOpen] = useState(false);
  const [moduleDockOpen, setModuleDockOpen] = useState(false);
  const [statusDetailsOpen, setStatusDetailsOpen] = useState(false);
  const [moduleSearch, setModuleSearch] = useState("");
  const [openModuleGroups, setOpenModuleGroups] = useState<Record<ModuleGroupId, boolean>>({
    ops: true,
    field: false,
    reporting: false,
    intel: false,
    command: false,
    system: false,
  });
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [commandPaletteQuery, setCommandPaletteQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState("Console initialized.");
  const [liveSimBusy, setLiveSimBusy] = useState(false);
  const [simNotice, setSimNotice] = useState<{ text: string; level: "success" | "error" | "info" } | null>(null);
  const [simClockNowMs, setSimClockNowMs] = useState(() => Date.now());

  const [queue, setQueue] = useState<IncidentSummary[]>([]);
  const [units, setUnits] = useState<UnitSummary[]>([]);
  const [command, setCommand] = useState<any>(null);
  const [commandTrends, setCommandTrends] = useState<CommandTrends | null>(null);
  const [commandReports, setCommandReports] = useState<CommandReportQueue | null>(null);
  const [commandCallHistory, setCommandCallHistory] = useState<CommandCallHistory | null>(null);
  const [commandHistoryDate, setCommandHistoryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [commandHistoryShift, setCommandHistoryShift] = useState("ALL");
  const [commandCallSearch, setCommandCallSearch] = useState("");
  const [commandReportSearch, setCommandReportSearch] = useState("");
  const [commandReportReviewFilter, setCommandReportReviewFilter] = useState("ALL");
  const [unitBoard, setUnitBoard] = useState<UnitBoard | null>(null);
  const [availabilityBoard, setAvailabilityBoard] = useState<UnitAvailabilityBoard | null>(null);
  const [unitStatusClocks, setUnitStatusClocks] = useState<Record<string, { status: string; sinceMs: number }>>({});
  const [workflowBoard, setWorkflowBoard] = useState<DispatchWorkflowBoard | null>(null);
  const [priorityBoard, setPriorityBoard] = useState<PriorityRadar | null>(null);
  const [mapData, setMapData] = useState<MapOverview | null>(null);
  const [patrolStatus, setPatrolStatus] = useState<PatrolSimulationStatus | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapStyleMode, setMapStyleMode] = useState<"primary" | "fallback">("primary");
  const [mapStatusMessage, setMapStatusMessage] = useState("Map not initialized.");
  const [reportHub, setReportHub] = useState<ReportingHub | null>(null);
  const [reportingMetrics, setReportingMetrics] = useState<ReportingMetrics | null>(null);
  const [reviewQueue, setReviewQueue] = useState<ReviewQueue | null>(null);
  const [incidentDetail, setIncidentDetail] = useState<IncidentDetail | null>(null);
  const [reportReadiness, setReportReadiness] = useState<ReportReadiness | null>(null);
  const [quickActionsPolicy, setQuickActionsPolicy] = useState<QuickActionsPolicy | null>(null);
  const [commandReviewDraft, setCommandReviewDraft] = useState<ReportDraftDetail | null>(null);
  const [commandReviewBusy, setCommandReviewBusy] = useState(false);
  const [commandReviewError, setCommandReviewError] = useState("");

  const [selectedIncidentId, setSelectedIncidentId] = useState("");
  const [queueStatusFilter, setQueueStatusFilter] = useState("ALL");
  const [queuePriorityFloor, setQueuePriorityFloor] = useState(0);
  const [queueSearch, setQueueSearch] = useState("");
  const [queueSortMode, setQueueSortMode] = useState("PRIORITY_DESC");
  const [statusBoardSearch, setStatusBoardSearch] = useState("");
  const [statusBoardToneFilter, setStatusBoardToneFilter] = useState("ALL");
  const selectedIncident = useMemo(
    () => queue.find((item) => item.incident_id === selectedIncidentId) ?? queue[0],
    [queue, selectedIncidentId]
  );
  const queueSearchQuery = queueSearch.trim().toLowerCase();
  const filteredQueue = useMemo(() => {
    const filtered = queue.filter((item) => {
        const statusMatch = queueStatusFilter === "ALL" || item.status === queueStatusFilter;
        const priorityMatch = item.priority >= queuePriorityFloor;
        const callDisplay = incidentDispatchLabel(item).toLowerCase();
        const searchMatch =
          !queueSearchQuery ||
          item.incident_id.toLowerCase().includes(queueSearchQuery) ||
          item.address.toLowerCase().includes(queueSearchQuery) ||
          callDisplay.includes(queueSearchQuery);
        return statusMatch && priorityMatch && searchMatch;
      });
    const statusRank: Record<string, number> = {
      NEW: 0,
      DISPATCHED: 1,
      EN_ROUTE: 2,
      ON_SCENE: 3,
      TRANSPORT: 4,
      CLOSED: 5,
    };
    filtered.sort((a, b) => {
      if (queueSortMode === "PRIORITY_ASC") return a.priority - b.priority;
      if (queueSortMode === "STATUS") {
        const statusDelta = (statusRank[a.status] ?? 99) - (statusRank[b.status] ?? 99);
        if (statusDelta !== 0) return statusDelta;
      }
      if (queueSortMode === "INCIDENT") return a.incident_id.localeCompare(b.incident_id);
      return b.priority - a.priority;
    });
    return filtered;
  }, [queue, queueStatusFilter, queuePriorityFloor, queueSearchQuery, queueSortMode]);

  const [requiredSkills, setRequiredSkills] = useState("Crisis");
  const [recommendation, setRecommendation] = useState<any>(null);
  const [assignment, setAssignment] = useState<any>(null);
  const [riskProfile, setRiskProfile] = useState<any>(null);
  const [showMapUnits, setShowMapUnits] = useState(true);
  const [showMapIncidents, setShowMapIncidents] = useState(true);
  const [showMapBeats, setShowMapBeats] = useState(true);
  const [mapFocusMode, setMapFocusMode] = useState(false);

  const [statusUnitId, setStatusUnitId] = useState("u-201");
  const [statusValue, setStatusValue] = useState("AVAILABLE");

  const [callerName, setCallerName] = useState("Unknown");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("35 Cajon St, Redlands");
  const [lat, setLat] = useState("34.0556");
  const [lon, setLon] = useState("-117.1825");
  const [callText, setCallText] = useState("Neighbors reporting loud domestic dispute, possible weapon.");
  const [demoScenario, setDemoScenario] = useState("SHIFT_START");
  const [mockUnitsCount, setMockUnitsCount] = useState(14);
  const [mockIncidentsCount, setMockIncidentsCount] = useState(18);
  const [mockClearExisting, setMockClearExisting] = useState(false);
  const [patrolInitialCalls, setPatrolInitialCalls] = useState(4);

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
  const [reportAudit, setReportAudit] = useState<ReportAuditResult | null>(null);
  const [reportAuditLoading, setReportAuditLoading] = useState(false);
  const [ignoredReportRecommendationIds, setIgnoredReportRecommendationIds] = useState<string[]>([]);
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
  const [officerCallHistory, setOfficerCallHistory] = useState<OfficerCallHistory | null>(null);
  const [messageTarget, setMessageTarget] = useState("DISPATCH");
  const [messageThreadSearch, setMessageThreadSearch] = useState("");
  const [messageTargetByUnit, setMessageTargetByUnit] = useState<Record<string, string>>({});
  const [threadReadByUnit, setThreadReadByUnit] = useState<Record<string, Record<string, string>>>({});
  const [typingByUnit, setTypingByUnit] = useState<Record<string, boolean>>({});
  const [messageBody, setMessageBody] = useState("");
  const [messageStatus, setMessageStatus] = useState("");
  const [handoffAudience, setHandoffAudience] = useState("ALL");
  const [handoffNoteText, setHandoffNoteText] = useState("");
  const [handoffFeed, setHandoffFeed] = useState<HandoffFeed | null>(null);

  const [intelQuery, setIntelQuery] = useState("Brandon");
  const [lookup, setLookup] = useState<LookupResult | null>(null);
  const [profile, setProfile] = useState<PersonProfile | null>(null);
  const [incidentIntel, setIncidentIntel] = useState<IncidentIntelPacket | null>(null);
  const [policyQuery, setPolicyQuery] = useState("taser");
  const [policySort, setPolicySort] = useState<"relevance" | "title" | "section">("relevance");
  const [policyResults, setPolicyResults] = useState<PolicySearchResponse | null>(null);
  const [activePolicySection, setActivePolicySection] = useState<PolicySectionDetail | null>(null);
  const [codeQuery, setCodeQuery] = useState("robbery");
  const [codeSort, setCodeSort] = useState<"relevance" | "numeric" | "alpha">("relevance");
  const [codeResults, setCodeResults] = useState<CodeSearchResponse | null>(null);
  const [activeCodeDetail, setActiveCodeDetail] = useState<CodeResult | null>(null);

  const [aiPrompt, setAiPrompt] = useState("Provide next actions and final disposition.");
  const [aiAssist, setAiAssist] = useState<AIAssist | null>(null);
  const [safetyBriefing, setSafetyBriefing] = useState<AIBriefing | null>(null);
  const [aiDispositionDraft, setAiDispositionDraft] = useState<AIDispositionDraft | null>(null);
  const visibleReportRecommendations = useMemo(
    () =>
      (reportAudit?.recommendations ?? []).filter(
        (item) => !ignoredReportRecommendationIds.includes(item.recommendation_id)
      ),
    [reportAudit, ignoredReportRecommendationIds]
  );
  const visibleRequiredReportRecommendations = useMemo(
    () => visibleReportRecommendations.filter((item) => item.severity === "REQUIRED"),
    [visibleReportRecommendations]
  );
  const hiddenReportRecommendationCount = Math.max(
    0,
    (reportAudit?.recommendations.length ?? 0) - visibleReportRecommendations.length
  );

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const mapLibRef = useRef<any>(null);
  const markerRefs = useRef<any[]>([]);
  const mapFallbackTriedRef = useRef(false);
  const selectedIncidentIdRef = useRef(selectedIncidentId);
  const statusUnitIdRef = useRef(statusUnitId);
  const commandHistoryDateRef = useRef(commandHistoryDate);
  const commandHistoryShiftRef = useRef(commandHistoryShift);
  const dictationRef = useRef<any>(null);
  const dictationStartRef = useRef<number | null>(null);
  const commandPaletteInputRef = useRef<HTMLInputElement | null>(null);
  const messageThreadListRef = useRef<HTMLDivElement | null>(null);
  const messagingContextUnitRef = useRef<string | null>(null);
  const messageStatusTimerRef = useRef<number | null>(null);
  const simNoticeTimerRef = useRef<number | null>(null);
  const simulatedReplyTimersRef = useRef<number[]>([]);
  const simulatedTypingTimersRef = useRef<number[]>([]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PREFS_KEY);
      if (!raw) return;
      const prefs = JSON.parse(raw) as Record<string, unknown>;
      if (typeof prefs.sessionRole === "string") setSessionRole(prefs.sessionRole);
      if (typeof prefs.viewMode === "string") setViewMode(prefs.viewMode as ViewMode);
      if (typeof prefs.statusUnitId === "string") setStatusUnitId(prefs.statusUnitId);
      if (typeof prefs.activeModule === "string") setActiveModule(prefs.activeModule as ModulePanel);
      if (typeof prefs.showMapUnits === "boolean") setShowMapUnits(prefs.showMapUnits);
      if (typeof prefs.showMapIncidents === "boolean") setShowMapIncidents(prefs.showMapIncidents);
      if (typeof prefs.showMapBeats === "boolean") setShowMapBeats(prefs.showMapBeats);
      if (typeof prefs.autoSaveEnabled === "boolean") setAutoSaveEnabled(prefs.autoSaveEnabled);
      if (typeof prefs.queueStatusFilter === "string") setQueueStatusFilter(prefs.queueStatusFilter);
      if (typeof prefs.queuePriorityFloor === "number") setQueuePriorityFloor(prefs.queuePriorityFloor);
      if (typeof prefs.queueSearch === "string") setQueueSearch(prefs.queueSearch);
      if (typeof prefs.queueSortMode === "string") setQueueSortMode(prefs.queueSortMode);
      if (typeof prefs.statusBoardSearch === "string") setStatusBoardSearch(prefs.statusBoardSearch);
      if (typeof prefs.statusBoardToneFilter === "string") setStatusBoardToneFilter(prefs.statusBoardToneFilter);
      if (typeof prefs.commandCallSearch === "string") setCommandCallSearch(prefs.commandCallSearch);
      if (typeof prefs.commandReportSearch === "string") setCommandReportSearch(prefs.commandReportSearch);
      if (typeof prefs.commandReportReviewFilter === "string") setCommandReportReviewFilter(prefs.commandReportReviewFilter);
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
          activeModule,
          showMapUnits,
          showMapIncidents,
          showMapBeats,
          autoSaveEnabled,
          queueStatusFilter,
          queuePriorityFloor,
          queueSearch,
          queueSortMode,
          statusBoardSearch,
          statusBoardToneFilter,
          commandCallSearch,
          commandReportSearch,
          commandReportReviewFilter,
        })
      );
    } catch {
      // Ignore storage write failures.
    }
  }, [
    sessionRole,
    viewMode,
    statusUnitId,
    activeModule,
    showMapUnits,
    showMapIncidents,
    showMapBeats,
    autoSaveEnabled,
    queueStatusFilter,
    queuePriorityFloor,
    queueSearch,
    queueSortMode,
    statusBoardSearch,
    statusBoardToneFilter,
    commandCallSearch,
    commandReportSearch,
    commandReportReviewFilter,
  ]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(MESSAGE_UI_PREFS_KEY);
      if (!raw) return;
      const prefs = JSON.parse(raw) as {
        messageTargetByUnit?: Record<string, string>;
        threadReadByUnit?: Record<string, Record<string, string>>;
      };
      if (prefs.messageTargetByUnit && typeof prefs.messageTargetByUnit === "object") {
        setMessageTargetByUnit(prefs.messageTargetByUnit);
      }
      if (prefs.threadReadByUnit && typeof prefs.threadReadByUnit === "object") {
        setThreadReadByUnit(prefs.threadReadByUnit);
      }
    } catch {
      // Ignore malformed messaging preference payloads.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        MESSAGE_UI_PREFS_KEY,
        JSON.stringify({
          messageTargetByUnit,
          threadReadByUnit,
        })
      );
    } catch {
      // Ignore storage write failures.
    }
  }, [messageTargetByUnit, threadReadByUnit]);

  useEffect(() => {
    selectedIncidentIdRef.current = selectedIncidentId;
  }, [selectedIncidentId]);

  useEffect(() => {
    statusUnitIdRef.current = statusUnitId;
  }, [statusUnitId]);

  useEffect(() => {
    commandHistoryDateRef.current = commandHistoryDate;
  }, [commandHistoryDate]);

  useEffect(() => {
    commandHistoryShiftRef.current = commandHistoryShift;
  }, [commandHistoryShift]);

  useEffect(() => {
    if (!availabilityBoard) return;
    const nowMs = Date.now();
    const allUnits = [
      ...(availabilityBoard.available_units ?? []),
      ...(availabilityBoard.unavailable_units ?? []),
    ];
    setUnitStatusClocks((previous) => {
      const next = { ...previous };
      const seen = new Set<string>();
      allUnits.forEach((unit) => {
        const unitId = unit.unit_id;
        const nextStatus = String(unit.status_code ?? unit.dispatch_note ?? unit.role ?? "UNKNOWN").toUpperCase();
        seen.add(unitId);
        const current = previous[unitId];
        if (!current || current.status !== nextStatus) {
          next[unitId] = { status: nextStatus, sinceMs: nowMs };
        } else {
          next[unitId] = current;
        }
      });
      Object.keys(next).forEach((unitId) => {
        if (!seen.has(unitId)) delete next[unitId];
      });
      return next;
    });
  }, [availabilityBoard]);

  function showSimNotice(text: string, level: "success" | "error" | "info" = "info", ttlMs = 4200) {
    setSimNotice({ text, level });
    if (simNoticeTimerRef.current) window.clearTimeout(simNoticeTimerRef.current);
    simNoticeTimerRef.current = window.setTimeout(() => {
      setSimNotice(null);
      simNoticeTimerRef.current = null;
    }, ttlMs);
  }

  useEffect(
    () => () => {
      if (messageStatusTimerRef.current) window.clearTimeout(messageStatusTimerRef.current);
      if (simNoticeTimerRef.current) window.clearTimeout(simNoticeTimerRef.current);
      simulatedReplyTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      simulatedTypingTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      simulatedReplyTimersRef.current = [];
      simulatedTypingTimersRef.current = [];
    },
    []
  );

  useEffect(() => {
    async function loadOfficerPanels() {
      if (!statusUnitId) {
        setMessageInbox(null);
        setOfficerFeed(null);
        setOfficerCallHistory(null);
        return;
      }
      const [inbox, feed, history] = await Promise.all([
        fetchJsonSafe<MessageInbox>(`/api/v1/officer/messages/${statusUnitId}?limit=40`),
        fetchJsonSafe<OfficerFeed>(`/api/v1/officer/feed/${statusUnitId}`),
        fetchJsonSafe<OfficerCallHistory>(`/api/v1/officer/call-history/${statusUnitId}?limit=25`),
      ]);
      setMessageInbox(inbox);
      setOfficerFeed(feed);
      setOfficerCallHistory(history);
    }
    loadOfficerPanels();
  }, [statusUnitId]);

  useEffect(() => {
    async function loadHandoffFeed() {
      if (!selectedIncident?.incident_id) {
        setHandoffFeed(null);
        return;
      }
      try {
        const feed = await fetchJson<HandoffFeed>(`/api/v1/officer/handoff/${selectedIncident.incident_id}?limit=8`);
        setHandoffFeed(feed);
      } catch {
        setHandoffFeed(null);
      }
    }
    loadHandoffFeed();
  }, [selectedIncident?.incident_id, queue.length]);

  useEffect(() => {
    setViewMode(defaultViewForRole(sessionRole));
    setActiveModule("mapOnly");
  }, [sessionRole]);

  useEffect(() => {
    void refreshDashboard();
  }, [commandHistoryDate, commandHistoryShift]);

  async function refreshDashboard() {
    const feedPromise = statusUnitIdRef.current
      ? fetchJsonSafe<OfficerFeed>(`/api/v1/officer/feed/${statusUnitIdRef.current}`)
      : Promise.resolve(null);
    const inboxPromise = statusUnitIdRef.current
      ? fetchJsonSafe<MessageInbox>(`/api/v1/officer/messages/${statusUnitIdRef.current}?limit=40`)
      : Promise.resolve(null);
    const historyPromise = statusUnitIdRef.current
      ? fetchJsonSafe<OfficerCallHistory>(`/api/v1/officer/call-history/${statusUnitIdRef.current}?limit=25`)
      : Promise.resolve(null);
    const [q, u, ub, ab, wb, pb, c, ct, cr, ch, m, h, rm, rq, inbox, feed, history, patrol] = await Promise.all([
      fetchJsonSafe<{ incidents: IncidentSummary[] }>("/api/v1/dispatch/queue"),
      fetchJsonSafe<{ units: UnitSummary[] }>("/api/v1/dispatch/units"),
      fetchJsonSafe<UnitBoard>("/api/v1/dispatch/unit-board"),
      fetchJsonSafe<UnitAvailabilityBoard>("/api/v1/dispatch/availability-board"),
      fetchJsonSafe<DispatchWorkflowBoard>("/api/v1/dispatch/workflow-board?active_limit=20&resolved_limit=20"),
      fetchJsonSafe<PriorityRadar>("/api/v1/dispatch/priority-board?limit=6"),
      fetchJsonSafe<any>("/api/v1/command/overview"),
      fetchJsonSafe<CommandTrends>("/api/v1/command/trends?periods=6"),
      fetchJsonSafe<CommandReportQueue>("/api/v1/command/reports?limit=20"),
      fetchJsonSafe<CommandCallHistory>(
        `/api/v1/command/call-history?limit=80&history_date_utc=${encodeURIComponent(commandHistoryDateRef.current)}&shift=${encodeURIComponent(commandHistoryShiftRef.current)}`
      ),
      fetchJsonSafe<MapOverview>("/api/v1/map/overview"),
      fetchJsonSafe<ReportingHub>("/api/v1/reporting/hub"),
      fetchJsonSafe<ReportingMetrics>("/api/v1/reporting/metrics"),
      fetchJsonSafe<ReviewQueue>("/api/v1/reporting/review-queue"),
      inboxPromise,
      feedPromise,
      historyPromise,
      fetchJsonSafe<PatrolSimulationStatus>("/api/v1/intake/patrol-sim/status"),
    ]);

    if (q) {
      setQueue(q.incidents);
      if (!selectedIncidentIdRef.current && q.incidents.length > 0) setSelectedIncidentId(q.incidents[0].incident_id);
    }
    if (u) {
      setUnits(u.units);
      if (u.units.length > 0 && (!statusUnitIdRef.current || !u.units.some((item) => item.unit_id === statusUnitIdRef.current))) {
        setStatusUnitId(u.units[0].unit_id);
      }
    }
    if (ub) setUnitBoard(ub);
    if (ab) setAvailabilityBoard(ab);
    if (wb) setWorkflowBoard(wb);
    if (pb) setPriorityBoard(pb);
    if (c) setCommand(c);
    if (ct) setCommandTrends(ct);
    if (cr) setCommandReports(cr);
    if (ch) setCommandCallHistory(ch);
    if (m) {
      setMapData(m);
      setPatrolStatus(m.patrol_simulation ?? patrol ?? null);
    } else if (patrol) {
      setPatrolStatus(patrol);
    }
    if (h) setReportHub(h);
    if (rm) setReportingMetrics(rm);
    if (rq) setReviewQueue(rq);
    if (inbox !== null) setMessageInbox(inbox);
    if (feed !== null) setOfficerFeed(feed);
    if (history !== null) setOfficerCallHistory(history);

    const coreSyncOk = Boolean(q && u && (m || patrol));
    if (!coreSyncOk) {
      setBanner("API partial sync: one or more endpoints unavailable. Core updates will continue as available.");
    }
  }
  useEffect(() => {
    refreshDashboard();
    const intervalMs = patrolStatus?.enabled ? 3000 : 12000;
    const timer = window.setInterval(refreshDashboard, intervalMs);
    return () => window.clearInterval(timer);
  }, [patrolStatus?.enabled]);

  useEffect(() => {
    if (!patrolStatus?.enabled || !patrolStatus.started_at) return;
    setSimClockNowMs(Date.now());
    const timer = window.setInterval(() => setSimClockNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [patrolStatus?.enabled, patrolStatus?.started_at]);

  useEffect(() => {
    if (!started) return;
    if (!mapContainerRef.current || mapRef.current) return;
    let canceled = false;
    let styleLoaded = false;
    let loadWatchdog: number | null = null;
    setMapStatusMessage("Loading map style...");
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

      const switchToFallback = (reason: string) => {
        if (mapFallbackTriedRef.current || !mapRef.current) return;
        mapFallbackTriedRef.current = true;
        setMapReady(false);
        setMapStyleMode("fallback");
        setMapStatusMessage("Fallback map style active.");
        setBanner(`Primary map style unavailable (${reason}). Switched to fallback tiles.`);
        try {
          mapRef.current.setStyle(MAP_FALLBACK_STYLE as any);
        } catch {
          setBanner("Map fallback style also failed to load.");
        }
      };

      const onStyleReady = () => {
        styleLoaded = true;
        setMapReady(true);
        setMapStatusMessage(mapFallbackTriedRef.current ? "Fallback map style active." : "Primary map style active.");
        map.resize();
      };

      map.on("load", onStyleReady);
      map.on("style.load", onStyleReady);

      map.on("error", (event: any) => {
        if (styleLoaded || mapFallbackTriedRef.current) return;
        const message = String(event?.error?.message ?? "style/tile load error");
        switchToFallback(message);
      });

      loadWatchdog = window.setTimeout(() => {
        if (!styleLoaded) switchToFallback("load timeout");
      }, 9000);
    }).catch(() => {
      setBanner("Map library failed to load.");
      setMapStatusMessage("Map library failed to load.");
    });
    return () => {
      canceled = true;
      if (loadWatchdog) window.clearTimeout(loadWatchdog);
      markerRefs.current.forEach((marker) => marker.remove());
      markerRefs.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
      mapLibRef.current = null;
      mapFallbackTriedRef.current = false;
      setMapReady(false);
      setMapStatusMessage("Map not initialized.");
    };
  }, [started]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !mapData || !mapLibRef.current) return;
    const map = mapRef.current;
    const beatAreaSourceId = "firstline-beat-areas";
    const beatFillLayerId = "firstline-beat-fill";
    const beatBorderSourceId = "firstline-beat-borders";
    const beatBorderLayerId = "firstline-beat-border-lines";
    const beatLabelSourceId = "firstline-beat-labels";
    const beatLabelLayerId = "firstline-beat-labels-layer";

    const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
      (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

    const buildBeatAreaRing = (beat: BeatOverlay): [number, number][] | null => {
      const pointMap = new Map<string, [number, number]>();
      for (const path of beat.border_paths ?? []) {
        for (const point of path.coordinates ?? []) {
          const key = `${point.lon.toFixed(6)}:${point.lat.toFixed(6)}`;
          pointMap.set(key, [point.lon, point.lat]);
        }
      }
      if (pointMap.size < 3 && (beat.coordinates ?? []).length >= 3) {
        const ring = (beat.coordinates ?? []).map((point) => [point.lon, point.lat] as [number, number]);
        if (ring.length >= 3) {
          const [firstLon, firstLat] = ring[0];
          const [lastLon, lastLat] = ring[ring.length - 1];
          if (firstLon !== lastLon || firstLat !== lastLat) ring.push([firstLon, firstLat]);
          return ring;
        }
      }
      if (pointMap.size < 3) return null;
      const points = Array.from(pointMap.values()).sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]));
      const lower: [number, number][] = [];
      for (const p of points) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
        lower.push(p);
      }
      const upper: [number, number][] = [];
      for (let i = points.length - 1; i >= 0; i -= 1) {
        const p = points[i];
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
        upper.push(p);
      }
      const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
      if (hull.length < 3) return null;
      hull.push(hull[0]);
      return hull;
    };

    const removeBeatLayers = () => {
      if (map.getLayer(beatLabelLayerId)) map.removeLayer(beatLabelLayerId);
      if (map.getLayer(beatFillLayerId)) map.removeLayer(beatFillLayerId);
      if (map.getLayer(beatBorderLayerId)) map.removeLayer(beatBorderLayerId);
      if (map.getSource(beatLabelSourceId)) map.removeSource(beatLabelSourceId);
      if (map.getSource(beatAreaSourceId)) map.removeSource(beatAreaSourceId);
      if (map.getSource(beatBorderSourceId)) map.removeSource(beatBorderSourceId);
    };

    if (showMapBeats && (mapData.beats ?? []).length > 0) {
      const areaFeatures: any[] = [];
      const borderFeatures: any[] = [];
      for (const beat of mapData.beats) {
        const ring = buildBeatAreaRing(beat);
        if (ring && ring.length >= 4) {
          areaFeatures.push({
            type: "Feature",
            properties: {
              beat_id: beat.beat_id,
              label: beat.label,
            },
            geometry: { type: "Polygon", coordinates: [ring] },
          });
        }
        const hasRoadPaths = (beat.border_paths ?? []).length > 0;
        for (const path of beat.border_paths ?? []) {
          const line = (path.coordinates ?? []).map((point) => [point.lon, point.lat]);
          if (line.length < 2) continue;
          borderFeatures.push({
            type: "Feature",
            properties: {
              beat_id: beat.beat_id,
              label: beat.label,
              road_name: path.name,
            },
            geometry: { type: "LineString", coordinates: line },
          });
        }
        if (!hasRoadPaths && (beat.coordinates ?? []).length >= 2) {
          const ring = (beat.coordinates ?? []).map((point) => [point.lon, point.lat]);
          if (ring.length > 1) {
            const [firstLon, firstLat] = ring[0];
            const [lastLon, lastLat] = ring[ring.length - 1];
            if (firstLon !== lastLon || firstLat !== lastLat) ring.push([firstLon, firstLat]);
            borderFeatures.push({
              type: "Feature",
              properties: {
                beat_id: beat.beat_id,
                label: beat.label,
                road_name: "Beat Boundary",
              },
              geometry: { type: "LineString", coordinates: ring },
            });
          }
        }
      }

      const beatAreaGeoJson = {
        type: "FeatureCollection",
        features: areaFeatures,
      };
      const beatBorderGeoJson = {
        type: "FeatureCollection",
        features: borderFeatures,
      };
      const beatLabelGeoJson = {
        type: "FeatureCollection",
        features: mapData.beats.map((beat) => ({
          type: "Feature",
          properties: { label: beat.label },
          geometry: { type: "Point", coordinates: [beat.center.lon, beat.center.lat] },
        })),
      };

      const existingAreaSource = map.getSource(beatAreaSourceId) as any;
      const existingSource = map.getSource(beatBorderSourceId) as any;
      const existingLabelSource = map.getSource(beatLabelSourceId) as any;
      if (existingAreaSource?.setData && existingSource?.setData) {
        existingAreaSource.setData(beatAreaGeoJson as any);
        existingSource.setData(beatBorderGeoJson as any);
        if (existingLabelSource?.setData) {
          existingLabelSource.setData(beatLabelGeoJson as any);
        } else {
          map.addSource(beatLabelSourceId, {
            type: "geojson",
            data: beatLabelGeoJson as any,
          });
          if (!map.getLayer(beatLabelLayerId)) {
            map.addLayer({
              id: beatLabelLayerId,
              type: "symbol",
              source: beatLabelSourceId,
              layout: {
                "text-field": ["get", "label"],
                "text-size": 12,
                "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
              },
              paint: {
                "text-color": "#d9ecff",
                "text-halo-color": "#0a1a2d",
                "text-halo-width": 1.2,
              },
            });
          }
        }
      } else {
        removeBeatLayers();
        map.addSource(beatAreaSourceId, {
          type: "geojson",
          data: beatAreaGeoJson as any,
        });
        map.addLayer({
          id: beatFillLayerId,
          type: "fill",
          source: beatAreaSourceId,
          paint: {
            "fill-color": [
              "match",
              ["get", "beat_id"],
              1, "#4bc0ff",
              2, "#4dd97a",
              3, "#f4c15a",
              4, "#ff8b6b",
              5, "#8be9ff",
              6, "#ffd36b",
              "#54d0ff",
            ],
            "fill-opacity": 0.14,
          },
        });
        map.addSource(beatBorderSourceId, {
          type: "geojson",
          data: beatBorderGeoJson as any,
        });
        map.addLayer({
          id: beatBorderLayerId,
          type: "line",
          source: beatBorderSourceId,
          paint: {
            "line-color": [
              "match",
              ["get", "beat_id"],
              1, "#4bc0ff",
              2, "#4dd97a",
              3, "#f4c15a",
              4, "#ff8b6b",
              5, "#8be9ff",
              6, "#ffd36b",
              "#54d0ff",
            ],
            "line-width": 4,
            "line-opacity": 0.95,
          },
          layout: {
            "line-join": "round",
            "line-cap": "round",
          },
        });
        map.addSource(beatLabelSourceId, {
          type: "geojson",
          data: beatLabelGeoJson as any,
        });
        map.addLayer({
          id: beatLabelLayerId,
          type: "symbol",
          source: beatLabelSourceId,
          layout: {
            "text-field": ["get", "label"],
            "text-size": 12,
            "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
          },
          paint: {
            "text-color": "#d9ecff",
            "text-halo-color": "#0a1a2d",
            "text-halo-width": 1.2,
          },
        });
      }
    } else {
      removeBeatLayers();
    }

    markerRefs.current.forEach((m) => m.remove());
    markerRefs.current = [];

    if (showMapUnits) {
      mapData.units.forEach((unit: UnitSummary) => {
        const el = document.createElement("div");
        el.className = `map-unit-marker status-${unit.status.toLowerCase().replaceAll("_", "-")}`;
        const officerShort = (unit.officer_name ?? "Unassigned").replace("Ofc. ", "");
        el.innerText = `${unit.callsign}\n${officerShort}`;
        el.title = `${unit.callsign} · ${unit.officer_name ?? "Unassigned"} · ${unit.status} · Beat ${unit.beat ?? "N/A"} · Click to message`;
        el.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          openMessagingThread(unit.unit_id);
        });
        const marker = new mapLibRef.current.Marker({ element: el }).setLngLat([unit.coordinates.lon, unit.coordinates.lat]).addTo(mapRef.current!);
        markerRefs.current.push(marker);
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
  }, [mapData, selectedIncident, mapReady, showMapUnits, showMapIncidents, showMapBeats, statusUnitId]);

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
    setReportNarrative(`Incident ${selectedIncident.incident_id}: ${incidentDispatchLabel(selectedIncident)} at ${selectedIncident.address}.`);
    setIncidentIntel(null);
    setAiDispositionDraft(null);
    setHandoffNoteText("");
  }, [selectedIncident?.incident_id]);

  useEffect(() => {
    setReportAudit(null);
    setIgnoredReportRecommendationIds([]);
  }, [selectedIncident?.incident_id, statusUnitId]);

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
    async function loadQuickActions() {
      if (!selectedIncident) {
        setQuickActionsPolicy(null);
        return;
      }
      try {
        const policy = await fetchJson<QuickActionsPolicy>(
          `/api/v1/officer/quick-actions/${selectedIncident.incident_id}?unit_id=${statusUnitId}`
        );
        setQuickActionsPolicy(policy);
      } catch {
        setQuickActionsPolicy(null);
      }
    }
    loadQuickActions();
  }, [
    selectedIncident?.incident_id,
    statusUnitId,
    incidentDetail?.incident?.status,
    reportReadiness?.has_disposition ? "ready" : "pending",
  ]);

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
    if (activeModule === "policyHub" && !policyResults) {
      void runPolicySearch(policyQuery, policySort);
    }
    if (activeModule === "codeHub" && !codeResults) {
      void runCodeSearch(codeQuery, codeSort);
    }
  }, [activeModule]);

  useEffect(() => {
    if (activeModule !== "reportHub" || !selectedIncident) return;
    void runReportAudit({ silent: true });
  }, [activeModule, selectedIncident?.incident_id, statusUnitId]);

  useEffect(() => {
    async function loadReportReadiness() {
      if (!selectedIncident) {
        setReportReadiness(null);
        return;
      }
      try {
        const readiness = await fetchJson<ReportReadiness>(
          `/api/v1/reporting/readiness/${selectedIncident.incident_id}?unit_id=${statusUnitId}`
        );
        setReportReadiness(readiness);
      } catch {
        setReportReadiness(null);
      }
    }
    loadReportReadiness();
  }, [
    selectedIncident?.incident_id,
    statusUnitId,
    reportHub?.drafts.length,
    incidentDetail?.incident?.disposition ? "ready" : "pending",
  ]);

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
    // Role consoles are intentionally locked after login.
    setViewMode(defaultViewForRole(sessionRole));
  }, [started, sessionRole]);

  useEffect(() => {
    function onPaletteToggle(event: KeyboardEvent) {
      const active = document.activeElement?.tagName;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
        setCommandPaletteQuery("");
      }
      if (
        event.key === "Escape" &&
        commandPaletteOpen &&
        active !== "INPUT" &&
        active !== "TEXTAREA" &&
        active !== "SELECT"
      ) {
        setCommandPaletteOpen(false);
      }
    }

    window.addEventListener("keydown", onPaletteToggle);
    return () => window.removeEventListener("keydown", onPaletteToggle);
  }, [commandPaletteOpen]);

  useEffect(() => {
    if (!commandPaletteOpen) return;
    const timer = window.setTimeout(() => commandPaletteInputRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, [commandPaletteOpen]);

  useEffect(() => {
    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMapFocusMode(false);
        setCommandPaletteOpen(false);
      }
    }
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, []);

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

  async function handleGenerateMockData() {
    setLoading(true);
    try {
      const result = await fetchJson<{
        units_created: number;
        incidents_created: number;
        assigned_incidents: number;
      }>("/api/v1/intake/mock-seed", {
        method: "POST",
        body: JSON.stringify({
          units_count: mockUnitsCount,
          incidents_count: mockIncidentsCount,
          clear_existing: mockClearExisting,
          auto_assign: true,
        }),
      });
      setBanner(
        `Mock dataset generated: ${result.units_created} units, ${result.incidents_created} incidents, ${result.assigned_incidents} assigned.`
      );
      await refreshDashboard();
    } catch (error) {
      setBanner(`Mock seed failed: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleStartPatrolSimulation() {
    setLoading(true);
    try {
      const result = await fetchJson<{
        dispatchable_units: number;
        senior_units: number;
        beats_active: number[];
        initial_calls: number;
        initial_assigned: number;
        }>("/api/v1/intake/patrol-sim/start", {
        method: "POST",
        body: JSON.stringify({
          clear_existing: true,
          tick_seconds: 12,
          initial_calls: patrolInitialCalls,
          live_mode: false,
        }),
      });
      setBanner(
        `Patrol simulation live: ${result.dispatchable_units} dispatchable officers across beats ${result.beats_active.join(", ")}.`
      );
      showSimNotice(
        `Patrol simulation started with ${result.dispatchable_units} dispatchable units. Open Unit Board or Simulation Console to monitor.`,
        "success"
      );
      await refreshDashboard();
    } catch (error) {
      setBanner(`Patrol simulation failed: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleLiveSimulation() {
    if (liveSimBusy) return;
    const liveRunning = Boolean(patrolStatus?.enabled && patrolStatus.profile === "LIVE_DEV");
    setLiveSimBusy(true);
    try {
      if (liveRunning) {
        await fetchJson<{ stopped: boolean }>("/api/v1/intake/patrol-sim/stop", { method: "POST" });
        setBanner("Live simulation stopped.");
        showSimNotice("Live simulation stopped.", "success");
      } else {
        const result = await fetchJson<{
          dispatchable_units: number;
          initial_calls: number;
          initial_assigned: number;
          max_active_calls: number;
          next_call_due_at?: string | null;
          call_types_loaded?: number;
          call_locations_loaded?: number;
        }>("/api/v1/intake/patrol-sim/start", {
          method: "POST",
          body: JSON.stringify({
            clear_existing: true,
            live_mode: true,
            tick_seconds: 8,
            initial_calls: 6,
            logged_in_unit_id: statusUnitId || null,
            min_call_interval_seconds: 30,
            max_call_interval_seconds: 120,
            max_active_calls: 10,
            min_call_duration_seconds: 240,
            max_call_duration_seconds: 600,
          }),
        });
        await fetchJsonSafe<{ advanced: boolean }>("/api/v1/intake/patrol-sim/tick", { method: "POST" });
        const [bootstrapQueue, bootstrapUnits, bootstrapAvailability, bootstrapWorkflow, bootstrapMap] = await Promise.all([
          fetchJsonSafe<{ incidents: IncidentSummary[] }>("/api/v1/dispatch/queue"),
          fetchJsonSafe<{ units: UnitSummary[] }>("/api/v1/dispatch/units"),
          fetchJsonSafe<UnitAvailabilityBoard>("/api/v1/dispatch/availability-board"),
          fetchJsonSafe<DispatchWorkflowBoard>("/api/v1/dispatch/workflow-board?active_limit=20&resolved_limit=20"),
          fetchJsonSafe<MapOverview>("/api/v1/map/overview"),
        ]);
        if (bootstrapQueue) setQueue(bootstrapQueue.incidents);
        if (bootstrapUnits) setUnits(bootstrapUnits.units);
        if (bootstrapAvailability) setAvailabilityBoard(bootstrapAvailability);
        if (bootstrapWorkflow) setWorkflowBoard(bootstrapWorkflow);
        if (bootstrapMap) {
          setMapData(bootstrapMap);
          setPatrolStatus(bootstrapMap.patrol_simulation ?? null);
        }
        setShowMapUnits(true);
        setShowMapIncidents(true);
        setShowMapBeats(true);
        const onlineUnitCount = bootstrapUnits?.units.length ?? result.dispatchable_units;
        const activeQueueCount = bootstrapQueue?.incidents.length ?? result.initial_calls;
        setBanner(
          `Live simulation active: ${onlineUnitCount} units online, ${activeQueueCount} active calls, ${result.initial_assigned} initially assigned, max ${result.max_active_calls}. Call catalog ${result.call_types_loaded ?? 0} types / ${result.call_locations_loaded ?? 0} Redlands locations.`
        );
        if (onlineUnitCount <= 0) {
          showSimNotice("Simulation started but no units loaded from API. Check API routing/port configuration.", "error", 5200);
        } else if (activeQueueCount <= 0) {
          showSimNotice("Simulation started but no active calls were returned. Running with empty queue.", "info");
        } else {
          showSimNotice(
            `Simulation started: ${activeQueueCount} active calls and ${onlineUnitCount} officers online.`,
            "success"
          );
        }
        if (activeModule !== "mapOnly") setActiveModule("mapOnly");
      }
      await refreshDashboard();
    } catch (error) {
      setBanner(`Live simulation toggle failed: ${(error as Error).message}`);
      showSimNotice(`Live simulation failed to toggle: ${(error as Error).message}`, "error", 5200);
    } finally {
      setLiveSimBusy(false);
    }
  }

  async function handleStopPatrolSimulation() {
    setLoading(true);
    try {
      await fetchJson<{ stopped: boolean }>("/api/v1/intake/patrol-sim/stop", { method: "POST" });
      setBanner("Patrol simulation stopped.");
      await refreshDashboard();
    } catch (error) {
      setBanner(`Stop patrol simulation failed: ${(error as Error).message}`);
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

  async function handleOfficerAction(action: string, incidentIdOverride?: string) {
    const incidentId = incidentIdOverride ?? selectedIncident?.incident_id;
    if (!incidentId || !statusUnitId) return;
    setLoading(true);
    try {
      const result = await fetchJson<{ ok: boolean; error?: string }>("/api/v1/officer/action", {
        method: "POST",
        body: JSON.stringify({ incident_id: incidentId, unit_id: statusUnitId, action }),
      });
      if (!result.ok) {
        setBanner(result.error ?? `Officer action blocked: ${action}`);
        return;
      }
      setSelectedIncidentId(incidentId);
      setBanner(`Officer action recorded: ${action} on ${incidentId}.`);
      await refreshDashboard();
    } catch (error) {
      setBanner(`Officer action failed: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  async function runReportAudit(options?: { narrative?: string; silent?: boolean }) {
    if (!selectedIncident) return;
    setReportAuditLoading(true);
    try {
      const payload = await fetchJson<ReportAuditResult>("/api/v1/reporting/audit", {
        method: "POST",
        body: JSON.stringify({
          incident_id: selectedIncident.incident_id,
          unit_id: statusUnitId || null,
          narrative: options?.narrative ?? reportNarrative,
          structured_fields: parseFields(reportFields),
        }),
      });
      setReportAudit(payload);
      setIgnoredReportRecommendationIds((prev) =>
        prev.filter((id) => payload.recommendations.some((item) => item.recommendation_id === id))
      );
      if (!options?.silent) {
        if (payload.all_clear) {
          setReportSummary("AI Report QA: no missing statutory or policy elements detected.");
        } else {
          const recommendedCount = Math.max(0, payload.recommendation_count - payload.required_count);
          setReportSummary(
            `AI Report QA flagged ${payload.required_count} required and ${recommendedCount} recommended item(s).`
          );
        }
      }
    } catch (error) {
      if (!options?.silent) {
        setBanner(`AI report QA failed: ${(error as Error).message}`);
      }
    } finally {
      setReportAuditLoading(false);
    }
  }

  async function handleRunReportAudit() {
    await runReportAudit();
  }

  function handleIgnoreReportRecommendation(recommendationId: string) {
    setIgnoredReportRecommendationIds((prev) =>
      prev.includes(recommendationId) ? prev : [...prev, recommendationId]
    );
  }

  function handleInsertReportRecommendation(rec: ReportAuditRecommendation) {
    const suggested = rec.suggested_text?.trim();
    if (!suggested) return;
    const current = reportNarrative.trimEnd();
    const alreadyIncluded = current.toLowerCase().includes(suggested.toLowerCase());
    const nextNarrative = alreadyIncluded ? current : `${current}${current ? "\n\n" : ""}${suggested}`;
    setReportNarrative(nextNarrative);
    setReportSummary(`Inserted recommendation: ${rec.title}`);
    setIgnoredReportRecommendationIds((prev) =>
      prev.includes(rec.recommendation_id) ? prev : [...prev, rec.recommendation_id]
    );
    void runReportAudit({ narrative: nextNarrative, silent: true });
  }

  function handleResetIgnoredRecommendations() {
    setIgnoredReportRecommendationIds([]);
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
      await runReportAudit({ narrative: reportNarrative, silent: true });
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
      if (commandReviewDraft?.report_id === reportId) {
        await handleOpenCommandNarrative(reportId);
      }
    } catch (error) {
      setBanner(`Review action failed: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleLoadDraft(reportId: string) {
    setLoading(true);
    try {
      const draft = await fetchJson<ReportDraftDetail>(`/api/v1/reporting/draft/${reportId}`);
      setStatusUnitId(draft.unit_id);
      setReportNarrative(draft.narrative ?? "");
      setReportFields(serializeFields(draft.structured_fields ?? {}));
      setSelectedTemplateId(draft.template_id || "GENERAL_INCIDENT");
      setReportEvidence(draft.evidence_links ?? []);
      setSelectedIncidentId(draft.incident_id);
      setReportSummary(`Loaded draft ${draft.report_id} (${draft.status}).`);
      setActiveModule("reportHub");
      await refreshDashboard();
    } catch (error) {
      setBanner(`Load draft failed: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleOpenCommandNarrative(reportId: string) {
    setCommandReviewBusy(true);
    setCommandReviewError("");
    try {
      const draft = await fetchJson<ReportDraftDetail>(`/api/v1/reporting/draft/${reportId}`);
      setCommandReviewDraft(draft);
      if (!(reviewNotesByReport[reportId] ?? "").trim() && (draft.review_notes ?? "").trim()) {
        setReviewNotesByReport((prev) => ({ ...prev, [reportId]: draft.review_notes ?? "" }));
      }
    } catch (error) {
      setCommandReviewError(`Unable to load narrative: ${(error as Error).message}`);
    } finally {
      setCommandReviewBusy(false);
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
      await runReportAudit({ narrative: payload.narrative, silent: true });
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
      await runReportAudit({ narrative: result.improved_narrative, silent: true });
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

  function openMessagingThread(unitId: string) {
    if (!unitId || unitId === statusUnitId) return;
    setMessageTarget(unitId);
    setActiveModule("messaging");
  }

  function messageRecipientBusy(unitId: string): boolean {
    const recipient = units.find((item) => item.unit_id === unitId);
    if (!recipient) return false;
    const status = String(recipient.status || "").toUpperCase();
    return ["ON_SCENE", "EN_ROUTE", "TRANSPORT", "BUSY"].some((token) => status.includes(token));
  }

  function buildSimulatedReply(unitId: string, message: string): string {
    const busy = messageRecipientBusy(unitId);
    const normalized = message.toLowerCase();
    if (busy) {
      const delayedReplies = [
        "Copy. Busy on a call right now, will respond when clear.",
        "Received. On scene at the moment, stand by.",
        "10-4. Tied up right now, will follow up shortly.",
      ];
      return delayedReplies[Math.floor(Math.random() * delayedReplies.length)];
    }
    if (normalized.includes("eta")) return "Copy. Current ETA is about 6 minutes.";
    if (normalized.includes("arrive") || normalized.includes("scene")) return "Copy. I can take it and will update shortly.";
    const openReplies = [
      "Copy that. Received and understood.",
      "10-4. Message received.",
      "Received. I can take this.",
      "Understood. Updating now.",
    ];
    return openReplies[Math.floor(Math.random() * openReplies.length)];
  }

  function scheduleSimulatedReply(unitId: string, originalMessage: string) {
    if (!statusUnitId || !unitId || unitId === statusUnitId) return;
    const busy = messageRecipientBusy(unitId);
    const minDelayMs = busy ? 14000 : 3200;
    const maxDelayMs = busy ? 46000 : 11000;
    const delayMs = minDelayMs + Math.floor(Math.random() * (maxDelayMs - minDelayMs + 1));
    const typingLeadMs = busy
      ? 2800 + Math.floor(Math.random() * 2800)
      : 900 + Math.floor(Math.random() * 1500);
    const typingStartDelayMs = Math.max(450, delayMs - typingLeadMs);
    const typingTimerId = window.setTimeout(() => {
      setTypingByUnit((prev) => ({ ...prev, [unitId]: true }));
      simulatedTypingTimersRef.current = simulatedTypingTimersRef.current.filter((id) => id !== typingTimerId);
    }, typingStartDelayMs);
    simulatedTypingTimersRef.current.push(typingTimerId);
    const timerId = window.setTimeout(async () => {
      try {
        const body = buildSimulatedReply(unitId, originalMessage);
        await fetchJson("/api/v1/officer/message", {
          method: "POST",
          body: JSON.stringify({
            from_unit: unitId,
            to_unit: statusUnitId,
            body,
            incident_id: null,
            priority: "NORMAL",
          }),
        });
        const inbox = await fetchJson<MessageInbox>(`/api/v1/officer/messages/${statusUnitId}?limit=60`);
        setMessageInbox(inbox);
        const replyLabel = compactUnitLabel(units.find((item) => item.unit_id === unitId) ?? { unit_id: unitId });
        setMessageStatus(`Reply received from ${replyLabel}.`);
      } catch {
        // Simulated responses are best-effort and should never block core messaging.
      } finally {
        setTypingByUnit((prev) => {
          if (!prev[unitId]) return prev;
          const next = { ...prev };
          delete next[unitId];
          return next;
        });
        window.clearTimeout(typingTimerId);
        simulatedTypingTimersRef.current = simulatedTypingTimersRef.current.filter((id) => id !== typingTimerId);
        simulatedReplyTimersRef.current = simulatedReplyTimersRef.current.filter((id) => id !== timerId);
      }
    }, delayMs);
    simulatedReplyTimersRef.current.push(timerId);
  }

  function handleMessageInputKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSendMessage();
    }
  }

  async function handleSendMessage() {
    if (!statusUnitId || !messageTarget || !messageBody.trim()) return;
    setLoading(true);
    try {
      const outgoing = messageBody.trim();
      await fetchJson("/api/v1/officer/message", {
        method: "POST",
        body: JSON.stringify({
          from_unit: statusUnitId,
          to_unit: messageTarget,
          body: outgoing,
          incident_id: null,
          priority: "NORMAL",
        }),
      });
      setMessageBody("");
      const targetLabel = compactUnitLabel(units.find((item) => item.unit_id === messageTarget) ?? { unit_id: messageTarget });
      setMessageStatus(`Message sent to ${targetLabel}.`);
      const inbox = await fetchJson<MessageInbox>(`/api/v1/officer/messages/${statusUnitId}?limit=60`);
      setMessageInbox(inbox);
      scheduleSimulatedReply(messageTarget, outgoing);
    } catch (error) {
      setBanner(`Secure message failed: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handlePostHandoffNote() {
    if (!selectedIncident || !statusUnitId || !handoffNoteText.trim()) return;
    setLoading(true);
    try {
      await fetchJson("/api/v1/officer/handoff", {
        method: "POST",
        body: JSON.stringify({
          incident_id: selectedIncident.incident_id,
          unit_id: statusUnitId,
          note: handoffNoteText.trim(),
          audience: handoffAudience,
        }),
      });
      setHandoffNoteText("");
      const feed = await fetchJson<HandoffFeed>(`/api/v1/officer/handoff/${selectedIncident.incident_id}?limit=8`);
      setHandoffFeed(feed);
      setBanner(`Handoff note posted for ${selectedIncident.incident_id}.`);
      await refreshDashboard();
    } catch (error) {
      setBanner(`Handoff note failed: ${(error as Error).message}`);
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

  async function handleBuildIncidentIntel() {
    if (!selectedIncident) return;
    setLoading(true);
    try {
      const packet = await fetchJson<IncidentIntelPacket>(`/api/v1/intel/incident/${selectedIncident.incident_id}`);
      setIncidentIntel(packet);
      setBanner(`Incident intel packet built: ${packet.totals.records + packet.totals.firearms + packet.totals.warrants} total matches.`);
    } catch (error) {
      setBanner(`Incident intel packet failed: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
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

  async function runPolicySearch(query: string, sort: "relevance" | "title" | "section") {
    setLoading(true);
    try {
      const result = await fetchJson<PolicySearchResponse>(
        `/api/v1/intel/policy/search?query=${encodeURIComponent(query)}&sort_by=${sort}&limit=40`
      );
      setPolicyResults(result);
      if (result.best_guess?.section_id) {
        const detail = await fetchJson<PolicySectionDetail>(`/api/v1/intel/policy/${encodeURIComponent(result.best_guess.section_id)}`);
        setActivePolicySection(detail);
      } else {
        setActivePolicySection(null);
      }
      setBanner(`Policy search returned ${result.result_count} section(s).`);
    } catch (error) {
      setBanner(`Policy search failed: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handlePolicySearch() {
    await runPolicySearch(policyQuery, policySort);
  }

  async function handleOpenPolicySection(sectionId: string) {
    setLoading(true);
    try {
      const detail = await fetchJson<PolicySectionDetail>(`/api/v1/intel/policy/${encodeURIComponent(sectionId)}`);
      setActivePolicySection(detail);
      setBanner(`Opened policy section ${detail.section_id}.`);
    } catch (error) {
      setBanner(`Policy section load failed: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  async function runCodeSearch(query: string, sort: "relevance" | "numeric" | "alpha") {
    setLoading(true);
    try {
      const result = await fetchJson<CodeSearchResponse>(
        `/api/v1/intel/code/search?query=${encodeURIComponent(query)}&sort_by=${sort}&limit=50`
      );
      setCodeResults(result);
      if (result.best_guess?.code_key) {
        const detail = await fetchJson<CodeResult>(`/api/v1/intel/code/${encodeURIComponent(result.best_guess.code_key)}`);
        setActiveCodeDetail({ ...detail, match_score: result.best_guess.confidence * 100, match_reasons: result.best_guess.reasons });
      } else {
        setActiveCodeDetail(null);
      }
      setBanner(`Code search returned ${result.result_count} match(es).`);
    } catch (error) {
      setBanner(`Code search failed: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleCodeSearch() {
    await runCodeSearch(codeQuery, codeSort);
  }

  async function handleOpenCodeDetail(codeKey: string) {
    setLoading(true);
    try {
      const detail = await fetchJson<CodeResult>(`/api/v1/intel/code/${encodeURIComponent(codeKey)}`);
      setActiveCodeDetail({ ...detail, match_score: detail.match_score ?? 0, match_reasons: detail.match_reasons ?? [] });
      setBanner(`Opened code ${detail.code_key}.`);
    } catch (error) {
      setBanner(`Code detail load failed: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
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
      channel_messages: (messageInbox?.messages ?? []).slice(0, 20),
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

  async function handleExportExecutiveBrief() {
    setLoading(true);
    try {
      const payload = await fetchJson<any>("/api/v1/command/executive-brief?periods=8");
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `firstline-executive-brief-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setBanner("Exported executive brief.");
    } catch (error) {
      setBanner(`Executive brief export failed: ${(error as Error).message}`);
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

  async function handleSafetyBriefing() {
    if (!selectedIncident) return;
    setLoading(true);
    try {
      const result = await fetchJson<AIBriefing>("/api/v1/ai/briefing", {
        method: "POST",
        body: JSON.stringify({ incident_id: selectedIncident.incident_id, unit_id: statusUnitId }),
      });
      setSafetyBriefing(result);
      setBanner(`Safety briefing generated for ${selectedIncident.incident_id}.`);
    } catch (error) {
      setBanner(`Safety briefing failed: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  function handleRetryPrimaryMapStyle() {
    if (!mapRef.current) return;
    try {
      mapFallbackTriedRef.current = false;
      setMapReady(false);
      setMapStyleMode("primary");
      setMapStatusMessage("Retrying primary map style...");
      mapRef.current.setStyle(MAP_STYLE_URL);
    } catch {
      setBanner("Unable to retry primary map style.");
    }
  }

  async function handleAiDispositionDraft() {
    if (!selectedIncident) return;
    setLoading(true);
    try {
      const result = await fetchJson<AIDispositionDraft>("/api/v1/ai/disposition-draft", {
        method: "POST",
        body: JSON.stringify({
          incident_id: selectedIncident.incident_id,
          unit_id: statusUnitId,
        }),
      });
      setAiDispositionDraft(result);
      setBanner(`Disposition draft generated (${Math.round(result.confidence * 100)}% confidence).`);
    } catch (error) {
      setBanner(`Disposition draft failed: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  function handleApplyAiDispositionDraft() {
    if (!aiDispositionDraft) return;
    setDispositionCode(aiDispositionDraft.recommended_disposition_code);
    setDispositionSummary(aiDispositionDraft.summary);
    setArrestMade(aiDispositionDraft.arrest_made);
    setCitationIssued(aiDispositionDraft.citation_issued);
    setForceUsed(aiDispositionDraft.force_used);
    setBanner(`Applied AI disposition draft ${aiDispositionDraft.recommended_disposition_code}.`);
  }

  async function handleQuickCode(action: "EN_ROUTE" | "ON_SCENE" | "CLEAR") {
    await handleOfficerAction(action);
    if (action === "EN_ROUTE") setStatusValue("EN_ROUTE");
    if (action === "ON_SCENE") setStatusValue("ON_SCENE");
    if (action === "CLEAR") setStatusValue("AVAILABLE");
  }

  const recentTimeline = (incidentDetail?.timeline ?? []).slice(0, 4);
  const liveSimulationRunning = Boolean(patrolStatus?.enabled && patrolStatus.profile === "LIVE_DEV");
  const liveCallsReceived = patrolStatus?.calls_received ?? patrolStatus?.calls_generated ?? 0;
  const liveUnitsAssigned = patrolStatus?.calls_assigned ?? patrolStatus?.calls_auto_assigned ?? 0;
  const liveCallsResolved = patrolStatus?.calls_resolved ?? 0;
  const liveActiveCalls = patrolStatus?.active_incidents ?? queue.length;
  const liveStartedAtMs = patrolStatus?.started_at ? Date.parse(patrolStatus.started_at) : NaN;
  const liveRuntimeSeconds =
    liveSimulationRunning && Number.isFinite(liveStartedAtMs)
      ? Math.max(0, Math.floor((simClockNowMs - liveStartedAtMs) / 1000))
      : 0;
  const liveRuntimeLabel = formatDuration(liveRuntimeSeconds);
  const liveRoster = useMemo(
    () =>
      (mapData?.units ?? units)
        .filter((unit) => unit.shift !== "OFF_DUTY")
        .sort((a, b) => a.callsign.localeCompare(b.callsign)),
    [mapData?.units, units]
  );
  const liveWorkflowRows = useMemo(
    () => (workflowBoard?.active_workflows ?? []).slice(0, 12),
    [workflowBoard]
  );
  const liveResolvedRows = useMemo(
    () => (workflowBoard?.resolved_workflows ?? []).slice(0, 8),
    [workflowBoard]
  );
  const isDispatcher = sessionRole === "Dispatcher";
  const isOfficer = sessionRole === "Officer";
  const isSupervisor = sessionRole === "Supervisor";
  const roleDefaultView = defaultViewForRole(sessionRole);
  const canDispatchModules = isDispatcher || isSupervisor;
  const canOfficerModules = isOfficer;
  const canReportModules = isOfficer || isSupervisor;
  const canIntelModules = true;
  const quickActionLookup = useMemo(() => {
    const lookup: Record<string, { enabled: boolean; reason: string }> = {};
    (quickActionsPolicy?.actions ?? []).forEach((item) => {
      lookup[item.action] = { enabled: item.enabled, reason: item.reason };
    });
    return lookup;
  }, [quickActionsPolicy]);
  const isActionEnabled = (action: string) => quickActionLookup[action]?.enabled ?? true;
  const actionReason = (action: string) => quickActionLookup[action]?.reason ?? "";
  const selectedAssignedUnit = useMemo(() => {
    const unitId = incidentDetail?.incident?.assigned_unit_id;
    if (!unitId) return null;
    return units.find((unit) => unit.unit_id === unitId) ?? null;
  }, [incidentDetail?.incident?.assigned_unit_id, units]);
  const statusUnit = useMemo(
    () => units.find((unit) => unit.unit_id === statusUnitId) ?? null,
    [units, statusUnitId]
  );
  const statusUnitLabel = useMemo(() => compactUnitLabel(statusUnit ?? { unit_id: statusUnitId }), [statusUnit, statusUnitId]);
  const inboxMessages = messageInbox?.messages ?? [];
  const currentThreadReadAtByCounterpart = useMemo(
    () => (statusUnitId ? (threadReadByUnit[statusUnitId] ?? {}) : {}),
    [statusUnitId, threadReadByUnit]
  );
  const conversationLastByCounterpart = useMemo(() => {
    const lookup: Record<string, MessageThread> = {};
    inboxMessages.forEach((message) => {
      const counterpart = message.from_unit === statusUnitId ? message.to_unit : message.from_unit;
      if (!counterpart || counterpart === statusUnitId) return;
      const existing = lookup[counterpart];
      if (!existing || existing.sent_at < message.sent_at) lookup[counterpart] = message;
    });
    return lookup;
  }, [inboxMessages, statusUnitId]);
  const latestInboundByCounterpart = useMemo(() => {
    const lookup: Record<string, string> = {};
    inboxMessages.forEach((message) => {
      if (message.to_unit !== statusUnitId || message.from_unit === statusUnitId) return;
      const counterpart = message.from_unit;
      if (!lookup[counterpart] || lookup[counterpart] < message.sent_at) {
        lookup[counterpart] = message.sent_at;
      }
    });
    return lookup;
  }, [inboxMessages, statusUnitId]);
  const unreadByCounterpart = useMemo(() => {
    const lookup: Record<string, number> = {};
    inboxMessages.forEach((message) => {
      if (message.to_unit !== statusUnitId || message.from_unit === statusUnitId) return;
      const counterpart = message.from_unit;
      const readAt = currentThreadReadAtByCounterpart[counterpart] ?? "";
      if (readAt && message.sent_at <= readAt) return;
      lookup[counterpart] = (lookup[counterpart] ?? 0) + 1;
    });
    return lookup;
  }, [inboxMessages, statusUnitId, currentThreadReadAtByCounterpart]);
  const unreadThreadTotal = useMemo(
    () => Object.values(unreadByCounterpart).reduce((sum, count) => sum + count, 0),
    [unreadByCounterpart]
  );
  const messagingContacts = useMemo(() => {
    const contacts = new Map<string, MessagingContact>();
    contacts.set("DISPATCH", {
      unit_id: "DISPATCH",
      display_name: "Dispatch",
      subtitle: "Online",
      status: "ONLINE",
      unread_count: unreadByCounterpart.DISPATCH ?? 0,
      last_message_at: conversationLastByCounterpart.DISPATCH?.sent_at ?? null,
      last_message_preview: conversationLastByCounterpart.DISPATCH?.body ?? null,
    });

    units
      .filter((unit) => unit.unit_id !== statusUnitId && unit.status !== "OFF_DUTY")
      .forEach((unit) => {
        const last = conversationLastByCounterpart[unit.unit_id];
        contacts.set(unit.unit_id, {
          unit_id: unit.unit_id,
          display_name: compactUnitLabel(unit),
          subtitle: normalizeStatusLabel(unit.status),
          status: unit.status,
          unread_count: unreadByCounterpart[unit.unit_id] ?? 0,
          last_message_at: last?.sent_at ?? null,
          last_message_preview: last?.body ?? null,
        });
      });

    Object.keys(conversationLastByCounterpart).forEach((counterpart) => {
      if (counterpart === statusUnitId || contacts.has(counterpart)) return;
      const last = conversationLastByCounterpart[counterpart];
      contacts.set(counterpart, {
        unit_id: counterpart,
        display_name: compactUnitLabel({ unit_id: counterpart }),
        subtitle: "Unknown",
        status: "UNKNOWN",
        unread_count: unreadByCounterpart[counterpart] ?? 0,
        last_message_at: last?.sent_at ?? null,
        last_message_preview: last?.body ?? null,
      });
    });

    return Array.from(contacts.values()).sort((a, b) => {
      if (a.unread_count !== b.unread_count) return b.unread_count - a.unread_count;
      if ((a.last_message_at ?? "") !== (b.last_message_at ?? "")) return (b.last_message_at ?? "").localeCompare(a.last_message_at ?? "");
      return a.display_name.localeCompare(b.display_name);
    });
  }, [units, statusUnitId, unreadByCounterpart, conversationLastByCounterpart]);
  const activeMessagingContact = useMemo(
    () => messagingContacts.find((contact) => contact.unit_id === messageTarget) ?? null,
    [messagingContacts, messageTarget]
  );
  const activeMessagingUnit = useMemo(
    () => units.find((unit) => unit.unit_id === messageTarget) ?? null,
    [units, messageTarget]
  );
  const activeContactTyping = Boolean(messageTarget && typingByUnit[messageTarget]);
  const messageThreadQuery = messageThreadSearch.trim().toLowerCase();
  const filteredMessagingThreads = useMemo(
    () =>
      messagingContacts.filter((contact) => {
        if (!messageThreadQuery) return true;
        return (
          contact.display_name.toLowerCase().includes(messageThreadQuery) ||
          contact.unit_id.toLowerCase().includes(messageThreadQuery) ||
          contact.status.toLowerCase().includes(messageThreadQuery) ||
          contact.subtitle.toLowerCase().includes(messageThreadQuery)
        );
      }),
    [messagingContacts, messageThreadQuery]
  );
  const directConversation = useMemo(
    () =>
      inboxMessages
        .filter(
          (message) =>
            (message.from_unit === statusUnitId && message.to_unit === messageTarget) ||
            (message.to_unit === statusUnitId && message.from_unit === messageTarget)
        )
        .sort((a, b) => a.sent_at.localeCompare(b.sent_at)),
    [inboxMessages, statusUnitId, messageTarget]
  );
  const statusBoardRows = useMemo(() => {
    const activeByUnit = new Map<string, DispatchWorkflowRow>();
    (workflowBoard?.active_workflows ?? []).forEach((row) => {
      if (!row.assigned_unit_id) return;
      if (!activeByUnit.has(row.assigned_unit_id)) activeByUnit.set(row.assigned_unit_id, row);
    });
    const rows: Array<{
      unit_id: string;
      callsign: string;
      status: string;
      status_short: string;
      elapsed: string;
      event_no: string;
      call_label: string;
      location: string;
      comment: string;
      incident_id?: string | null;
      tone: "available" | "enroute" | "busy" | "offduty" | "other";
    }> = [];
    const combined = [
      ...(availabilityBoard?.available_units ?? []),
      ...(availabilityBoard?.unavailable_units ?? []),
    ];
    combined.forEach((unit) => {
      const workflow = activeByUnit.get(unit.unit_id);
      const statusRaw = String(unit.status_code ?? "UNKNOWN").toUpperCase();
      const short = shortStatusCode(statusRaw);
      const clock = unitStatusClocks[unit.unit_id];
      const elapsedSeconds = clock ? Math.max(0, Math.floor((simClockNowMs - clock.sinceMs) / 1000)) : 0;
      const incidentId = "incident_id" in unit ? unit.incident_id ?? null : null;
      const eventNo = incidentId ? incidentId.split("-").pop() ?? incidentId : "----";
      const callLabel =
        workflow?.call_display ||
        ("call_display" in unit ? (unit.call_display ?? "") : "") ||
        ("call_type" in unit ? unit.call_type : "") ||
        (statusRaw.includes("AVAILABLE") ? "PATROL" : "UNASSIGNED");
      let tone: "available" | "enroute" | "busy" | "offduty" | "other" = "other";
      if (short === "AV") tone = "available";
      else if (short === "EN") tone = "enroute";
      else if (short === "OD") tone = "offduty";
      else if (["SC", "BU", "TR"].includes(short)) tone = "busy";
      rows.push({
        unit_id: unit.unit_id,
        callsign: unit.callsign,
        status: statusRaw,
        status_short: short,
        elapsed: formatClockDuration(elapsedSeconds),
        event_no: eventNo,
        call_label: callLabel,
        location: unit.current_location,
        comment: unit.dispatch_note,
        incident_id: incidentId,
        tone,
      });
    });
    const callsignRank = (callsign: string) => {
      const digits = callsign.match(/\d+/g)?.join("") ?? "";
      return digits ? Number(digits) : Number.MAX_SAFE_INTEGER;
    };
    rows.sort((a, b) => {
      const rankDelta = callsignRank(a.callsign) - callsignRank(b.callsign);
      if (rankDelta !== 0) return rankDelta;
      return a.callsign.localeCompare(b.callsign);
    });
    return rows;
  }, [availabilityBoard, workflowBoard, unitStatusClocks, simClockNowMs]);
  const statusBoardSearchQuery = statusBoardSearch.trim().toLowerCase();
  const filteredStatusBoardRows = useMemo(
    () =>
      statusBoardRows.filter((row) => {
        const toneMatch = statusBoardToneFilter === "ALL" || row.tone === statusBoardToneFilter;
        const searchMatch =
          !statusBoardSearchQuery ||
          row.callsign.toLowerCase().includes(statusBoardSearchQuery) ||
          row.call_label.toLowerCase().includes(statusBoardSearchQuery) ||
          row.location.toLowerCase().includes(statusBoardSearchQuery) ||
          row.comment.toLowerCase().includes(statusBoardSearchQuery) ||
          row.event_no.toLowerCase().includes(statusBoardSearchQuery);
        return toneMatch && searchMatch;
      }),
    [statusBoardRows, statusBoardToneFilter, statusBoardSearchQuery]
  );
  const commandReportSearchQuery = commandReportSearch.trim().toLowerCase();
  const commandCallSearchQuery = commandCallSearch.trim().toLowerCase();
  const filteredCommandCalls = useMemo(
    () =>
      (commandCallHistory?.calls ?? []).filter((item) => {
        if (!commandCallSearchQuery) return true;
        const haystack = [
          item.incident_id,
          item.call_display,
          item.call_type,
          item.address,
          item.assigned_callsign ?? "",
          item.assigned_officer ?? "",
          item.handling_unit_label ?? "",
          item.disposition_code ?? "",
          item.disposition_summary ?? "",
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(commandCallSearchQuery);
      }),
    [commandCallHistory, commandCallSearchQuery]
  );
  const filteredCommandReports = useMemo(
    () =>
      (commandReports?.reports ?? []).filter((item) => {
        const reviewStatus = (item.review_status ?? "PENDING").toUpperCase();
        const reviewMatch = commandReportReviewFilter === "ALL" || reviewStatus === commandReportReviewFilter;
        const searchMatch =
          !commandReportSearchQuery ||
          item.report_id.toLowerCase().includes(commandReportSearchQuery) ||
          item.incident_id.toLowerCase().includes(commandReportSearchQuery) ||
          item.unit_id.toLowerCase().includes(commandReportSearchQuery) ||
          item.narrative_preview.toLowerCase().includes(commandReportSearchQuery);
        return reviewMatch && searchMatch;
      }),
    [commandReports, commandReportReviewFilter, commandReportSearchQuery]
  );
  const moduleCounts: Partial<Record<ModulePanel, number>> = {
    queue: filteredQueue.length,
    priorityRadar: priorityBoard?.incidents.filter((item) => item.risk_score >= 80).length,
    assignedDeck: officerFeed?.assigned_incidents.length,
    callHistory: officerCallHistory?.call_count,
    reportHub: reportHub?.drafts.length,
    policyHub: policyResults?.result_count,
    codeHub: codeResults?.result_count,
    commandReports: commandReports?.pending_review_count,
    commandCallHistory: commandCallHistory?.call_count,
    reviewQueue: reviewQueue?.review_count,
    reportingMetrics: reportingMetrics?.changes_requested,
    messaging: unreadThreadTotal,
    unitReadiness: availabilityBoard?.summary.unavailable_count,
  };
  const moduleGroups: Array<{ id: ModuleGroupId; label: string; description: string; icon: string }> = [
    { id: "ops", label: "Core Ops", description: "Intake, queue, and map-first dispatch controls.", icon: "OPS" },
    { id: "field", label: "Field", description: "Officer workflow and mobile tools.", icon: "FLD" },
    { id: "reporting", label: "Reporting", description: "Drafts, supervisor review, and RMS readiness.", icon: "RPT" },
    { id: "intel", label: "Intel", description: "Records, policies, and penal code references.", icon: "INT" },
    { id: "command", label: "Command", description: "Oversight metrics and operational trends.", icon: "CMD" },
    { id: "system", label: "System", description: "Simulation controls and utility modules.", icon: "SYS" },
  ];
  const moduleGroupLabelById = moduleGroups.reduce(
    (lookup, group) => ({ ...lookup, [group.id]: group.label }),
    {} as Record<ModuleGroupId, string>
  );
  const moduleButtons: ModuleButton[] = [
    { id: "mapOnly", label: "Map Only", icon: "MAP", group: "ops", visible: true },
    { id: "intake", label: "Intake", icon: "911", group: "ops", visible: canDispatchModules },
    { id: "queue", label: "Active Queue", icon: "Q", group: "ops", visible: canDispatchModules, badge: moduleCounts.queue },
    { id: "priorityRadar", label: "Priority Radar", icon: "RAD", group: "ops", visible: canDispatchModules, badge: moduleCounts.priorityRadar },
    { id: "recommendation", label: "Unit Recs", icon: "REC", group: "ops", visible: canDispatchModules },
    { id: "unitReadiness", label: "Unit Board", icon: "UNIT", group: "ops", visible: canDispatchModules, badge: moduleCounts.unitReadiness },
    { id: "fieldOps", label: "Field Ops", icon: "OPS", group: "field", visible: canOfficerModules },
    { id: "assignedDeck", label: "Assigned Deck", icon: "CAR", group: "field", visible: canOfficerModules, badge: moduleCounts.assignedDeck },
    { id: "callHistory", label: "Call History", icon: "HIS", group: "field", visible: canOfficerModules, badge: moduleCounts.callHistory },
    { id: "mobileControls", label: "Mobile Controls", icon: "MOB", group: "field", visible: canOfficerModules },
    { id: "messaging", label: "Messaging", icon: "MSG", group: "field", visible: canOfficerModules || canDispatchModules, badge: moduleCounts.messaging },
    { id: "disposition", label: "Disposition", icon: "FIN", group: "field", visible: canOfficerModules },
    { id: "reportHub", label: "Report Hub", icon: "RPT", group: "reporting", visible: canReportModules, badge: moduleCounts.reportHub },
    { id: "reviewQueue", label: "Review Queue", icon: "REV", group: "reporting", visible: canReportModules, badge: moduleCounts.reviewQueue },
    { id: "reportingMetrics", label: "Report Metrics", icon: "MET", group: "reporting", visible: canReportModules, badge: moduleCounts.reportingMetrics },
    { id: "intelHub", label: "Intel Hub", icon: "DB", group: "intel", visible: canIntelModules },
    { id: "policyHub", label: "Policy Hub", icon: "POL", iconStyle: "policyBook", group: "intel", visible: canIntelModules, badge: moduleCounts.policyHub },
    { id: "codeHub", label: "Code Hub", icon: "TXT", iconStyle: "codeBook", group: "intel", visible: canIntelModules, badge: moduleCounts.codeHub },
    { id: "commandDash", label: "Command", icon: "CMD", group: "command", visible: canDispatchModules },
    { id: "commandReports", label: "Command Reports", icon: "REV", group: "command", visible: canDispatchModules, badge: moduleCounts.commandReports },
    { id: "commandCallHistory", label: "Shift Call History", icon: "HIS", group: "command", visible: canDispatchModules, badge: moduleCounts.commandCallHistory },
    { id: "opTrends", label: "Trends", icon: "TRD", group: "command", visible: canDispatchModules },
    { id: "aiOps", label: "AI Ops", icon: "AI", group: "command", visible: canDispatchModules },
    { id: "hotkeys", label: "Hotkeys", icon: "HK", group: "system", visible: true },
  ];
  const rightColumnModules: ModulePanel[] = [
    "commandDash",
    "commandReports",
    "commandCallHistory",
    "unitReadiness",
    "opTrends",
    "reviewQueue",
    "reportingMetrics",
    "aiOps",
    "recommendation",
    "disposition",
    "mobileControls",
    "messaging",
    "hotkeys",
  ];
  const rightColumnActive = rightColumnModules.includes(activeModule);
  const moduleSearchQuery = moduleSearch.trim().toLowerCase();
  const visibleModuleButtons = moduleButtons.filter((item) => {
    if (!item.visible) return false;
    if (!moduleSearchQuery) return true;
    const groupLabel = moduleGroupLabelById[item.group].toLowerCase();
    return (
      item.label.toLowerCase().includes(moduleSearchQuery) ||
      item.id.toLowerCase().includes(moduleSearchQuery) ||
      groupLabel.includes(moduleSearchQuery)
    );
  });
  const groupedVisibleModules = moduleGroups
    .map((group) => ({ ...group, items: visibleModuleButtons.filter((item) => item.group === group.id) }))
    .filter((group) => group.items.length > 0);
  const sideRailModuleButtons = useMemo(() => {
    const preferred: ModulePanel[] = isOfficer
      ? ["mapOnly", "assignedDeck", "callHistory", "reportHub", "disposition", "messaging", "policyHub"]
      : ["mapOnly", "queue", "unitReadiness", "commandDash", "commandCallHistory", "commandReports", "messaging"];
    const visibleById = new Map(visibleModuleButtons.map((item) => [item.id, item] as const));
    const ordered = preferred
      .map((id) => visibleById.get(id))
      .filter((item): item is ModuleButton => Boolean(item));
    const known = new Set(ordered.map((item) => item.id));
    const fallback = visibleModuleButtons
      .filter((item) => !known.has(item.id))
      .slice(0, 1);
    return [...ordered, ...fallback].slice(0, 7);
  }, [visibleModuleButtons, isOfficer]);
  const activeModuleMeta = moduleButtons.find((item) => item.id === activeModule);
  const commandPaletteItems = [
    {
      id: "refresh",
      label: "Refresh dashboard data",
      hint: "System",
      run: () => {
        void refreshDashboard();
      },
    },
    {
      id: "toggle-live-sim",
      label: liveSimulationRunning ? "Stop live simulation" : "Start live simulation",
      hint: "Simulation",
      run: () => {
        void handleToggleLiveSimulation();
      },
    },
    {
      id: "map-focus",
      label: mapFocusMode ? "Exit map focus mode" : "Enter map focus mode",
      hint: "Map",
      run: () => setMapFocusMode((prev) => !prev),
    },
    {
      id: "map-center",
      label: "Center map on selected incident",
      hint: selectedIncident?.incident_id ?? "Map",
      run: () => {
        if (!selectedIncident || !mapRef.current) return;
        mapRef.current.flyTo({ center: [selectedIncident.coordinates.lon, selectedIncident.coordinates.lat], zoom: 13, speed: 0.6 });
      },
    },
    {
      id: "quick-recommend",
      label: "Run unit recommendation",
      hint: selectedIncident?.incident_id ?? "Dispatch",
      run: () => {
        void handleRecommend();
      },
    },
    {
      id: "quick-draft",
      label: "Save report draft",
      hint: selectedIncident?.incident_id ?? "Report",
      run: () => {
        void handleSaveDraft();
      },
    },
    ...moduleButtons
      .filter((item) => item.visible)
      .map((item) => ({
        id: `module-${item.id}`,
        label: `Open ${item.label}`,
        hint: `Module · ${moduleGroupLabelById[item.group]}`,
        run: () => setActiveModule(item.id),
      })),
  ];
  const filteredCommandPaletteItems = commandPaletteItems.filter((item) => {
    const query = commandPaletteQuery.trim().toLowerCase();
    if (!query) return true;
    return item.label.toLowerCase().includes(query) || item.hint.toLowerCase().includes(query);
  });
  const activeModuleGroup = moduleButtons.find((item) => item.id === activeModule)?.group;

  useEffect(() => {
    function onQuickNav(event: KeyboardEvent) {
      if (!started || !event.altKey || event.ctrlKey || event.metaKey) return;
      const activeTag = document.activeElement?.tagName;
      if (activeTag === "INPUT" || activeTag === "TEXTAREA" || activeTag === "SELECT") return;

      const lower = event.key.toLowerCase();
      const openIfVisible = (target: ModulePanel) => {
        const isVisible = moduleButtons.some((item) => item.id === target && item.visible);
        if (!isVisible) return;
        setActiveModule(target);
      };

      if (lower === "1") {
        event.preventDefault();
        setActiveModule("mapOnly");
      } else if (lower === "2") {
        event.preventDefault();
        if (canDispatchModules) openIfVisible("queue");
        else openIfVisible("assignedDeck");
      } else if (lower === "3") {
        event.preventDefault();
        openIfVisible("reportHub");
      } else if (lower === "4") {
        event.preventDefault();
        openIfVisible("intelHub");
      } else if (lower === "m") {
        event.preventDefault();
        openIfVisible("messaging");
      } else if (lower === "u") {
        event.preventDefault();
        openIfVisible("unitReadiness");
      } else if (lower === "q") {
        event.preventDefault();
        openIfVisible("queue");
      }
    }

    window.addEventListener("keydown", onQuickNav);
    return () => window.removeEventListener("keydown", onQuickNav);
  }, [started, canDispatchModules, moduleButtons]);

  useEffect(() => {
    if (!activeModuleGroup) return;
    setOpenModuleGroups((prev) => (prev[activeModuleGroup] ? prev : { ...prev, [activeModuleGroup]: true }));
  }, [activeModuleGroup]);

  useEffect(() => {
    if (activeModule !== "mapOnly") setModuleDockOpen(false);
  }, [activeModule]);

  useEffect(() => {
    if (!mapFocusMode) return;
    setModuleDockOpen(false);
    setStatusDetailsOpen(false);
  }, [mapFocusMode]);

  useEffect(() => {
    if (!statusUnitId || !messageTarget) return;
    setMessageTargetByUnit((prev) => (prev[statusUnitId] === messageTarget ? prev : { ...prev, [statusUnitId]: messageTarget }));
  }, [statusUnitId, messageTarget]);

  useEffect(() => {
    if (!statusUnitId || messagingContacts.length === 0) return;
    if (messagingContextUnitRef.current === statusUnitId) return;
    messagingContextUnitRef.current = statusUnitId;
    const preferredTarget = messageTargetByUnit[statusUnitId];
    if (preferredTarget && messagingContacts.some((contact) => contact.unit_id === preferredTarget)) {
      setMessageTarget(preferredTarget);
      return;
    }
    if (!messagingContacts.some((contact) => contact.unit_id === messageTarget)) {
      setMessageTarget(messagingContacts[0].unit_id);
    }
  }, [statusUnitId, messagingContacts, messageTargetByUnit, messageTarget]);

  useEffect(() => {
    if (messagingContacts.length === 0) return;
    if (messagingContacts.some((contact) => contact.unit_id === messageTarget)) return;
    const preferredTarget = statusUnitId ? messageTargetByUnit[statusUnitId] : undefined;
    if (preferredTarget && messagingContacts.some((contact) => contact.unit_id === preferredTarget)) {
      setMessageTarget(preferredTarget);
      return;
    }
    setMessageTarget(messagingContacts[0].unit_id);
  }, [messagingContacts, messageTarget, statusUnitId, messageTargetByUnit]);

  useEffect(() => {
    if (activeModule !== "messaging" || !statusUnitId || !messageTarget) return;
    const latestInbound = latestInboundByCounterpart[messageTarget];
    if (!latestInbound) return;
    setThreadReadByUnit((prev) => {
      const unitMarks = prev[statusUnitId] ?? {};
      const existing = unitMarks[messageTarget] ?? "";
      if (existing >= latestInbound) return prev;
      return {
        ...prev,
        [statusUnitId]: {
          ...unitMarks,
          [messageTarget]: latestInbound,
        },
      };
    });
  }, [activeModule, statusUnitId, messageTarget, latestInboundByCounterpart]);

  useEffect(() => {
    if (activeModule !== "messaging") return;
    const threadList = messageThreadListRef.current;
    if (!threadList) return;
    threadList.scrollTop = threadList.scrollHeight;
  }, [activeModule, messageTarget, directConversation.length]);

  useEffect(() => {
    if (!messageStatus) return;
    if (messageStatusTimerRef.current) window.clearTimeout(messageStatusTimerRef.current);
    messageStatusTimerRef.current = window.setTimeout(() => {
      setMessageStatus("");
      messageStatusTimerRef.current = null;
    }, 4200);
    return () => {
      if (messageStatusTimerRef.current) {
        window.clearTimeout(messageStatusTimerRef.current);
        messageStatusTimerRef.current = null;
      }
    };
  }, [messageStatus]);

  useEffect(() => {
    if (!mapRef.current) return;
    const timer = window.setTimeout(() => {
      try {
        mapRef.current?.resize();
      } catch {
        // Ignore transient map resize errors.
      }
    }, 120);
    return () => window.clearTimeout(timer);
  }, [activeModule, mapFocusMode, rightColumnActive]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    if (activeModule !== "mapOnly") {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [activeModule]);

  useEffect(() => {
    if (activeModule === "mapOnly") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setActiveModule("mapOnly");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeModule]);

  useEffect(() => {
    const visibleModules = moduleButtons.filter((item) => item.visible).map((item) => item.id);
    if (visibleModules.length === 0) return;
    if (!visibleModules.includes(activeModule)) setActiveModule(visibleModules[0]);
  }, [viewMode, sessionRole, activeModule]);

  useEffect(() => {
    if (activeModule !== "commandReports") {
      setCommandReviewDraft(null);
      setCommandReviewError("");
    }
  }, [activeModule]);

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
            <button
              className="dispatch-primary"
              type="button"
              onClick={() => {
                setViewMode(defaultViewForRole(sessionRole));
                setActiveModule("mapOnly");
                setStarted(true);
              }}
            >
              Enter Console
            </button>
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
          <p>{sessionRole} console locked to {roleDefaultView} workflow.</p>
        </div>
        <div className="top-role-row">
          <span className="role-badge">{sessionRole}</span>
          <button className="dispatch-secondary" type="button" onClick={() => setCommandPaletteOpen(true)}>Cmd Palette</button>
          <button className="dispatch-secondary" type="button" onClick={refreshDashboard}>Refresh</button>
        </div>
      </header>

      <section className="live-sim-strip">
        <button
          className={`live-sim-cta ${liveSimulationRunning ? "active" : ""}`}
          type="button"
          onClick={handleToggleLiveSimulation}
          disabled={liveSimBusy}
        >
          {liveSimBusy ? "Working..." : liveSimulationRunning ? "Stop Live Simulation" : "Start Live Simulation"}
        </button>
        <button
          className={`dispatch-secondary live-sim-toggle ${liveSimPanelOpen ? "active" : ""}`}
          type="button"
          onClick={() => setLiveSimPanelOpen((prev) => !prev)}
          disabled={liveSimBusy}
        >
          {liveSimPanelOpen ? "Hide Sim Monitor" : "Open Sim Monitor"}
        </button>
        <div className="live-sim-meta">
          <strong>{liveSimulationRunning ? "Simulation Running" : "Simulation Offline"}</strong>
          <p>
            Patrol units: {patrolStatus?.dispatchable_units ?? 0} · Active calls: {liveActiveCalls}/{patrolStatus?.max_active_calls ?? 10} · Runtime {liveRuntimeLabel}
          </p>
        </div>
      </section>
      {simNotice ? (
        <div className={`sim-notice ${simNotice.level}`}>
          {simNotice.text}
        </div>
      ) : null}
      {liveSimPanelOpen ? (
        <section className="live-sim-panel card panel">
          <div className="live-sim-panel-head">
            <h2>Live Simulation Console</h2>
            <div className="button-grid">
              <button type="button" onClick={handleToggleLiveSimulation} disabled={liveSimBusy}>
                {liveSimBusy ? "Working..." : liveSimulationRunning ? "Stop Live Simulation" : "Start Live Simulation"}
              </button>
              <button type="button" onClick={() => setLiveSimPanelOpen(false)}>
                Close Monitor
              </button>
            </div>
          </div>
          <div className="kpi-grid live-sim-kpis">
            <div className="kpi"><span>Calls Received</span><strong>{liveCallsReceived}</strong></div>
            <div className="kpi"><span>Units Assigned</span><strong>{liveUnitsAssigned}</strong></div>
            <div className="kpi"><span>Calls Resolved</span><strong>{liveCallsResolved}</strong></div>
            <div className="kpi"><span>Active Calls</span><strong>{liveActiveCalls}</strong></div>
            <div className="kpi"><span>Runtime</span><strong>{liveRuntimeLabel}</strong></div>
          </div>
          <div className="dispatch-banner">
            Call catalog: {patrolStatus?.call_types_loaded ?? 0} call types · {patrolStatus?.call_locations_loaded ?? 0} Redlands locations · Next call due {patrolStatus?.next_call_due_at ?? "pending"}
          </div>
          <div className="live-sim-workflow">
            <h3>Dispatch Workflow (Commander Tracking)</h3>
            {workflowBoard ? (
              <div className="dispatch-banner">
                Total {workflowBoard.summary.total_calls} · Active {workflowBoard.summary.active_calls} · Queued {workflowBoard.summary.queued_calls} · Assigned {workflowBoard.summary.assigned_calls} · On Scene {workflowBoard.summary.on_scene_calls} · Resolved {workflowBoard.summary.resolved_calls}
              </div>
            ) : null}
            <div className="timeline-list">
              {liveWorkflowRows.map((row) => (
                <div key={row.incident_id} className="timeline-item">
                  <strong>{row.incident_id} · {row.call_display || row.call_type}</strong>
                  <p>
                    {row.assigned_callsign ?? "Awaiting assignment"} · {row.assigned_officer ?? "Dispatch pending"} · {row.status} · {row.phase}
                  </p>
                  <p>{row.address}</p>
                  <p>P{row.priority} · Elapsed {row.elapsed_minutes}m</p>
                </div>
              ))}
              {liveWorkflowRows.length === 0 ? (
                <div className="dispatch-banner warn">
                  No active dispatch workflows yet. Start simulation and refresh.
                </div>
              ) : null}
            </div>
          </div>
          <div className="live-sim-workflow">
            <h3>Recently Resolved</h3>
            <div className="timeline-list">
              {liveResolvedRows.map((row) => (
                <div key={`${row.incident_id}-resolved`} className="timeline-item">
                  <strong>{row.incident_id} · {row.call_display || row.call_type}</strong>
                  <p>{row.assigned_callsign ?? row.assigned_unit_id ?? "Unknown unit"} · {row.disposition_code ?? "CLOSED"}</p>
                  <p>{row.disposition_summary ?? "Disposition recorded."}</p>
                </div>
              ))}
              {liveResolvedRows.length === 0 ? <div className="dispatch-banner">No resolved calls yet in this run.</div> : null}
            </div>
          </div>
          <div className="live-sim-roster">
            <h3>Officers On Shift</h3>
            <div className="timeline-list">
              {liveRoster.map((unit) => (
                <div key={unit.unit_id} className="timeline-item">
                  <strong>{unit.callsign} · {unit.officer_name ?? "Unassigned"}</strong>
                  <p>{unit.role} · {unit.shift ?? "N/A"} · Beat {unit.beat ?? "N/A"} · {unit.status}</p>
                  <p>{unit.coordinates.lat.toFixed(5)}, {unit.coordinates.lon.toFixed(5)}</p>
                  <button
                    type="button"
                    onClick={() => {
                      if (!mapRef.current) return;
                      mapRef.current.flyTo({ center: [unit.coordinates.lon, unit.coordinates.lat], zoom: 14, speed: 0.8 });
                    }}
                  >
                    Center On Map
                  </button>
                </div>
              ))}
              {liveRoster.length === 0 ? <div className="dispatch-banner warn">No units loaded.</div> : null}
            </div>
          </div>
        </section>
      ) : null}
      {!mapFocusMode ? (
        <aside className="side-tab-rail" aria-label="Module tabs">
          {activeModule !== "mapOnly" ? (
            <button
              type="button"
              className="side-tab side-tab-close"
              title="Close open module"
              aria-label="Close open module"
              onClick={() => {
                setActiveModule("mapOnly");
                setModuleDockOpen(false);
              }}
            >
              <span className="side-tab-icon">X</span>
            </button>
          ) : null}
          {sideRailModuleButtons.map((item) => (
            <button
              key={`side-tab-${item.id}`}
              type="button"
              className={`side-tab ${activeModule === item.id ? "active" : ""}`}
              title={item.label}
              aria-label={item.label}
              onClick={() => {
                if (item.id === "mapOnly" && activeModule === "mapOnly") return;
                if (item.id === activeModule) {
                  setActiveModule("mapOnly");
                } else {
                  setActiveModule(item.id);
                }
                setModuleDockOpen(false);
              }}
            >
              <span className={`side-tab-icon ${item.iconStyle === "policyBook" ? "policy-book" : item.iconStyle === "codeBook" ? "code-book" : ""}`}>
                {item.icon}
              </span>
            </button>
          ))}
          <button
            type="button"
            className={`side-tab ${moduleDockOpen ? "active" : ""}`}
            title="All modules"
            aria-label="All modules"
            onClick={() => setModuleDockOpen((prev) => !prev)}
          >
            <span className="side-tab-icon">ALL</span>
          </button>
        </aside>
      ) : null}

      <section className="status-strip">
        <div className="status-strip-core">
          <span className={`chip ${patrolStatus?.enabled ? "ok" : ""}`}>
            Patrol: {patrolStatus?.enabled ? `${patrolStatus.profile}` : "OFF"}
          </span>
          <span className="chip">Active Calls: {patrolStatus?.active_incidents ?? 0}/{patrolStatus?.max_active_calls ?? 10}</span>
          <span className="chip">Units Online: {patrolStatus?.dispatchable_units ?? 0}</span>
        </div>
        <div className="status-strip-actions">
          <button type="button" className="dispatch-secondary" onClick={() => setStatusDetailsOpen((prev) => !prev)}>
            {statusDetailsOpen ? "Hide Status Detail" : "Status Detail"}
          </button>
          {activeModule !== "mapOnly" ? (
            <button type="button" className="dispatch-secondary" onClick={() => setActiveModule("mapOnly")}>
              Back to Map
            </button>
          ) : null}
        </div>
      </section>

      {statusDetailsOpen ? (
        <div className="chip-row">
          {activeModule === "mapOnly" ? <span className="chip ok">Map-only workspace active</span> : null}
          <span className="chip">Traffic: {mapData?.traffic_overlay ?? "n/a"}</span>
          <span className="chip">Units Avail: {availabilityBoard?.summary.available_count ?? 0}</span>
          <span className="chip">Units Busy: {availabilityBoard?.summary.unavailable_count ?? 0}</span>
          {canReportModules ? <span className="chip">Review Queue: {reviewQueue?.review_count ?? 0}</span> : null}
          {activeModule !== "mapOnly" ? <span className="chip">Open Module: {activeModuleMeta?.label ?? activeModule}</span> : null}
        </div>
      ) : null}
      {activeModule !== "mapOnly" ? (
        <section className="active-module-row floating">
          <div className="status-strip-core">
            <span className="chip ok">Open: {activeModuleMeta?.label ?? activeModule}</span>
            <span className="chip">Esc to close</span>
          </div>
          <div className="status-strip-actions">
            <button type="button" className="dispatch-secondary" onClick={() => setModuleDockOpen((prev) => !prev)}>
              {moduleDockOpen ? "Hide Modules" : "Show Modules"}
            </button>
            <button type="button" className="dispatch-secondary" onClick={() => setActiveModule("mapOnly")}>
              Close Module
            </button>
          </div>
        </section>
      ) : null}

      {!mapFocusMode && moduleDockOpen ? (
        <section className="module-dock-shell">
          <div className="module-dock-toolbar">
            <button
              type="button"
              className="dispatch-secondary active"
              onClick={() => setModuleDockOpen(false)}
            >
              Close Module Launcher
            </button>
            <p className="module-dock-note">
              Modules are grouped by workflow. Expand a group, then pick a hub.
            </p>
          </div>
          <section className="module-dock">
            <div className="module-dock-head">
              <input
                className="module-search"
                value={moduleSearch}
                onChange={(e) => setModuleSearch(e.target.value)}
                placeholder="Find module or hub..."
              />
            </div>
            <div className="module-groups">
              {groupedVisibleModules.map((group) => {
                const searchOpen = Boolean(moduleSearchQuery);
                const groupOpen = searchOpen || openModuleGroups[group.id];
                return (
                  <section key={group.id} className="module-group">
                    <button
                      type="button"
                      className={`module-group-toggle ${groupOpen ? "open" : ""}`}
                      onClick={() =>
                        setOpenModuleGroups((prev) => ({
                          ...prev,
                          [group.id]: searchOpen ? true : !groupOpen,
                        }))
                      }
                    >
                      <span className="module-group-icon">{group.icon}</span>
                      <span className="module-group-copy">
                        <strong>{group.label}</strong>
                        <span>{group.description}</span>
                      </span>
                      <span className="module-group-count">{group.items.length}</span>
                    </button>
                    {groupOpen ? (
                      <div className="module-submenu">
                        {group.items.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            className={`module-btn ${activeModule === item.id ? "active" : ""}`}
                            onClick={() => {
                              setActiveModule(item.id);
                              setModuleDockOpen(false);
                              setOpenModuleGroups((prev) => ({ ...prev, [group.id]: true }));
                            }}
                          >
                            <span className={`module-icon ${item.iconStyle === "policyBook" ? "policy-book" : item.iconStyle === "codeBook" ? "code-book" : ""}`}>
                              {item.icon}
                            </span>
                            {item.label}
                            {typeof item.badge === "number" ? <span className="module-count">{item.badge}</span> : null}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </section>
                );
              })}
            </div>
            {groupedVisibleModules.length === 0 ? <span className="chip">No module matches filter.</span> : null}
          </section>
        </section>
      ) : null}

      <main className={`layout ${rightColumnActive ? "" : "map-focus"}`.trim()}>
        <section className="main-column">
          {activeModule === "intake" ? (
          <article className="card panel module-overlay">
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
            <div className="template-row">
              <label className="form-field">
                Mock Units
                <input
                  type="number"
                  min={4}
                  max={40}
                  value={mockUnitsCount}
                  onChange={(e) => setMockUnitsCount(Math.max(4, Math.min(40, Number(e.target.value) || 4)))}
                />
              </label>
              <label className="form-field">
                Mock Incidents
                <input
                  type="number"
                  min={4}
                  max={120}
                  value={mockIncidentsCount}
                  onChange={(e) => setMockIncidentsCount(Math.max(4, Math.min(120, Number(e.target.value) || 4)))}
                />
              </label>
            </div>
            <div className="toggle-row">
              <label>
                <input
                  type="checkbox"
                  checked={mockClearExisting}
                  onChange={(e) => setMockClearExisting(e.target.checked)}
                />
                Replace existing active dataset
              </label>
            </div>
            <div className="dev-actions">
              <button type="button" onClick={handleGenerateMockData} disabled={loading}>
                Generate Mock Units + Calls
              </button>
            </div>
            <div className="template-row">
              <label className="form-field">
                Initial Calls
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={patrolInitialCalls}
                  onChange={(e) => setPatrolInitialCalls(Math.max(1, Math.min(20, Number(e.target.value) || 4)))}
                />
              </label>
            </div>
            <div className="button-grid">
              <button type="button" onClick={handleStartPatrolSimulation} disabled={loading}>
                Start 10-Officer Beat Simulation
              </button>
              <button type="button" onClick={handleStopPatrolSimulation} disabled={loading || !patrolStatus?.enabled}>
                Stop Simulation
              </button>
            </div>
            <div className="dev-actions">
              <button type="button" onClick={handleToggleLiveSimulation} disabled={liveSimBusy}>
                {liveSimulationRunning ? "Stop Live Simulation" : "Start Live Simulation"}
              </button>
            </div>
            {patrolStatus ? (
              <div className="dispatch-banner">
                {patrolStatus.enabled ? patrolStatus.profile : "Paused"} · Dispatchable {patrolStatus.dispatchable_units} ·
                Supervisors {patrolStatus.senior_units} · Calls generated {patrolStatus.calls_generated} · Auto-assigned{" "}
                {patrolStatus.calls_auto_assigned} · Active {patrolStatus.active_incidents}/{patrolStatus.max_active_calls ?? 10}
              </div>
            ) : null}
            <div className="dispatch-banner">{banner}</div>
          </article>
          ) : null}

          <article className={`card map-card ${mapFocusMode ? "map-focus-mode" : ""}`.trim()}>
            <div className="map-header"><h2>Unified Live Map</h2><p>Live unit status and incident priority overlays.</p></div>
            <div className="toggle-row">
              <label><input type="checkbox" checked={showMapUnits} onChange={(e) => setShowMapUnits(e.target.checked)} /> Units</label>
              <label><input type="checkbox" checked={showMapIncidents} onChange={(e) => setShowMapIncidents(e.target.checked)} /> Incidents</label>
              <label><input type="checkbox" checked={showMapBeats} onChange={(e) => setShowMapBeats(e.target.checked)} /> Beat Overlays</label>
              <span className={`chip ${mapStyleMode === "fallback" ? "warn" : "ok"}`}>{mapStatusMessage}</span>
              <button type="button" className="dispatch-secondary" onClick={() => setMapFocusMode((prev) => !prev)}>
                {mapFocusMode ? "Exit Map Focus" : "Map Focus"}
              </button>
              <button type="button" className="dispatch-secondary" onClick={handleRetryPrimaryMapStyle}>
                Retry Primary Map
              </button>
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
            <div className="map-canvas">
              <div className="maplibre-map" ref={mapContainerRef} />
              {selectedIncident ? (
                <div className="map-hud">
                  <div className="map-hud-head">
                    <strong>{selectedIncident.incident_id}</strong>
                    <span className={`badge soft ${reportReadiness?.ready_for_submission ? "ok" : ""}`}>
                      {reportReadiness?.ready_for_submission ? "RMS READY" : "RMS BLOCKED"}
                    </span>
                  </div>
                  <p>{incidentDispatchLabel(selectedIncident)} · P{selectedIncident.priority} · {selectedIncident.status}</p>
                  <p>{selectedIncident.address}</p>
                  <p>
                    Risk {riskProfile?.risk_score ?? selectedIncident.priority}
                    {selectedAssignedUnit ? ` · Unit ${selectedAssignedUnit.callsign}` : ""}
                    {incidentDetail?.elapsed_minutes ? ` · Elapsed ${incidentDetail.elapsed_minutes}m` : ""}
                  </p>
                  <div className="map-hud-actions">
                    <button type="button" onClick={() => handleRecommend()} disabled={loading}>Recommend</button>
                    <button type="button" onClick={() => handleAssign()} disabled={loading}>Dispatch</button>
                    <button
                      type="button"
                      title={actionReason("ON_SCENE")}
                      onClick={() => handleQuickCode("ON_SCENE")}
                      disabled={loading || !isActionEnabled("ON_SCENE")}
                    >
                      On Scene
                    </button>
                    <button type="button" onClick={() => setActiveModule("disposition")} disabled={loading}>Disposition</button>
                  </div>
                </div>
              ) : null}
            </div>
          </article>

          {activeModule === "queue" ? (
          <article className="card panel module-overlay">
            <h2>Active Queue</h2>
            <div className="dispatch-form-grid">
              <label className="form-field">Status Filter<select value={queueStatusFilter} onChange={(e) => setQueueStatusFilter(e.target.value)}><option value="ALL">ALL</option><option value="NEW">NEW</option><option value="DISPATCHED">DISPATCHED</option><option value="EN_ROUTE">EN_ROUTE</option><option value="ON_SCENE">ON_SCENE</option><option value="TRANSPORT">TRANSPORT</option><option value="CLOSED">CLOSED</option></select></label>
              <label className="form-field">Min Priority<input type="number" min={0} max={100} value={queuePriorityFloor} onChange={(e) => setQueuePriorityFloor(Number(e.target.value) || 0)} /></label>
              <label className="form-field">
                Sort
                <select value={queueSortMode} onChange={(e) => setQueueSortMode(e.target.value)}>
                  <option value="PRIORITY_DESC">Priority High-Low</option>
                  <option value="PRIORITY_ASC">Priority Low-High</option>
                  <option value="STATUS">Status Workflow</option>
                  <option value="INCIDENT">Incident ID</option>
                </select>
              </label>
              <label className="form-field wide">
                Search
                <input
                  value={queueSearch}
                  onChange={(e) => setQueueSearch(e.target.value)}
                  placeholder="Incident ID, address, or call type..."
                />
              </label>
            </div>
            <div className="status-strip-actions inline-controls">
              <span className="chip">Showing {filteredQueue.length} of {queue.length} calls</span>
              <button
                type="button"
                className="dispatch-secondary"
                onClick={() => {
                  setQueueStatusFilter("ALL");
                  setQueuePriorityFloor(0);
                  setQueueSearch("");
                  setQueueSortMode("PRIORITY_DESC");
                }}
              >
                Clear Filters
              </button>
            </div>
            {filteredQueue.map((incident) => (
              <button
                key={incident.incident_id}
                type="button"
                className={`list-row ${selectedIncidentId === incident.incident_id ? "active" : ""}`}
                onClick={() => setSelectedIncidentId(incident.incident_id)}
              >
                <div><strong>{incident.incident_id} - {incidentDispatchLabel(incident)}</strong><p>{incident.address}</p></div>
                <div className="queue-meta"><span className="badge">P{incident.priority}</span><span className="badge soft">{incident.status}</span></div>
              </button>
            ))}
            {filteredQueue.length === 0 ? <div className="dispatch-banner">No incidents match current filters.</div> : null}
          </article>
          ) : null}
          {activeModule === "priorityRadar" ? (
          <article className="card panel module-overlay">
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
          {activeModule === "fieldOps" ? (
          <article className="card panel module-overlay">
            <h2>Field Operations</h2>
            <p className="section-subtitle">
              {selectedIncident?.incident_id ?? "No incident"} · Elapsed {incidentDetail?.elapsed_minutes ?? 0}m
            </p>
            <div className="button-grid">
              <button type="button" onClick={handleSafetyBriefing} disabled={loading || !selectedIncident}>Generate Safety Briefing</button>
              <button type="button" onClick={handleExportIncidentPacket} disabled={!selectedIncident}>Export Incident Packet</button>
            </div>
            <div className="dispatch-banner">
              Latest action:{" "}
              {incidentDetail?.latest_action?.action ??
                incidentDetail?.latest_action?.event ??
                "No action recorded"}
            </div>
            {safetyBriefing ? <div className="ai-box"><p>{safetyBriefing.briefing}</p><p>Risk score: {safetyBriefing.risk_score}</p><p>Hazards: {safetyBriefing.hazards.join(" | ")}</p><p>Checklist: {safetyBriefing.checklist.join(" | ")}</p></div> : null}
            <div className="template-row">
              <label className="form-field">
                Handoff Audience
                <select value={handoffAudience} onChange={(e) => setHandoffAudience(e.target.value)}>
                  <option value="ALL">ALL</option>
                  <option value="SUPERVISOR">SUPERVISOR</option>
                  <option value="NEXT_UNIT">NEXT_UNIT</option>
                  <option value="DETECTIVE">DETECTIVE</option>
                </select>
              </label>
              <label className="form-field">
                Handoff Note
                <input
                  value={handoffNoteText}
                  onChange={(e) => setHandoffNoteText(e.target.value)}
                  placeholder="Scene update for shift handoff..."
                />
              </label>
            </div>
            <div className="dev-actions">
              <button type="button" onClick={handlePostHandoffNote} disabled={loading || !handoffNoteText.trim()}>
                Post Handoff Note
              </button>
            </div>
            {(handoffFeed?.notes ?? []).length > 0 ? (
              <div className="timeline-list">
                {(handoffFeed?.notes ?? []).slice(0, 4).map((item) => (
                  <div key={item.note_id} className="timeline-item">
                    <strong>{item.unit_id} {"->"} {item.audience}</strong>
                    <p>{item.created_at}</p>
                    <p>{item.note}</p>
                  </div>
                ))}
              </div>
            ) : null}
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
          {activeModule === "assignedDeck" ? (
          <article className="card panel module-overlay">
            <h2>Assigned Call Deck</h2>
            <p className="section-subtitle">Keyboard shortcuts: A Accept · E En Route · O On Scene · C Clear</p>
            {(officerFeed?.assigned_incidents ?? []).length === 0 ? <div className="dispatch-banner">No active assignments for {statusUnitId}.</div> : null}
            {(officerFeed?.assigned_incidents ?? []).map((call) => (
              <div key={call.incident_id} className="hub-row">
                <strong>{call.incident_id} · {call.call_type} · P{call.priority}</strong>
                <p>{call.address} · {call.status}</p>
                <p>History: {call.history_at_address.join(" | ")}</p>
                <div className="call-actions">
                  <button type="button" onClick={() => { setSelectedIncidentId(call.incident_id); void handleOfficerAction("ACCEPT", call.incident_id); }} disabled={loading}>Accept</button>
                  <button type="button" onClick={() => { setSelectedIncidentId(call.incident_id); void handleOfficerAction("EN_ROUTE", call.incident_id); }} disabled={loading}>En Route</button>
                  <button type="button" onClick={() => { setSelectedIncidentId(call.incident_id); void handleOfficerAction("ON_SCENE", call.incident_id); }} disabled={loading}>On Scene</button>
                  <button type="button" onClick={() => { setSelectedIncidentId(call.incident_id); void handleOfficerAction("CLEAR", call.incident_id); }} disabled={loading}>Clear</button>
                </div>
              </div>
            ))}
          </article>
          ) : null}
          {activeModule === "callHistory" ? (
          <article className="card panel module-overlay">
            <h2>Officer Call History</h2>
            <p className="section-subtitle">
              Unit {statusUnitId} · Date {officerCallHistory?.history_date_utc ?? "n/a"} · Calls {officerCallHistory?.call_count ?? 0}
            </p>
            {(officerCallHistory?.calls ?? []).length === 0 ? (
              <div className="dispatch-banner">No assigned calls recorded yet for this shift window.</div>
            ) : null}
            {(officerCallHistory?.calls ?? []).map((item) => (
              <div key={item.incident_id} className="hub-row">
                <strong>{item.incident_id} · {item.call_display || item.call_type} · P{item.priority}</strong>
                <p>{item.address}</p>
                <p>Status: {item.status} · Created: {item.created_at}{item.closed_at ? ` · Closed: ${item.closed_at}` : ""}</p>
                {item.disposition_code ? <p>Disposition: {item.disposition_code} · {item.disposition_summary ?? "No summary"}</p> : null}
                <div className="button-grid">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedIncidentId(item.incident_id);
                      setActiveModule("assignedDeck");
                    }}
                    disabled={loading}
                  >
                    Open Call
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedIncidentId(item.incident_id);
                      setActiveModule("reportHub");
                    }}
                    disabled={loading}
                  >
                    Open Report Hub
                  </button>
                </div>
                <div className="timeline-list">
                  {item.documents.length === 0 ? (
                    <div className="timeline-item">
                      <strong>Documents</strong>
                      <p>No documents linked.</p>
                    </div>
                  ) : (
                    item.documents.map((doc, index) => (
                      <div key={`${item.incident_id}-${doc.doc_type}-${doc.uri ?? doc.report_id ?? index}`} className="timeline-item">
                        <strong>{doc.doc_type}</strong>
                        <p>{doc.report_id ? `Report ${doc.report_id}` : "Linked document"}</p>
                        <p>{doc.status ?? "UNKNOWN"}{doc.review_status ? ` · ${doc.review_status}` : ""}</p>
                        {doc.updated_at ? <p>{doc.updated_at}</p> : null}
                        {doc.doc_type === "REPORT_DRAFT" && doc.report_id ? (
                          <button type="button" onClick={() => void handleLoadDraft(doc.report_id as string)} disabled={loading}>Load Draft</button>
                        ) : null}
                        {doc.uri ? (
                          <p>
                            {doc.uri.startsWith("http") ? (
                              <a href={doc.uri} target="_blank" rel="noreferrer">Open Evidence</a>
                            ) : (
                              doc.uri
                            )}
                          </p>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </article>
          ) : null}
          {activeModule === "reportHub" ? (
          <article className="card panel module-overlay">
            <h2>Report Writing Hub</h2>
            <p className="section-subtitle">Incident: <strong>{selectedIncident?.incident_id ?? "None selected"}</strong></p>
            {reportReadiness ? (
              <div className={`dispatch-banner ${reportReadiness.ready_for_submission ? "success" : "warn"}`}>
                {reportReadiness.ready_for_submission
                  ? "Submission checklist complete."
                  : `Blockers: ${reportReadiness.blockers.join(" | ") || "Resolve report readiness items."}`}
              </div>
            ) : null}
            {reportReadiness ? (
              <div className="readiness-grid">
                <div className={`readiness-item ${reportReadiness.has_disposition ? "ok" : "warn"}`}>Disposition {reportReadiness.has_disposition ? "Complete" : "Pending"}</div>
                <div className={`readiness-item ${reportReadiness.has_draft ? "ok" : "warn"}`}>Draft {reportReadiness.has_draft ? "Saved" : "Missing"}</div>
                <div className={`readiness-item ${reportReadiness.has_template ? "ok" : "warn"}`}>Template {reportReadiness.has_template ? "Applied" : "Missing"}</div>
                <div className={`readiness-item ${reportReadiness.has_narrative ? "ok" : "warn"}`}>
                  Narrative {reportReadiness.narrative_length}/{reportReadiness.narrative_min_chars}
                </div>
                <div className={`readiness-item ${reportReadiness.evidence_count > 0 ? "ok" : "warn"}`}>Evidence {reportReadiness.evidence_count}</div>
                <div className={`readiness-item ${reportReadiness.review_complete ? "ok" : "warn"}`}>
                  Review {reportReadiness.review_required ? reportReadiness.review_status : "Not required"}
                </div>
              </div>
            ) : null}
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
              <button type="button" onClick={handleRunReportAudit} disabled={loading || reportAuditLoading || !selectedIncident}>
                {reportAuditLoading ? "Running AI QA..." : "Run AI Report QA"}
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
            <div className="report-editor-grid">
              <div className="report-editor-main">
                <div className="dispatch-form-grid">
                  <label className="form-field wide">Narrative Draft<textarea value={reportNarrative} onChange={(e) => setReportNarrative(e.target.value)} /></label>
                  <label className="form-field wide">Structured Fields (key=value;key2=value2)<input value={reportFields} onChange={(e) => setReportFields(e.target.value)} /></label>
                </div>
              </div>
              <aside className="report-audit-panel">
                <div className="report-audit-header">
                  <h3>AI Report QA</h3>
                  <span className="badge soft">
                    {visibleRequiredReportRecommendations.length} Required
                  </span>
                </div>
                <p className="report-audit-subtitle">Checks statutory elements, call facts, and policy-required content.</p>
                {reportAudit ? (
                  <div className="report-audit-summary">
                    <span>{visibleReportRecommendations.length} visible recommendation(s)</span>
                    {hiddenReportRecommendationCount > 0 ? <span>{hiddenReportRecommendationCount} ignored</span> : null}
                    <button
                      type="button"
                      className="audit-link-btn"
                      onClick={handleResetIgnoredRecommendations}
                      disabled={hiddenReportRecommendationCount === 0}
                    >
                      Reset ignored
                    </button>
                  </div>
                ) : (
                  <div className="dispatch-banner">Run AI Report QA to review missing legal and policy details.</div>
                )}
                {reportAudit && visibleReportRecommendations.length === 0 ? (
                  <div className="dispatch-banner success">All clear. No visible recommendations.</div>
                ) : null}
                <div className="report-audit-list">
                  {visibleReportRecommendations.map((rec) => (
                    <div
                      key={rec.recommendation_id}
                      className={`report-audit-item ${rec.severity === "REQUIRED" ? "required" : "recommended"}`}
                    >
                      <div className="report-audit-item-head">
                        <strong>{rec.title}</strong>
                        <span className={`badge soft ${rec.severity === "REQUIRED" ? "" : "ok"}`}>{rec.severity}</span>
                      </div>
                      <p>{rec.detail}</p>
                      {rec.legal_reference ? <p className="report-audit-legal">Ref: {rec.legal_reference}</p> : null}
                      <div className="report-audit-actions">
                        <button
                          type="button"
                          onClick={() => handleInsertReportRecommendation(rec)}
                          disabled={loading || reportAuditLoading}
                        >
                          Insert
                        </button>
                        <button
                          type="button"
                          onClick={() => handleIgnoreReportRecommendation(rec.recommendation_id)}
                          disabled={loading || reportAuditLoading}
                        >
                          Ignore
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </aside>
            </div>
            <div className="button-grid">
              <button type="button" onClick={handleSaveDraft} disabled={loading}>Save Draft</button>
              <button type="button" onClick={handleGenerateReport} disabled={loading || !reportReadiness?.ready_for_submission}>
                Submit RMS Payload
              </button>
            </div>
            {!reportReadiness?.ready_for_submission ? (
              <div className="dispatch-banner warn">Submission is locked until checklist blockers are resolved.</div>
            ) : null}
            {reportSummary ? <div className="dispatch-banner">{reportSummary}</div> : null}
            {reportAssist ? <div className="ai-box"><p>{reportAssist.improved_narrative}</p><p>Key points: {reportAssist.key_points.join(" | ")}</p></div> : null}
            <div className="hub-grid">
              <div className="hub-col">
                <h3>Drafts</h3>
                {(reportHub?.drafts ?? []).slice(0, 4).map((draft) => (
                  <button key={draft.report_id} type="button" className="list-row static" onClick={() => handleLoadDraft(draft.report_id)}>
                    <div>
                      <strong>{draft.report_id}</strong>
                      <p>{draft.incident_id} - {draft.status}</p>
                    </div>
                    <span className="badge soft">Load</span>
                  </button>
                ))}
              </div>
              <div className="hub-col">
                <h3>Missing Reports</h3>
                {(reportHub?.missing_reports ?? []).slice(0, 4).map((item) => (
                  <button
                    key={item.incident_id}
                    type="button"
                    className="list-row static"
                    onClick={() => {
                      setSelectedIncidentId(item.incident_id);
                      setReportSummary(`Switched to incident ${item.incident_id} from missing reports.`);
                    }}
                  >
                    <div>
                      <strong>{item.incident_id}</strong>
                      <p>{item.call_type} P{item.priority}</p>
                    </div>
                    <span className="badge soft">Open</span>
                  </button>
                ))}
              </div>
            </div>
          </article>
          ) : null}

          {activeModule === "intelHub" ? (
          <article className="card panel module-overlay">
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
              <button type="button" onClick={handleBuildIncidentIntel} disabled={loading || !selectedIncident}>Build Incident Intel Packet</button>
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
            {incidentIntel ? (
              <div className="profile-card">
                <strong>Incident Intel Packet - {incidentIntel.incident_id}</strong>
                <p>Address query: {incidentIntel.queries.address_query || "n/a"}</p>
                <p>Caller query: {incidentIntel.queries.caller_query || "n/a"}</p>
                <p>
                  Totals: records {incidentIntel.totals.records} · firearms {incidentIntel.totals.firearms} · warrants {incidentIntel.totals.warrants} · active warrants {incidentIntel.totals.active_warrants}
                </p>
                <p>Indicators: {incidentIntel.threat_indicators.join(" | ")}</p>
              </div>
            ) : null}
          </article>
          ) : null}
          {activeModule === "policyHub" ? (
          <article className="card panel module-overlay">
            <h2>Policy Hub</h2>
            <p className="section-subtitle">Search policy sections by keyword, section number, or topic.</p>
            {policyResults?.library_profile ? (
              <div className="dispatch-banner">
                Library: {policyResults.library_profile.library_name ?? "Policy Library"} ·
                Simulated agency: {policyResults.library_profile.simulated_agency ?? "FirstLine PD"} ·
                Source: {policyResults.library_profile.source_agency ?? "Police policy source"}
              </div>
            ) : null}
            <div className="search-row">
              <input value={policyQuery} onChange={(e) => setPolicyQuery(e.target.value)} placeholder="Search policy (ex: taser, cross draw, report writing)" />
              <button type="button" onClick={handlePolicySearch} disabled={loading}>Search Policy</button>
            </div>
            <div className="template-row">
              <label className="form-field">
                Sort
                <select value={policySort} onChange={(e) => setPolicySort(e.target.value as "relevance" | "title" | "section")}>
                  <option value="relevance">Relevance</option>
                  <option value="section">Section</option>
                  <option value="title">Title</option>
                </select>
              </label>
              <div className="form-field">
                <span>Best Match</span>
                <div className="dispatch-banner">
                  {policyResults?.best_guess ? `${policyResults.best_guess.section_id} ${policyResults.best_guess.title}` : "No current match"}
                </div>
              </div>
            </div>
            <div className="hub-grid">
              <div className="hub-col">
                <h3>Matching Sections ({policyResults?.result_count ?? 0})</h3>
                {(policyResults?.results ?? []).map((section) => (
                  <button key={section.section_id} type="button" className="list-row static intel-row" onClick={() => handleOpenPolicySection(section.section_id)}>
                    <div>
                      <strong>{section.section_id} · {section.title}</strong>
                      <p>{section.category}</p>
                      {section.source_policy_id || section.source_policy_title ? (
                        <p>Source: {section.source_policy_id ?? ""} {section.source_policy_title ?? ""}</p>
                      ) : null}
                      <p>{section.snippet}</p>
                    </div>
                    <span className="badge soft">Open</span>
                  </button>
                ))}
                {(policyResults?.results ?? []).length === 0 ? <div className="dispatch-banner">No policy sections loaded yet.</div> : null}
              </div>
              <div className="hub-col">
                <h3>Section Detail</h3>
                {activePolicySection ? (
                  <div className="profile-card policy-detail">
                    <strong>{activePolicySection.section_id} · {activePolicySection.title}</strong>
                    <p>Category: {activePolicySection.category}</p>
                    <p>Tags: {activePolicySection.tags.join(", ")}</p>
                    {activePolicySection.source_agency ? (
                      <p>Source Agency: {activePolicySection.source_agency}</p>
                    ) : null}
                    {activePolicySection.source_policy_id || activePolicySection.source_policy_title ? (
                      <p>Source Policy: {activePolicySection.source_policy_id ?? ""} {activePolicySection.source_policy_title ?? ""}</p>
                    ) : null}
                    <p>{activePolicySection.summary}</p>
                    <p>{activePolicySection.body}</p>
                    {activePolicySection.source_url ? (
                      <p><a href={activePolicySection.source_url} target="_blank" rel="noreferrer">Open source policy reference</a></p>
                    ) : null}
                  </div>
                ) : (
                  <div className="dispatch-banner">Select a policy hit to open full section text.</div>
                )}
              </div>
            </div>
          </article>
          ) : null}
          {activeModule === "codeHub" ? (
          <article className="card panel module-overlay">
            <h2>Code Hub</h2>
            <p className="section-subtitle">Search California code references by number or crime language.</p>
            <div className="search-row">
              <input value={codeQuery} onChange={(e) => setCodeQuery(e.target.value)} placeholder="Search code (ex: robbery, 211, strong armed)" />
              <button type="button" onClick={handleCodeSearch} disabled={loading}>Search Codes</button>
            </div>
            <div className="template-row">
              <label className="form-field">
                Sort
                <select value={codeSort} onChange={(e) => setCodeSort(e.target.value as "relevance" | "numeric" | "alpha")}>
                  <option value="relevance">Relevance</option>
                  <option value="numeric">Numeric</option>
                  <option value="alpha">Alphabetic</option>
                </select>
              </label>
              <div className="form-field">
                <span>AI Best Guess</span>
                <div className="dispatch-banner">
                  {codeResults?.best_guess
                    ? `${codeResults.best_guess.code_key} ${codeResults.best_guess.title} (${Math.round(codeResults.best_guess.confidence * 100)}%)`
                    : "No best guess yet"}
                </div>
              </div>
            </div>
            <div className="hub-grid">
              <div className="hub-col">
                <h3>Matches ({codeResults?.result_count ?? 0})</h3>
                {(codeResults?.results ?? []).map((code) => (
                  <button key={code.code_key} type="button" className="list-row static intel-row" onClick={() => handleOpenCodeDetail(code.code_key)}>
                    <div>
                      <strong>{code.code_key} · {code.title}</strong>
                      <p>{code.offense_level}</p>
                      <p>{code.summary}</p>
                    </div>
                    <span className="badge soft">{Math.round(code.match_score)}</span>
                  </button>
                ))}
                {(codeResults?.results ?? []).length === 0 ? <div className="dispatch-banner">No code results loaded yet.</div> : null}
              </div>
              <div className="hub-col">
                <h3>Code Detail</h3>
                {activeCodeDetail ? (
                  <div className="profile-card policy-detail">
                    <strong>{activeCodeDetail.code_key} · {activeCodeDetail.title}</strong>
                    <p>Section: {activeCodeDetail.section} · Level: {activeCodeDetail.offense_level}</p>
                    <p>Library source: {activeCodeDetail.library_source ?? "California Legislative Information"}</p>
                    <p>{activeCodeDetail.summary}</p>
                    <p>Aliases: {activeCodeDetail.aliases.join(", ") || "None"}</p>
                    <p>Keywords: {activeCodeDetail.keywords.join(", ") || "None"}</p>
                    <p>Match signals: {activeCodeDetail.match_reasons.join(" | ") || "Keyword relevance"}</p>
                    {activeCodeDetail.official_source_connected && activeCodeDetail.official_source ? (
                      <div className="dispatch-banner success">
                        Official statute connected: {activeCodeDetail.official_source.section_label}
                      </div>
                    ) : null}
                    {activeCodeDetail.official_source?.chapter ? <p>Chapter: {activeCodeDetail.official_source.chapter}</p> : null}
                    {activeCodeDetail.official_source?.section_text ? <p>{activeCodeDetail.official_source.section_text}</p> : null}
                    {activeCodeDetail.official_source?.history ? <p>History: {activeCodeDetail.official_source.history}</p> : null}
                    <p><a href={activeCodeDetail.statute_url} target="_blank" rel="noreferrer">Open statute reference</a></p>
                  </div>
                ) : (
                  <div className="dispatch-banner">Select a code result to open full detail.</div>
                )}
              </div>
            </div>
          </article>
          ) : null}
        </section>

        {rightColumnActive ? <aside className="right-column">
          {activeModule === "commandDash" ? (
          <article className="card panel module-overlay">
            <h2>Command Dashboard</h2>
            <div className="dev-actions"><button type="button" onClick={handleExportExecutiveBrief} disabled={loading}>Export Executive Brief</button></div>
            <div className="kpi-grid">
              <div className="kpi"><span>Active Incidents</span><strong>{command?.active_incidents ?? 0}</strong></div>
              <div className="kpi"><span>Pending Calls</span><strong>{command?.pending_calls ?? 0}</strong></div>
              <div className="kpi"><span>Units Available</span><strong>{command?.units_available ?? 0}</strong></div>
              <div className="kpi"><span>Avg ETA</span><strong>{command?.average_response_minutes ?? 0}m</strong></div>
            </div>
            <div className="hub-row">
              <strong>Operational Pulse</strong>
              <p>
                Incidents {signed(commandTrends?.metrics.active_incidents.change ?? 0)} ·
                Pending {signed(commandTrends?.metrics.pending_calls.change ?? 0)} ·
                Busy Units {signed(commandTrends?.metrics.units_busy.change ?? 0)} ·
                ETA {signed(commandTrends?.metrics.average_response_minutes.change ?? 0, "m")}
              </p>
            </div>
            <div className="hub-row">
              <strong>Command Report Queue</strong>
              <p>
                Reports {commandReports?.report_count ?? 0} · Pending review {commandReports?.pending_review_count ?? 0}
              </p>
            </div>
            <div className="button-grid">
              <button type="button" onClick={() => setActiveModule("commandReports")} disabled={loading}>
                Open Commander Report Review
              </button>
              <button type="button" onClick={() => setActiveModule("commandCallHistory")} disabled={loading}>
                Open Shift Call History
              </button>
              <button type="button" onClick={() => setActiveModule("unitReadiness")} disabled={loading}>
                Open Unit Status Board
              </button>
              <button type="button" onClick={() => setLiveSimPanelOpen(true)} disabled={loading}>
                Open Live Sim Monitor
              </button>
            </div>
          </article>
          ) : null}
          {activeModule === "commandReports" ? (
          <article className="card panel module-overlay">
            <h2>Commander Report Review</h2>
            <p className="section-subtitle">
              Reports {commandReports?.report_count ?? 0} · Pending review {commandReports?.pending_review_count ?? 0}
            </p>
            <div className="dispatch-form-grid">
              <label className="form-field">
                Review Status
                <select value={commandReportReviewFilter} onChange={(event) => setCommandReportReviewFilter(event.target.value)}>
                  <option value="ALL">ALL</option>
                  <option value="PENDING">PENDING</option>
                  <option value="APPROVED">APPROVED</option>
                  <option value="CHANGES_REQUESTED">CHANGES_REQUESTED</option>
                </select>
              </label>
              <label className="form-field">
                Search
                <input
                  value={commandReportSearch}
                  onChange={(event) => setCommandReportSearch(event.target.value)}
                  placeholder="Report ID, incident, unit, narrative..."
                />
              </label>
            </div>
            <div className="status-strip-actions inline-controls">
              <span className="chip">Showing {filteredCommandReports.length} of {commandReports?.report_count ?? 0} reports</span>
              <button
                type="button"
                className="dispatch-secondary"
                onClick={() => {
                  setCommandReportReviewFilter("ALL");
                  setCommandReportSearch("");
                }}
              >
                Clear Filters
              </button>
            </div>
            {commandReviewDraft ? (
              <div className="hub-row">
                <strong>Reviewing Narrative: {commandReviewDraft.report_id}</strong>
                <p>
                  Incident {commandReviewDraft.incident_id} · Unit {commandReviewDraft.unit_id} ·
                  Status {commandReviewDraft.status} · Review {commandReviewDraft.review_status ?? "PENDING"}
                </p>
                <label className="form-field">
                  Review Notes
                  <input
                    value={reviewNotesByReport[commandReviewDraft.report_id] ?? ""}
                    onChange={(e) =>
                      setReviewNotesByReport((prev) => ({
                        ...prev,
                        [commandReviewDraft.report_id]: e.target.value,
                      }))
                    }
                    placeholder="Command review note"
                  />
                </label>
                <div className="command-narrative-box">
                  <pre>{commandReviewDraft.narrative || "No narrative entered."}</pre>
                </div>
                <div className="button-grid">
                  <button
                    type="button"
                    onClick={() => handleReviewDecision(commandReviewDraft.report_id, "APPROVE")}
                    disabled={loading}
                  >
                    Approve Narrative
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReviewDecision(commandReviewDraft.report_id, "REJECT")}
                    disabled={loading}
                  >
                    Request Changes
                  </button>
                  <button
                    type="button"
                    onClick={() => setCommandReviewDraft(null)}
                    disabled={loading}
                  >
                    Close Narrative
                  </button>
                </div>
              </div>
            ) : (
              <div className="dispatch-banner">
                Select a report below to open the full narrative for review.
              </div>
            )}
            {commandReviewError ? <div className="dispatch-banner warn">{commandReviewError}</div> : null}
            {filteredCommandReports.map((item) => (
              <div key={`command-report-${item.report_id}`} className="hub-row">
                <strong>{item.report_id} · {item.incident_id}</strong>
                <p>{item.unit_id} · {item.status} · Review {item.review_status ?? "PENDING"} · Updated {item.updated_at}</p>
                <p>
                  {item.primary_code ? `${item.primary_code} · ` : ""}{item.call_type ?? "Incident"} ·
                  Priority {item.priority ?? "-"} · Incident {item.incident_status ?? "UNKNOWN"} ·
                  {item.disposition_code ? ` Dispo ${item.disposition_code}` : " Disposition pending"}
                </p>
                <p>{item.narrative_preview || "No narrative preview."}</p>
                {item.review_notes ? <p>Latest notes: {item.review_notes}</p> : null}
                <div className="button-grid">
                  <button
                    type="button"
                    onClick={() => handleOpenCommandNarrative(item.report_id)}
                    disabled={loading || commandReviewBusy}
                  >
                    {commandReviewDraft?.report_id === item.report_id ? "Narrative Open" : "Review Narrative"}
                  </button>
                </div>
              </div>
            ))}
            {(commandReports?.reports ?? []).length === 0 ? (
              <div className="dispatch-banner warn">
                No reports yet. During live simulation, reports appear after officers go on-scene and finalize dispositions.
              </div>
            ) : null}
            {(commandReports?.reports ?? []).length > 0 && filteredCommandReports.length === 0 ? (
              <div className="dispatch-banner warn">
                No reports match current commander filters.
              </div>
            ) : null}
          </article>
          ) : null}
          {activeModule === "commandCallHistory" ? (
          <article className="card panel module-overlay">
            <h2>Commander Shift Call History</h2>
            <p className="section-subtitle">
              Date {commandCallHistory?.history_date_utc ?? commandHistoryDate} · Shift {commandCallHistory?.shift_filter ?? commandHistoryShift} ·
              Calls {commandCallHistory?.call_count ?? 0} · Reports {commandCallHistory?.report_count ?? 0}
            </p>
            <div className="template-row">
              <label className="form-field">
                Shift Date (UTC)
                <input
                  type="date"
                  value={commandHistoryDate}
                  onChange={(e) => setCommandHistoryDate(e.target.value || new Date().toISOString().slice(0, 10))}
                />
              </label>
              <label className="form-field">
                Shift
                <select value={commandHistoryShift} onChange={(e) => setCommandHistoryShift(e.target.value)}>
                  <option value="ALL">ALL</option>
                  <option value="DAY">DAY</option>
                  <option value="SWING">SWING</option>
                  <option value="GRAVE">GRAVE</option>
                </select>
              </label>
            </div>
            <div className="button-grid">
              <button type="button" onClick={() => void refreshDashboard()} disabled={loading}>
                Refresh Shift History
              </button>
              <button type="button" onClick={() => setActiveModule("commandReports")} disabled={loading}>
                Open Report Review Queue
              </button>
            </div>
            <div className="dispatch-form-grid">
              <label className="form-field wide">
                Search Calls
                <input
                  value={commandCallSearch}
                  onChange={(event) => setCommandCallSearch(event.target.value)}
                  placeholder="Incident, call type, location, officer, disposition..."
                />
              </label>
            </div>
            <div className="status-strip-actions inline-controls">
              <span className="chip">Showing {filteredCommandCalls.length} of {commandCallHistory?.call_count ?? 0} calls</span>
              <button type="button" className="dispatch-secondary" onClick={() => setCommandCallSearch("")}>
                Clear Search
              </button>
            </div>
            <div className="dispatch-banner">
              Resolved {commandCallHistory?.resolved_count ?? 0} · Open {commandCallHistory?.open_count ?? 0} ·
              Timeline lines {commandCallHistory?.timeline_line_count ?? 0}
            </div>
            {filteredCommandCalls.map((item) => (
              <div key={`command-history-${item.incident_id}`} className="hub-row">
                <strong>{item.incident_id} · {item.call_display || item.call_type} · P{item.priority}</strong>
                <p>{item.address}</p>
                <p>
                  Created {item.created_at}
                  {item.closed_at ? ` · Closed ${item.closed_at}` : ""}
                  {item.assigned_shift ? ` · Shift ${item.assigned_shift}` : ""}
                </p>
                <p>
                  Assigned: {item.assigned_callsign ? `${item.assigned_callsign} (${item.assigned_officer ?? "Unassigned"})` : "Not yet assigned"} ·
                  Handled by: {item.handling_unit_label ?? item.assigned_unit_id ?? "Unknown"}
                </p>
                <p>
                  Disposition: {item.disposition_code ?? "PENDING"}
                  {item.disposition_summary ? ` · ${item.disposition_summary}` : ""}
                </p>
                <div className="button-grid">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedIncidentId(item.incident_id);
                      setActiveModule("queue");
                    }}
                    disabled={loading}
                  >
                    Open Incident
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveModule("commandReports")}
                    disabled={loading}
                  >
                    Open Command Reports
                  </button>
                </div>
                <div className="timeline-list">
                  {item.timeline_lines.map((line) => (
                    <div key={`${item.incident_id}-line-${line.line_no}-${line.time}`} className="timeline-item">
                      <strong>Line {line.line_no} · {line.event}</strong>
                      <p>{line.time}{line.unit_label ? ` · ${line.unit_label}` : ""}</p>
                      <p>{line.line}</p>
                    </div>
                  ))}
                  {item.timeline_lines.length === 0 ? (
                    <div className="timeline-item">
                      <strong>Timeline</strong>
                      <p>No timeline actions recorded.</p>
                    </div>
                  ) : null}
                </div>
                <div className="timeline-list">
                  {item.reports.map((report) => (
                    <div key={`${item.incident_id}-report-${report.report_id}`} className="timeline-item">
                      <strong>Report {report.report_id}</strong>
                      <p>
                        {report.unit_label ?? report.unit_id ?? "Unit unknown"} · {report.status}
                        {report.review_status ? ` · Review ${report.review_status}` : ""}
                        {report.updated_at ? ` · Updated ${report.updated_at}` : ""}
                      </p>
                      <p>Evidence links: {report.evidence_count}</p>
                      <p>{(report.narrative ?? "").trim() ? (report.narrative as string).slice(0, 360) : "No narrative entered."}</p>
                      {report.review_notes ? <p>Notes: {report.review_notes}</p> : null}
                      <div className="button-grid">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveModule("commandReports");
                            void handleOpenCommandNarrative(report.report_id);
                          }}
                          disabled={loading || commandReviewBusy}
                        >
                          Review Full Narrative
                        </button>
                      </div>
                    </div>
                  ))}
                  {item.reports.length === 0 ? (
                    <div className="timeline-item">
                      <strong>Reports</strong>
                      <p>No report linked yet.</p>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
            {(commandCallHistory?.calls ?? []).length === 0 ? (
              <div className="dispatch-banner warn">
                No calls found for this shift filter. Start live simulation or adjust date/shift filters.
              </div>
            ) : null}
            {(commandCallHistory?.calls ?? []).length > 0 && filteredCommandCalls.length === 0 ? (
              <div className="dispatch-banner warn">
                No shift calls match your search filter.
              </div>
            ) : null}
          </article>
          ) : null}
          {activeModule === "unitReadiness" ? (
          <article className="card panel module-overlay">
            <h2>CAD Unit Status Board</h2>
            <p className="section-subtitle">Dispatcher view of all on-shift units, statuses, elapsed state time, and active events.</p>
            <div className="kpi-grid">
              <div className="kpi"><span>Available</span><strong>{availabilityBoard?.summary.available_count ?? 0}</strong></div>
              <div className="kpi"><span>Busy</span><strong>{availabilityBoard?.summary.unavailable_count ?? 0}</strong></div>
              <div className="kpi"><span>Active Events</span><strong>{workflowBoard?.summary.active_calls ?? 0}</strong></div>
              <div className="kpi"><span>Assignments</span><strong>{availabilityBoard?.summary.active_assignments ?? 0}</strong></div>
            </div>
            <div className="dispatch-form-grid status-board-controls">
              <label className="form-field">
                Unit / Event Search
                <input
                  value={statusBoardSearch}
                  onChange={(event) => setStatusBoardSearch(event.target.value)}
                  placeholder="Call sign, location, event, comment..."
                />
              </label>
              <label className="form-field">
                Status Class
                <select value={statusBoardToneFilter} onChange={(event) => setStatusBoardToneFilter(event.target.value)}>
                  <option value="ALL">ALL</option>
                  <option value="available">AVAILABLE</option>
                  <option value="busy">BUSY</option>
                  <option value="enroute">EN ROUTE</option>
                  <option value="offduty">OFF DUTY</option>
                  <option value="other">OTHER</option>
                </select>
              </label>
            </div>
            <div className="status-strip-actions inline-controls">
              <span className="chip">Showing {filteredStatusBoardRows.length} of {statusBoardRows.length} units</span>
              <button
                type="button"
                className="dispatch-secondary"
                onClick={() => {
                  setStatusBoardSearch("");
                  setStatusBoardToneFilter("ALL");
                }}
              >
                Reset View
              </button>
            </div>
            <div className="status-board-wrap">
              <table className="status-board-table">
                <thead>
                  <tr>
                    <th>Unit</th>
                    <th>Status</th>
                    <th>Elapsed</th>
                    <th>Event #</th>
                    <th>Call / Event</th>
                    <th>Location</th>
                    <th>Comment</th>
                    <th>Msg</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStatusBoardRows.map((row) => (
                    <tr
                      key={`status-${row.unit_id}`}
                      className={`status-row ${row.tone} ${row.incident_id ? "interactive" : ""}`}
                      onClick={() => {
                        if (!row.incident_id) return;
                        setSelectedIncidentId(row.incident_id);
                        setActiveModule("queue");
                      }}
                      title={row.incident_id ? `Open ${row.incident_id}` : `${row.callsign} status`}
                    >
                      <td>{row.callsign}</td>
                      <td>
                        <span className={`status-pill ${row.tone}`}>{row.status_short}</span>
                      </td>
                      <td>{row.elapsed}</td>
                      <td>{row.event_no}</td>
                      <td>{row.call_label}</td>
                      <td>{row.location}</td>
                      <td>{row.comment}</td>
                      <td>
                        <button
                          type="button"
                          className="status-row-message-btn"
                          disabled={row.unit_id === statusUnitId}
                          onClick={(event) => {
                            event.stopPropagation();
                            openMessagingThread(row.unit_id);
                          }}
                        >
                          Msg
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {statusBoardRows.length === 0 ? <div className="dispatch-banner">No units loaded for status board.</div> : null}
              {statusBoardRows.length > 0 && filteredStatusBoardRows.length === 0 ? <div className="dispatch-banner warn">No units match current board filters.</div> : null}
            </div>
            {(unitBoard?.break_recommendations ?? []).length > 0 ? (
              <div className="dispatch-banner warn">
                Readiness alerts: {(unitBoard?.break_recommendations ?? []).slice(0, 4).join(" | ")}
              </div>
            ) : null}
          </article>
          ) : null}
          {activeModule === "opTrends" ? (
          <article className="card panel module-overlay">
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
          {activeModule === "reviewQueue" ? (
          <article className="card panel module-overlay">
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
          {activeModule === "reportingMetrics" ? (
          <article className="card panel module-overlay">
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

          {activeModule === "aiOps" ? (
          <article className="card panel module-overlay">
            <h2>AI Operations Engine</h2>
            <p className="section-subtitle">Incident: {selectedIncident?.incident_id ?? "None selected"}</p>
            <label className="form-field">Prompt<input value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} /></label>
            <div className="button-grid">
              <button type="button" onClick={handleAiAssist} disabled={loading}>Generate AI Assist</button>
              <button type="button" onClick={handleAiDispositionDraft} disabled={loading || !selectedIncident}>Draft Disposition</button>
            </div>
            {aiAssist ? <div className="ai-box"><p>{aiAssist.summary}</p><p>Recommendation: <strong>{aiAssist.recommended_disposition_code}</strong></p><p>Next actions: {aiAssist.next_actions.join(" | ")}</p><p>Safety alerts: {aiAssist.officer_safety_alerts.join(" | ") || "None"}</p></div> : null}
            {aiDispositionDraft ? <div className="ai-box"><p>Disposition draft: <strong>{aiDispositionDraft.recommended_disposition_code}</strong></p><p>{aiDispositionDraft.summary}</p><p>Reasons: {aiDispositionDraft.reasons.join(" | ")}</p></div> : null}
          </article>
          ) : null}

          {activeModule === "recommendation" ? (
          <article className="card panel module-overlay">
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

          {activeModule === "disposition" ? (
          <article className="card panel module-overlay">
            <h2>Call Disposition</h2>
            {reportReadiness ? (
              <div className={`dispatch-banner ${reportReadiness.has_disposition ? "success" : "warn"}`}>
                {reportReadiness.has_disposition
                  ? "Disposition complete. Incident can be cleared when report checklist is complete."
                  : "Disposition required before CLEAR action and final RMS submission."}
              </div>
            ) : null}
            <div className="button-grid">
              <button type="button" onClick={handleAiDispositionDraft} disabled={loading || !selectedIncident}>
                AI Draft Disposition
              </button>
              <button type="button" onClick={handleApplyAiDispositionDraft} disabled={loading || !aiDispositionDraft}>
                Apply AI Draft
              </button>
            </div>
            {aiDispositionDraft ? (
              <div className="ai-box">
                <p>Recommended code: <strong>{aiDispositionDraft.recommended_disposition_code}</strong> ({Math.round(aiDispositionDraft.confidence * 100)}%)</p>
                <p>{aiDispositionDraft.summary}</p>
                <p>Reasons: {aiDispositionDraft.reasons.join(" | ")}</p>
              </div>
            ) : null}
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
            <div className="button-grid">
              <button type="button" onClick={() => setActiveModule("reportHub")} disabled={loading}>
                Open Report Hub
              </button>
              <button
                type="button"
                title={actionReason("CLEAR")}
                onClick={() => handleOfficerAction("CLEAR")}
                disabled={loading || !isActionEnabled("CLEAR")}
              >
                Clear Incident
              </button>
            </div>
            <div className="dev-actions"><button type="button" onClick={handleFinalizeDisposition} disabled={loading}>Finalize Disposition</button></div>
          </article>
          ) : null}

          {activeModule === "mobileControls" ? (
          <article className="card panel module-overlay">
            <h2>Mobile Officer Controls</h2>
            <div className="dispatch-form-grid">
              <label className="form-field">Unit<select value={statusUnitId} onChange={(e) => setStatusUnitId(e.target.value)}>{units.map((u) => <option key={u.unit_id} value={u.unit_id}>{u.callsign} ({u.unit_id})</option>)}</select></label>
              <label className="form-field">Status<select value={statusValue} onChange={(e) => setStatusValue(e.target.value)}><option value="AVAILABLE">AVAILABLE</option><option value="EN_ROUTE">EN_ROUTE</option><option value="ON_SCENE">ON_SCENE</option><option value="BUSY">BUSY</option></select></label>
            </div>
            <div className="dev-actions"><button type="button" onClick={handleStatusUpdate} disabled={loading}>Push Status Update</button></div>
            <div className="call-actions">
              <button
                type="button"
                title={actionReason("ACCEPT")}
                onClick={() => handleOfficerAction("ACCEPT")}
                disabled={loading || !isActionEnabled("ACCEPT")}
              >
                Accept
              </button>
              <button
                type="button"
                title={actionReason("ON_SCENE")}
                onClick={() => handleOfficerAction("ARRIVED")}
                disabled={loading || !isActionEnabled("ON_SCENE")}
              >
                Arrived
              </button>
              <button
                type="button"
                title={actionReason("ON_SCENE")}
                onClick={() => handleOfficerAction("ON_SCENE")}
                disabled={loading || !isActionEnabled("ON_SCENE")}
              >
                On Scene
              </button>
              <button
                type="button"
                title={actionReason("CLEAR")}
                onClick={() => handleOfficerAction("CLEAR")}
                disabled={loading || !isActionEnabled("CLEAR")}
              >
                Clear Call
              </button>
            </div>
            {quickActionsPolicy ? <div className="dispatch-banner">Action policy: {quickActionsPolicy.incident_status} · {quickActionsPolicy.has_disposition ? "Disposition complete" : "Disposition pending"}</div> : null}
          </article>
          ) : null}

          {activeModule === "messaging" ? (
          <article className="card panel module-overlay messaging-overlay">
            <h2>Messaging Hub</h2>
            <p className="section-subtitle">
              Unit {statusUnitLabel} · Contacts {messagingContacts.length} · Inbox {messageInbox?.message_count ?? 0} · Unread {unreadThreadTotal}
            </p>
            <div className="messaging-modern-shell">
              <section className="messaging-thread-rail">
                <label className="form-field">
                  Search Threads
                  <input
                    value={messageThreadSearch}
                    onChange={(event) => setMessageThreadSearch(event.target.value)}
                    placeholder="Name, unit, status..."
                  />
                </label>
                <div className="messaging-thread-rail-list">
                  {filteredMessagingThreads.length === 0 ? (
                    <div className="dispatch-banner warn">No matching threads.</div>
                  ) : (
                    filteredMessagingThreads.map((contact) => (
                      <button
                        key={`thread-${contact.unit_id}`}
                        type="button"
                        className={`message-thread-preview ${contact.unit_id === messageTarget ? "active" : ""}`}
                        onClick={() => setMessageTarget(contact.unit_id)}
                      >
                        <div className="message-thread-preview-main">
                          <div className="message-thread-preview-title">
                            <strong>{contact.display_name}</strong>
                            <span className={`thread-status-pill ${statusTone(contact.status)}`}>{contact.subtitle || normalizeStatusLabel(contact.status)}</span>
                          </div>
                          <p>{typingByUnit[contact.unit_id] ? "Typing..." : contact.last_message_preview ?? "No messages yet."}</p>
                        </div>
                        <div className="message-thread-preview-meta">
                          <span>{formatMessageTimestamp(contact.last_message_at)}</span>
                          {contact.unread_count > 0 ? <span className="badge soft">{contact.unread_count}</span> : null}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </section>
              <section className="messaging-thread messaging-conversation-pane">
                <div className="messaging-conversation-head">
                  <div>
                    <strong>{activeMessagingContact?.display_name ?? compactUnitLabel({ unit_id: messageTarget })}</strong>
                    <p>{activeContactTyping ? "Typing..." : "Secure direct messaging channel"}</p>
                  </div>
                  <div className="messaging-conversation-head-actions">
                    <span className={`thread-status-pill ${statusTone(activeMessagingContact?.status)}`}>
                      {normalizeStatusLabel(activeMessagingContact?.status)}
                    </span>
                    {activeMessagingUnit ? (
                      <button
                        type="button"
                        className="dispatch-secondary compact"
                        onClick={() => {
                          if (!mapRef.current) return;
                          mapRef.current.flyTo({
                            center: [activeMessagingUnit.coordinates.lon, activeMessagingUnit.coordinates.lat],
                            zoom: 14,
                            speed: 0.8,
                          });
                        }}
                      >
                        Center Unit
                      </button>
                    ) : null}
                    {canDispatchModules ? (
                      <button
                        type="button"
                        className="dispatch-secondary compact"
                        onClick={() => setActiveModule("unitReadiness")}
                      >
                        Unit Board
                      </button>
                    ) : null}
                  </div>
                </div>
                <div ref={messageThreadListRef} className="timeline-list messaging-thread-list">
                  {directConversation.length === 0 ? (
                    <div className="dispatch-banner warn">No messages yet.</div>
                  ) : (
                    directConversation.map((message) => {
                      const outbound = message.from_unit === statusUnitId;
                      const counterpartId = outbound ? message.to_unit : message.from_unit;
                      const counterpart = units.find((item) => item.unit_id === counterpartId);
                      const counterpartLabel = compactUnitLabel(counterpart ?? { unit_id: counterpartId });
                      return (
                        <div key={`direct-${message.message_id}`} className={`message-bubble ${outbound ? "outbound" : "inbound"}`}>
                          <strong>{outbound ? `You -> ${counterpartLabel}` : counterpartLabel}</strong>
                          <p>{formatMessageTimestamp(message.sent_at)}</p>
                          <p>{message.body}</p>
                        </div>
                      );
                    })
                  )}
                </div>
                <div className="message-composer-row">
                  <textarea
                    value={messageBody}
                    onChange={(e) => setMessageBody(e.target.value)}
                    onKeyDown={handleMessageInputKeyDown}
                    placeholder="Type a secure message... (Enter to send, Shift+Enter for new line)"
                  />
                  <button type="button" onClick={handleSendMessage} disabled={loading || !messageBody.trim() || !messageTarget}>
                    Send
                  </button>
                </div>
                <div className="message-composer-meta">
                  <span>{messageBody.trim().length} chars</span>
                  <span>Enter to send · Shift+Enter newline</span>
                </div>
                {messageStatus ? <div className="dispatch-banner">{messageStatus}</div> : null}
              </section>
            </div>
          </article>
          ) : null}

          {activeModule === "hotkeys" ? <article className="card panel module-overlay">
            <h2>Hotkeys</h2>
            <div className="hub-row"><strong>View Navigation</strong><p>Alt+1 Dispatch · Alt+2 Field · Alt+3 Report · Alt+4 Intel</p></div>
            <div className="hub-row"><strong>Module Jump</strong><p>Alt+Q Queue · Alt+U Unit Board · Alt+M Messaging</p></div>
            <div className="hub-row"><strong>Field Actions</strong><p>A Accept · E En Route · O On Scene · C Clear (requires disposition)</p></div>
          </article> : null}
        </aside> : null}
      </main>

      {commandPaletteOpen ? (
        <div className="overlay" onClick={() => setCommandPaletteOpen(false)}>
          <section className="overlay-card palette-card" onClick={(event) => event.stopPropagation()}>
            <div className="overlay-head">
              <h3>Command Palette</h3>
              <button type="button" onClick={() => setCommandPaletteOpen(false)}>Close</button>
            </div>
            <p className="overlay-subtitle">Use Ctrl+K to reopen quickly.</p>
            <input
              ref={commandPaletteInputRef}
              className="module-search palette-search"
              value={commandPaletteQuery}
              onChange={(event) => setCommandPaletteQuery(event.target.value)}
              placeholder="Search modules or actions..."
            />
            <div className="timeline-list">
              {filteredCommandPaletteItems.slice(0, 12).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="list-row static palette-row"
                  onClick={() => {
                    item.run();
                    setCommandPaletteOpen(false);
                  }}
                >
                  <div>
                    <strong>{item.label}</strong>
                    <p>{item.hint}</p>
                  </div>
                  <span className="badge soft">Run</span>
                </button>
              ))}
              {filteredCommandPaletteItems.length === 0 ? <div className="dispatch-banner warn">No matching command.</div> : null}
            </div>
          </section>
        </div>
      ) : null}

      <nav className="bottom-nav">
        <button type="button" className="active locked">
          {sessionRole} View Locked: {roleDefaultView}
        </button>
      </nav>
    </div>
  );
}
