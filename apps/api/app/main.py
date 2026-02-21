from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import router as api_router
from app.core.config import settings

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="Modern CAD backend for FirstLine.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check() -> dict:
    return {
        "ok": True,
        "service": settings.app_name,
        "environment": settings.app_env,
        "time": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }


app.include_router(api_router)
