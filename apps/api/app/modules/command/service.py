from app.core.state import state


def command_dashboard_snapshot() -> dict:
    return state.build_command_snapshot()
