from app.core.state import state


def command_dashboard_snapshot() -> dict:
    return state.build_command_snapshot()


def command_trends(periods: int = 8) -> dict:
    return state.get_command_trends(periods=periods)
