from app.core.state import state


def lookup_public_safety_records(query: str) -> dict:
    payload = state.search_public_safety_records(query)
    payload["query"] = query
    payload["sources"] = ["Records", "Firearms Registry", "Warrant Index"]
    return payload


def get_person_profile(person_id: str) -> dict | None:
    return state.get_person_public_safety_profile(person_id)
