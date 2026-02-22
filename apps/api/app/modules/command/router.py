from fastapi import APIRouter

from app.modules.command.service import command_dashboard_snapshot, command_trends

router = APIRouter()


@router.get("/overview")
def get_command_overview() -> dict:
    return command_dashboard_snapshot()


@router.get("/trends")
def get_command_trends(periods: int = 8) -> dict:
    return command_trends(periods=periods)
