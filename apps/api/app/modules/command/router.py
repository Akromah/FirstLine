from fastapi import APIRouter

from app.modules.command.service import command_dashboard_snapshot

router = APIRouter()


@router.get("/overview")
def get_command_overview() -> dict:
    return command_dashboard_snapshot()
