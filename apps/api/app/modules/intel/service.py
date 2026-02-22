from datetime import datetime, timezone
from html import unescape
from functools import lru_cache
import re
from urllib import error as urllib_error
from urllib import request as urllib_request

from app.core.state import state
from app.modules.intel.reference_data import (
    CALIFORNIA_CODE_INDEX,
    POLICY_LIBRARY_PROFILE,
    POLICY_SECTIONS,
)


def _normalize(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip().lower())


def _tokens(value: str) -> list[str]:
    return [token for token in re.split(r"[^a-z0-9.()/-]+", _normalize(value)) if token]


def _numeric_key(section: str) -> tuple[float, str]:
    match = re.search(r"\d+(?:\.\d+)?", section)
    if not match:
        return (999999.0, section)
    return (float(match.group(0)), section)


def _code_statute_url(code_family: str, section: str) -> str:
    law_map = {"PC": "PEN", "VC": "VEH", "HS": "HSC", "WIC": "WIC"}
    law_code = law_map.get(code_family.upper(), code_family.upper())
    encoded_section = section.replace(" ", "")
    return f"https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode={law_code}&sectionNum={encoded_section}"


def _clean_html_fragment(value: str) -> str:
    text = re.sub(r"<[^>]+>", " ", value or "")
    text = unescape(text.replace("\xa0", " "))
    return re.sub(r"\s+", " ", text).strip()


def _derive_title_from_chapter(chapter: str, fallback: str) -> str:
    match = re.search(r"\.\s*([^\[]+)", chapter)
    if match:
        candidate = match.group(1).strip()
        if candidate:
            return candidate
    return fallback


def _parse_code_query(value: str) -> tuple[str, str] | None:
    normalized = value.strip().upper().replace(" ", "")
    if not normalized:
        return None

    # Accept formats like 211, PC211, PC-211, VC20001, 245(A)(1)
    match = re.match(r"^(?:(PC|PEN|VC|VEH|HS|HSC|WIC)-?)?([0-9]+(?:\.[0-9]+)?(?:\([A-Z0-9]+\))*)$", normalized)
    if not match:
        return None

    family_token = match.group(1) or "PC"
    section = match.group(2)
    family_map = {"PEN": "PC", "PC": "PC", "VEH": "VC", "VC": "VC", "HS": "HS", "HSC": "HS", "WIC": "WIC"}
    family = family_map.get(family_token, "PC")
    return family, section


