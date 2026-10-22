import csv
import io
import json
from pathlib import Path

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import audit, err, get_predictor, require_roles
from ..ml.predictor import Predictor
from ..models import AuditLog, ModelVersion, PredictionRun, User
from ..schemas import AdminUserUpdate, UserOut

router = APIRouter(prefix="/api/admin", tags=["admin"])
admin_only = require_roles("admin")
DATA = Path(__file__).resolve().parents[1] / "data"


@router.get("/users")
def list_users(q: str | None = None, role: str | None = None, status: str | None = None,
               page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
               _: User = Depends(admin_only), db: Session = Depends(get_db)):
    base = select(User)
    if q:
        base = base.where(User.email.ilike(f"%{q}%") | User.full_name.ilike(f"%{q}%"))
    if role:
        base = base.where(User.role == role)
    if status:
        base = base.where(User.status == status)
    total = db.scalar(select(func.count()).select_from(base.subquery()))
    rows = db.scalars(base.order_by(User.created_at.desc()).offset((page - 1) * page_size).limit(page_size)).all()
    return {"items": [UserOut.model_validate(u) for u in rows], "total": total, "page": page, "page_size": page_size}


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(user_id: int, body: AdminUserUpdate, request: Request, admin: User = Depends(admin_only),
                db: Session = Depends(get_db)):
    u = db.get(User, user_id)
    if u is None:
        raise err(404, "Không tìm thấy tài khoản", "not_found")
    if u.id == admin.id:
        raise err(400, "Không thể tự thay đổi vai trò/trạng thái của chính mình", "invalid_input")
    changes = []
    if body.role and body.role != u.role:
        u.role = body.role
        changes.append(f"role={body.role}")
    if body.status and body.status != u.status:
        u.status = body.status
        changes.append(f"status={body.status}")
    if changes:
        u.token_version += 1  # buộc đăng nhập lại để vai trò/trạng thái mới có hiệu lực
        audit(db, admin, "user_update", "user", u.id, request, ",".join(changes))
        db.commit()
    return u


def _evaluation() -> dict:
    computed = json.loads((DATA / "evaluation_computed.json").read_text(encoding="utf-8"))
    reported = json.loads((DATA / "evaluation_reported.json").read_text(encoding="utf-8"))
    project = json.loads((DATA / "evaluation_project.json").read_text(encoding="utf-8"))
    return {"deployed": computed, "reported": reported, "project": project,
            "dataset": {"Train": 796, "Validation": 171, "Test": 171,
                        "note": "Số bệnh nhân mỗi tập (train.xlsx / val.xlsx / test.xlsx)."},
            "scope_note": "Đây là chỉ số ĐÁNH GIÁ OFFLINE trên các tập Train/Validation/Test của nghiên cứu. "
                          "Không phải hiệu năng vận hành trực tuyến và không được tính lại từ dữ liệu bệnh nhân đang dùng hệ thống."}


@router.get("/model-evaluation")
def model_evaluation(_: User = Depends(admin_only)):
    return _evaluation()


@router.get("/model-evaluation/export")
def export_evaluation(request: Request, admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    ev = _evaluation()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["nguon", "tap", "MAE", "RMSE", "R2", "within5", "within10"])
    for tap, r in ev["deployed"]["sets"].items():
        g = r["regression"]
        w.writerow(["trong_so_dang_trien_khai", tap, round(g["mae"], 3), round(g["rmse"], 3), round(g["r2"], 3),
                    round(g["within5"], 3), round(g["within10"], 3)])
    for tap, g in ev["reported"]["regression"].items():
        w.writerow(["bao_cao", tap, g["mae"], g["rmse"], g["r2"], g["within5"], g["within10"]])
    audit(db, admin, "export_evaluation", "model", None, request)
    db.commit()
    return StreamingResponse(iter(["﻿" + buf.getvalue()]), media_type="text/csv; charset=utf-8",
                             headers={"Content-Disposition": "attachment; filename=model_evaluation.csv"})


@router.get("/model-versions")
def model_versions(_: User = Depends(admin_only), db: Session = Depends(get_db),
                   predictor: Predictor = Depends(get_predictor)):
    rows = db.scalars(select(ModelVersion).order_by(ModelVersion.id.desc())).all()
    return {"api": {"model_ready": predictor.ready, "error": predictor.error, "info": predictor.version_info},
            "items": [{"id": v.id, "name": v.name, "version": v.version, "status": v.status,
                       "description": v.description, "weights_sha256": v.weights_sha256, "trained_on": v.trained_on,
                       "deployed_at": v.deployed_at, "created_at": v.created_at} for v in rows]}


@router.get("/prediction-logs")
def prediction_logs(status: str | None = None, page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
                    _: User = Depends(admin_only), db: Session = Depends(get_db)):
    """Nhật ký gọi API dự đoán: chỉ siêu dữ liệu vận hành, không có dữ liệu y tế."""
    base = select(PredictionRun)
    if status:
        base = base.where(PredictionRun.status == status)
    total = db.scalar(select(func.count()).select_from(base.subquery()))
    rows = db.scalars(base.order_by(PredictionRun.id.desc()).offset((page - 1) * page_size).limit(page_size)).all()
    return {"items": [{"id": r.id, "status": r.status, "error": r.error, "latency_ms": r.latency_ms,
                       "model_version": r.version_obj.version if r.version_obj else None,
                       "created_at": r.created_at} for r in rows], "total": total, "page": page, "page_size": page_size}


@router.get("/audit-logs")
def audit_logs(action: str | None = None, page: int = Query(1, ge=1), page_size: int = Query(30, ge=1, le=100),
               _: User = Depends(admin_only), db: Session = Depends(get_db)):
    base = select(AuditLog)
    if action:
        base = base.where(AuditLog.action == action)
    total = db.scalar(select(func.count()).select_from(base.subquery()))
    rows = db.scalars(base.order_by(AuditLog.id.desc()).offset((page - 1) * page_size).limit(page_size)).all()
    return {"items": [{"id": a.id, "user": a.user.email if a.user else None, "action": a.action, "entity": a.entity,
                       "entity_id": a.entity_id, "ip": a.ip, "detail": a.detail, "created_at": a.created_at}
                      for a in rows], "total": total, "page": page, "page_size": page_size}
