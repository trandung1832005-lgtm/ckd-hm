"""Health, nội dung giáo dục và dashboard theo vai trò."""
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import current_user, get_predictor
from ..ml.predictor import Predictor
from ..models import (ClinicalNote, PatientAssignment, PatientProfile, PredictionRun, User)

router = APIRouter(prefix="/api", tags=["misc"])
DATA = Path(__file__).resolve().parents[1] / "data"


@router.get("/health")
def health(request: Request, db: Session = Depends(get_db), predictor: Predictor = Depends(get_predictor)):
    try:
        db.execute(text("SELECT 1"))
        db_ok = True
    except Exception:  # noqa: BLE001
        db_ok = False
    return {"status": "ok" if db_ok and predictor.ready else "degraded", "database": db_ok,
            "model_ready": predictor.ready, "model_error": predictor.error}


@router.get("/education")
def education():
    return json.loads((DATA / "education.json").read_text(encoding="utf-8"))


def _cluster_counts(db: Session, patient_ids_q) -> dict[str, int]:
    """Nhóm của lần dự đoán mới nhất mỗi bệnh nhân."""
    latest = (select(PredictionRun.patient_id, func.max(PredictionRun.id).label("rid"))
              .where(PredictionRun.status == "success", PredictionRun.patient_id.in_(patient_ids_q))
              .group_by(PredictionRun.patient_id).subquery())
    rows = db.execute(select(PredictionRun.cluster, func.count()).join(latest, PredictionRun.id == latest.c.rid)
                      .group_by(PredictionRun.cluster)).all()
    return {c: n for c, n in rows}


@router.get("/dashboard")
def dashboard(user: User = Depends(current_user), db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    if user.role == "clinician":
        pids = select(PatientAssignment.patient_id).where(PatientAssignment.clinician_id == user.id)
        total = db.scalar(select(func.count()).select_from(pids.subquery()))
        week = db.scalar(select(func.count(PredictionRun.id)).where(
            PredictionRun.patient_id.in_(pids), PredictionRun.status == "success",
            PredictionRun.created_at >= now - timedelta(days=7)))
        latest = (select(func.max(PredictionRun.id)).where(PredictionRun.status == "success",
                                                           PredictionRun.patient_id.in_(pids))
                  .group_by(PredictionRun.patient_id))
        review = db.scalars(select(PredictionRun).where(PredictionRun.id.in_(latest)).where(
            (PredictionRun.cluster == "Chuyển biến xấu") | (PredictionRun.stage_36m.in_(["G4", "G5"])))
            .order_by(PredictionRun.created_at.desc()).limit(10)).all()
        recent = db.scalars(select(PatientProfile).where(PatientProfile.id.in_(pids))
                            .order_by(PatientProfile.updated_at.desc()).limit(5)).all()
        return {"role": "clinician", "patients": total, "predictions_7d": week,
                "cluster_counts": _cluster_counts(db, pids),
                "needs_review": [{"patient_id": r.patient_id, "code": db.get(PatientProfile, r.patient_id).code,
                                  "cluster": r.cluster, "stage_36m": r.stage_36m, "at": r.created_at} for r in review],
                "recent_patients": [{"id": p.id, "code": p.code, "updated_at": p.updated_at} for p in recent]}
    if user.role == "patient":
        prof = db.scalar(select(PatientProfile).where(PatientProfile.user_id == user.id))
        if prof is None:
            return {"role": "patient", "profile": None}
        run = db.scalar(select(PredictionRun).where(PredictionRun.patient_id == prof.id,
                                                    PredictionRun.status == "success")
                        .order_by(PredictionRun.created_at.desc()).limit(1))
        appts = db.scalars(select(ClinicalNote).where(
            ClinicalNote.patient_id == prof.id, ClinicalNote.kind == "follow_up",
            ClinicalNote.visible_to_patient.is_(True), ClinicalNote.due_date >= now.date())
            .order_by(ClinicalNote.due_date).limit(5)).all()
        return {"role": "patient", "profile": {"id": prof.id, "code": prof.code},
                "latest_run_id": run.id if run else None, "latest_egfr": run.last_observed if run else None,
                "cluster": run.cluster if run else None, "stage_36m": run.stage_36m if run else None,
                "appointments": [{"due_date": a.due_date, "body": a.body} for a in appts]}
    # admin
    users = dict(db.execute(select(User.role, func.count()).group_by(User.role)).all())
    runs_ok = db.scalar(select(func.count(PredictionRun.id)).where(PredictionRun.status == "success"))
    runs_fail = db.scalar(select(func.count(PredictionRun.id)).where(PredictionRun.status == "failed"))
    day = db.scalar(select(func.count(PredictionRun.id)).where(PredictionRun.created_at >= now - timedelta(days=1)))
    lat = db.scalar(select(func.avg(PredictionRun.latency_ms)).where(PredictionRun.status == "success"))
    pending = db.scalar(select(func.count(User.id)).where(User.status == "pending"))
    return {"role": "admin", "users_by_role": users, "pending_users": pending,
            "patients": db.scalar(select(func.count(PatientProfile.id))), "predictions_ok": runs_ok,
            "predictions_failed": runs_fail, "predictions_24h": day, "avg_latency_ms": round(lat) if lat else None}
