from fastapi import APIRouter

from app.modules.intake.router import router as intake_router
from app.modules.mapping.router import router as mapping_router
from app.modules.dispatch.router import router as dispatch_router
from app.modules.recommendation.router import router as recommendation_router
from app.modules.officer.router import router as officer_router
from app.modules.command.router import router as command_router
from app.modules.reporting.router import router as reporting_router
from app.modules.intel.router import router as intel_router
from app.modules.ai.router import router as ai_router

router = APIRouter(prefix="/api/v1")

router.include_router(intake_router, prefix="/intake", tags=["Smart Call Intake"])
router.include_router(mapping_router, prefix="/map", tags=["Unified Live Map"])
router.include_router(dispatch_router, prefix="/dispatch", tags=["Smart Dispatch AI"])
router.include_router(recommendation_router, prefix="/recommendation", tags=["Intelligent Unit Assignment"])
router.include_router(officer_router, prefix="/officer", tags=["Mobile Officer App"])
router.include_router(command_router, prefix="/command", tags=["Command Dashboard"])
router.include_router(reporting_router, prefix="/reporting", tags=["Integrated Reporting"])
router.include_router(intel_router, prefix="/intel", tags=["Records and Warrants Hub"])
router.include_router(ai_router, prefix="/ai", tags=["AI Operations Engine"])
