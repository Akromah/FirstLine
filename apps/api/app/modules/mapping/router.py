import asyncio
import json
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.modules.intake.service import advance_patrol_simulation
from app.modules.mapping.service import map_snapshot

router = APIRouter()


@router.get("/overview")
def get_map_overview() -> dict:
    advance_patrol_simulation()
    return map_snapshot()


@router.websocket("/stream")
async def stream_live_map(websocket: WebSocket) -> None:
    await websocket.accept()
    try:
        while True:
            advance_patrol_simulation()
            payload = {
                "type": "map_update",
                "time": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                "data": map_snapshot(),
            }
            await websocket.send_text(json.dumps(payload))
            await asyncio.sleep(2)
    except WebSocketDisconnect:
        return
