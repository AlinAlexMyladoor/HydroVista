"""Citizen reports endpoints."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.models.models import CitizenReport
from app.schemas.schemas import ReportCreate, ReportResponse

log = structlog.get_logger(__name__)
router = APIRouter()

DISCLAIMER = (
    "Unverified community report. Not a confirmed official observation. "
    "FloodLens AI does not validate the accuracy of citizen submissions."
)


@router.post("/reports", response_model=ReportResponse)
async def submit_report(
    report: ReportCreate,
    db: AsyncSession = Depends(get_db),
):
    """
    Submit an unverified community flood report.
    All submissions are clearly labelled as unverified.
    """
    try:
        new_report = CitizenReport(
            id=uuid.uuid4(),
            submitted_at=datetime.now(timezone.utc),
            lat=report.lat,
            lon=report.lon,
            description=report.description,
            reported_depth_cm=report.reported_depth_cm,
            reporter_name=report.reporter_name,
            status="unverified",
        )
        db.add(new_report)
        await db.commit()

        log.info("report.submitted", id=str(new_report.id), lat=report.lat, lon=report.lon)

        return ReportResponse(
            id=new_report.id,
            submitted_at=new_report.submitted_at,
            lat=new_report.lat,
            lon=new_report.lon,
            description=new_report.description,
            reported_depth_cm=new_report.reported_depth_cm,
            reporter_name=new_report.reporter_name,
            status=new_report.status,
            disclaimer=DISCLAIMER,
        )
    except Exception as exc:
        try:
            await db.rollback()
        except Exception as rollback_exc:
            log.error("report.rollback_failed", error=str(rollback_exc))
        log.error("report.submit_failed", error=str(exc))
        raise HTTPException(
            status_code=503,
            detail={
                "error": "report_submission_failed",
                "message": "Could not save report. Database may be unavailable.",
            },
        )


@router.get("/reports")
async def list_reports(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """List unverified community reports."""
    try:
        result = await db.execute(
            select(CitizenReport).order_by(CitizenReport.submitted_at.desc())
        )
        all_reports = result.scalars().all()
        total = len(all_reports)
        start = (page - 1) * page_size
        page_items = all_reports[start : start + page_size]

        return {
            "items": [
                {
                    "id": str(r.id),
                    "submitted_at": r.submitted_at.isoformat(),
                    "lat": r.lat,
                    "lon": r.lon,
                    "description": r.description,
                    "reported_depth_cm": r.reported_depth_cm,
                    "reporter_name": r.reporter_name,
                    "status": r.status,
                    "disclaimer": DISCLAIMER,
                }
                for r in page_items
            ],
            "meta": {
                "total": total,
                "page": page,
                "page_size": page_size,
                "pages": (total + page_size - 1) // page_size,
            },
            "disclaimer": DISCLAIMER,
        }
    except Exception as exc:
        log.error("reports.list_failed", error=str(exc))
        raise HTTPException(status_code=503, detail={"error": "reports_unavailable", "message": "Reports are temporarily unavailable."}) from exc
