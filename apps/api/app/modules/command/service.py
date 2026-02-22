from app.core.state import state
from app.modules.dispatch.service import build_priority_radar, build_unit_readiness_board
from app.modules.reporting.service import get_reporting_metrics, get_supervisor_review_queue


def command_dashboard_snapshot() -> dict:
    return state.build_command_snapshot()


def command_trends(periods: int = 8) -> dict:
    return state.get_command_trends(periods=periods)


def executive_brief(periods: int = 8) -> dict:
    return {
        "generated_at": state.build_command_snapshot()["generated_at"],
        "overview": command_dashboard_snapshot(),
        "trends": command_trends(periods=periods),
        "unit_readiness": build_unit_readiness_board(),
        "priority_radar": build_priority_radar(limit=6),
        "reporting_metrics": get_reporting_metrics(),
        "review_queue": get_supervisor_review_queue(),
    }
