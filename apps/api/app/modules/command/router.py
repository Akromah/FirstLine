from fastapi import APIRouter

from app.modules.command.service import command_dashboard_snapshot, command_trends, executive_brief

router = APIRouter()


@router.get("/overview")
def get_command_overview() -> dict:
    return command_dashboard_snapshot()


@router.get("/trends")
def get_command_trends(periods: int = 8) -> dict:
    return command_trends(periods=periods)


@router.get("/executive-brief")
def get_executive_brief(periods: int = 8) -> dict:
    return executive_brief(periods=periods)