@lru_cache(maxsize=256)
def _fetch_official_california_section(code_family: str, section: str) -> dict | None:
    url = _code_statute_url(code_family=code_family, section=section)
    request = urllib_request.Request(url, headers={"User-Agent": "FirstLineCAD/1.0"})
    try:
        with urllib_request.urlopen(request, timeout=7) as response:
            content = response.read().decode("utf-8", errors="ignore")
    except (urllib_error.URLError, TimeoutError, ValueError):
        return None

    chapter_match = re.search(r"<h5[^>]*><b>(.*?)</b></h5>", content, re.IGNORECASE | re.DOTALL)
    section_match = re.search(
        r"<h6[^>]*><b>(.*?)</b></h6>\s*<p[^>]*>(.*?)</p>\s*(?:<i>\((.*?)\)</i>)?",
        content,
        re.IGNORECASE | re.DOTALL,
    )
    if not section_match:
        return None

    chapter = _clean_html_fragment(chapter_match.group(1)) if chapter_match else ""
    section_label = _clean_html_fragment(section_match.group(1))
    section_text = _clean_html_fragment(section_match.group(2))
    history = _clean_html_fragment(section_match.group(3) or "")
    return {
        "source": "California Legislative Information",
        "source_url": url,
        "chapter": chapter,
        "section_label": section_label,
        "section_text": section_text,
        "history": history,
        "retrieved_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }


def _code_match_result(entry: dict, query_tokens: list[str], normalized_query: str) -> tuple[int, list[str]]:
    haystack = " ".join(
        [
            entry["title"],
            entry["summary"],
            " ".join(entry.get("aliases", [])),
            " ".join(entry.get("keywords", [])),
            entry["section"],
            entry["code_key"],
        ]
    ).lower()
    score = 0
    reasons: list[str] = []

    if normalized_query:
        compact = normalized_query.replace(" ", "")
        section_compact = entry["section"].lower().replace(" ", "")
        code_compact = entry["code_key"].lower().replace("-", "")
        if compact in {section_compact, code_compact, f"pc{section_compact}", f"vc{section_compact}"}:
            score += 140
            reasons.append("Exact code match")
        if normalized_query in entry["title"].lower():
            score += 60
            reasons.append("Title match")
        if any(normalized_query == alias.lower() for alias in entry.get("aliases", [])):
            score += 70
            reasons.append("Exact alias match")
        if any(normalized_query in alias.lower() for alias in entry.get("aliases", [])):
            score += 30
            reasons.append("Alias phrase match")

    for token in query_tokens:
        if token in entry["title"].lower():
            score += 18
        if token in " ".join(entry.get("aliases", [])).lower():
            score += 14
        if token in " ".join(entry.get("keywords", [])).lower():
            score += 10
        if token in haystack:
            score += 5

    return score, reasons


def search_california_codes(query: str, sort_by: str = "relevance", limit: int = 20) -> dict:
    normalized_query = _normalize(query)
    query_tokens = _tokens(query)
    rows: list[dict] = []

    for entry in CALIFORNIA_CODE_INDEX:
        score, reasons = _code_match_result(entry, query_tokens, normalized_query)
        if normalized_query and score <= 0:
            continue
        rows.append(
            {
                **entry,
                "statute_url": _code_statute_url(entry["code_family"], entry["section"]),
                "library_source": "California Legislative Information",
                "match_score": score,
                "match_reasons": reasons,
            }
        )

    if not normalized_query:
        rows = [
            {
                **entry,
                "statute_url": _code_statute_url(entry["code_family"], entry["section"]),
                "library_source": "California Legislative Information",
                "match_score": 0,
                "match_reasons": [],
            }
            for entry in CALIFORNIA_CODE_INDEX
        ]

    # If no local library hit and query looks like a statute key, fetch from official source.
    if normalized_query and not rows:
        parsed = _parse_code_query(query)
        if parsed:
            family, section = parsed
            official = _fetch_official_california_section(code_family=family, section=section)
            if official and official.get("section_text"):
                chapter = official.get("chapter", "")
                derived_title = _derive_title_from_chapter(chapter, fallback=f"Section {section}")
                rows.append(
                    {
                        "code_key": f"{family}-{section}",
                        "code_family": family,
                        "section": section,
                        "title": derived_title,
                        "offense_level": "Statute",
                        "summary": official["section_text"],
                        "aliases": [],
                        "keywords": [],
                        "statute_url": official["source_url"],
                        "library_source": official["source"],
                        "match_score": 120,
                        "match_reasons": ["Official statute lookup"],
                    }
                )

    relevance_ranked = sorted(rows, key=lambda item: (item["match_score"], item["title"]), reverse=True)
    best_guess = relevance_ranked[0] if relevance_ranked else None
    confidence = round(min(0.98, 0.42 + ((best_guess or {}).get("match_score", 0) / 170)), 2) if best_guess else 0.0

    mode = sort_by.strip().lower()
    if mode == "numeric":
        ordered = sorted(relevance_ranked, key=lambda item: (item["code_family"], _numeric_key(item["section"])))
    elif mode == "alpha":
        ordered = sorted(relevance_ranked, key=lambda item: (item["title"], item["code_family"], _numeric_key(item["section"])))
    else:
        mode = "relevance"
        ordered = relevance_ranked

    capped = ordered[: max(1, min(limit, 100))]
    return {
        "query": query,
        "sort_by": mode,
        "result_count": len(capped),
        "best_guess": (
            {
                "code_key": best_guess["code_key"],
                "code_family": best_guess["code_family"],
                "section": best_guess["section"],
                "title": best_guess["title"],
                "summary": best_guess["summary"],
                "offense_level": best_guess["offense_level"],
                "statute_url": best_guess["statute_url"],
                "library_source": best_guess.get("library_source", "California Legislative Information"),
                "confidence": confidence,
                "reasons": best_guess.get("match_reasons", []),
            }
            if best_guess
            else None
        ),
        "results": capped,
    }


def get_california_code(code_key: str) -> dict | None:
    normalized = code_key.strip().lower().replace(" ", "").replace("-", "")
    for entry in CALIFORNIA_CODE_INDEX:
        entry_key = entry["code_key"].lower().replace("-", "")
        if normalized in {entry_key, entry["section"].lower().replace(" ", "")}:
            official = _fetch_official_california_section(code_family=entry["code_family"], section=entry["section"])
            return {
                **entry,
                "statute_url": _code_statute_url(entry["code_family"], entry["section"]),
                "library_source": "California Legislative Information",
                "official_source_connected": bool(official and official.get("section_text")),
                "official_source": official,
                "match_score": 0,
                "match_reasons": [],
            }

    parsed = _parse_code_query(code_key)
    if not parsed:
        return None
    family, section = parsed
    official = _fetch_official_california_section(code_family=family, section=section)
    if not official or not official.get("section_text"):
        return None

    chapter = official.get("chapter", "")
    derived_title = _derive_title_from_chapter(chapter, fallback=f"Section {section}")
    return {
        "code_key": f"{family}-{section}",
        "code_family": family,
        "section": section,
        "title": derived_title,
        "offense_level": "Statute",
        "summary": official["section_text"],
        "aliases": [],
        "keywords": [],
        "statute_url": official["source_url"],
        "library_source": official["source"],
        "official_source_connected": True,
        "official_source": official,
        "match_score": 0,
        "match_reasons": ["Official statute lookup"],
    }
    return None


def infer_primary_california_code(call_text: str, call_type: str | None = None) -> dict | None:
    ranked = search_california_codes(call_text, sort_by="relevance", limit=5)
    guess = ranked.get("best_guess")
    if guess and float(guess.get("confidence", 0.0)) >= 0.5:
        return guess

    fallback_map = {
        "domestic": "PC-273.5",
        "burglary": "PC-459",
        "traffic": "VC-20001",
        "medical": "PC-415",
    }
    fallback_key = fallback_map.get((call_type or "").strip().lower())
    if fallback_key:
        fallback = get_california_code(fallback_key)
        if fallback:
            return {
                "code_key": fallback["code_key"],
                "code_family": fallback["code_family"],
                "section": fallback["section"],
                "title": fallback["title"],
                "summary": fallback["summary"],
                "offense_level": fallback["offense_level"],
                "statute_url": fallback["statute_url"],
                "confidence": 0.41,
                "reasons": ["Call-type fallback mapping"],
            }
    return None


def _policy_match_result(entry: dict, query_tokens: list[str], normalized_query: str) -> tuple[int, str]:
    searchable = " ".join(
        [
            entry["section_id"],
            entry["title"],
            entry["summary"],
            " ".join(entry.get("tags", [])),
            entry["body"],
            entry.get("source_policy_title", ""),
            entry.get("source_policy_id", ""),
            entry.get("source_agency", ""),
        ]
    ).lower()
    score = 0
    if normalized_query:
        if normalized_query in entry["title"].lower():
            score += 60
        if normalized_query in " ".join(entry.get("tags", [])).lower():
            score += 45
        if normalized_query in entry["body"].lower():
            score += 35
        if normalized_query in entry["section_id"].lower():
            score += 70
    for token in query_tokens:
        if token in entry["title"].lower():
            score += 15
        if token in " ".join(entry.get("tags", [])).lower():
            score += 12
        if token in searchable:
            score += 4

    snippet = entry["summary"]
    if query_tokens:
        body_lower = entry["body"].lower()
        first_hit = min((body_lower.find(token) for token in query_tokens if token in body_lower), default=-1)
        if first_hit >= 0:
            start = max(0, first_hit - 70)
            end = min(len(entry["body"]), first_hit + 160)
            snippet = entry["body"][start:end].strip()
    return score, snippet


def search_policy_sections(query: str, sort_by: str = "relevance", limit: int = 20) -> dict:
    normalized_query = _normalize(query)
    query_tokens = _tokens(query)
    rows: list[dict] = []
    for entry in POLICY_SECTIONS:
        score, snippet = _policy_match_result(entry, query_tokens, normalized_query)
        if normalized_query and score <= 0:
            continue
        rows.append(
            {
                "section_id": entry["section_id"],
                "title": entry["title"],
                "category": entry["category"],
                "tags": entry["tags"],
                "summary": entry["summary"],
                "snippet": snippet,
                "source_agency": entry.get("source_agency"),
                "source_policy_id": entry.get("source_policy_id"),
                "source_policy_title": entry.get("source_policy_title"),
                "source_url": entry.get("source_url"),
                "match_score": score,
            }
        )

    if not normalized_query:
        rows = [
            {
                "section_id": entry["section_id"],
                "title": entry["title"],
                "category": entry["category"],
                "tags": entry["tags"],
                "summary": entry["summary"],
                "snippet": entry["summary"],
                "source_agency": entry.get("source_agency"),
                "source_policy_id": entry.get("source_policy_id"),
                "source_policy_title": entry.get("source_policy_title"),
                "source_url": entry.get("source_url"),
                "match_score": 0,
            }
            for entry in POLICY_SECTIONS
        ]

    relevance_ranked = sorted(rows, key=lambda item: (item["match_score"], item["section_id"]), reverse=True)
    mode = sort_by.strip().lower()
    if mode == "title":
        ordered = sorted(relevance_ranked, key=lambda item: (item["title"], item["section_id"]))
    elif mode == "section":
        ordered = sorted(relevance_ranked, key=lambda item: item["section_id"])
    else:
        mode = "relevance"
        ordered = relevance_ranked

    capped = ordered[: max(1, min(limit, 100))]
    return {
        "query": query,
        "sort_by": mode,
        "result_count": len(capped),
        "library_profile": POLICY_LIBRARY_PROFILE,
        "best_guess": capped[0] if capped else None,
        "results": capped,
    }


def get_policy_section(section_id: str) -> dict | None:
    target = section_id.strip().lower()
    for entry in POLICY_SECTIONS:
        if entry["section_id"].lower() == target:
            return {**entry, "library_profile": POLICY_LIBRARY_PROFILE}
    return None


def policy_catalog() -> dict:
    categories: dict[str, int] = {}
    for section in POLICY_SECTIONS:
        categories[section["category"]] = categories.get(section["category"], 0) + 1
    return {
        "library_profile": POLICY_LIBRARY_PROFILE,
        "total_sections": len(POLICY_SECTIONS),
        "categories": categories,
        "sections": [
            {
                "section_id": item["section_id"],
                "title": item["title"],
                "category": item["category"],
                "summary": item["summary"],
                "source_policy_id": item.get("source_policy_id"),
                "source_policy_title": item.get("source_policy_title"),
            }
            for item in sorted(POLICY_SECTIONS, key=lambda row: row["section_id"])
        ],
    }


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
            "crime_label": incident.get("crime_label"),
            "primary_code": incident.get("primary_code"),
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
