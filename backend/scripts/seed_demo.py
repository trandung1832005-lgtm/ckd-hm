"""Tạo tài khoản + bệnh nhân MINH HOẠ để thử hệ thống. Dữ liệu hoàn toàn tổng hợp, được gắn cờ is_demo.

Mật khẩu KHÔNG hard-code: đặt biến môi trường DEMO_PASSWORD (đáp ứng chính sách mật khẩu).
    DEMO_PASSWORD='...' python scripts/seed_demo.py
Tạo: doctor.demo@example.org (clinician), patient.demo@example.org (patient) + 3 hồ sơ minh hoạ.
Không tạo Admin (dùng `python -m app.cli create-admin`). Không chạy trên môi trường production.
"""
import os
import sys as _sys

if hasattr(_sys.stdout, "reconfigure"):
    _sys.stdout.reconfigure(encoding="utf-8", errors="replace")
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sqlalchemy import select  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.db import Base, SessionLocal, engine  # noqa: E402
from app.ml.predictor import Predictor  # noqa: E402
from app.models import (ClinicalMeasurement, ModelVersion, EgfrMeasurement, PatientAssignment, PatientProfile,  # noqa: E402
                        PredictionResult, PredictionRun, User)
from app.schemas import _check_password  # noqa: E402
from app.security import hash_password  # noqa: E402

s = get_settings()
if s.environment == "production":
    sys.exit("Từ chối chạy seed demo ở production.")
pw = os.environ.get("DEMO_PASSWORD")
if not pw:
    sys.exit("Đặt DEMO_PASSWORD trước khi chạy.")
_check_password(pw)
if s.sqlalchemy_url.startswith("sqlite"):
    Base.metadata.create_all(engine)

CASES = [  # (gender, etiology, htn, dm, cvd, age, sbp, alb, upcr, egfr0, egfr6, egfr12)
    (1, 2, True, False, False, 66, 142, 3.9, 0.8, 52.0, 50.5, 49.8),
    (2, 3, True, True, True, 72, 158, 3.1, 2.4, 38.0, 33.0, 28.5),
    (1, 1, False, False, False, 54, 126, 4.3, 0.2, 78.0, 79.5, None),
]

pred = Predictor(s.model_asset_dir)
with SessionLocal() as db:
    def user(email, name, role):
        u = db.scalar(select(User).where(User.email == email))
        if not u:
            u = User(email=email, full_name=name, password_hash=hash_password(pw), role=role, status="active")
            db.add(u)
            db.flush()
        return u

    doc = user("doctor.demo@example.org", "Bác sĩ Minh hoạ", "clinician")
    pat = user("patient.demo@example.org", "Bệnh nhân Minh hoạ", "patient")
    for i, (g, e, h, d, c, age, sbp, alb, upcr, e0, e6, e12) in enumerate(CASES):
        p = PatientProfile(code="TMP", gender=g, etiology=e, hypertension=h, diabetes=d, cvd=c, is_demo=True,
                           created_by=doc.id, linked_email="patient.demo@example.org" if i == 0 else None,
                           user_id=pat.id if i == 0 else None)
        db.add(p)
        db.flush()
        p.code = f"BN{p.id:06d}"
        db.add(PatientAssignment(patient_id=p.id, clinician_id=doc.id))
        m = ClinicalMeasurement(patient_id=p.id, recorded_on=date(2026, 1, 15), age_years=age, sbp=sbp, albumin=alb,
                                upcr=upcr, created_by=doc.id)
        m.egfr = [EgfrMeasurement(patient_id=p.id, month=mo, value=v) for mo, v in ((0, e0), (6, e6), (12, e12))
                  if v is not None]
        db.add(m)
        db.flush()
        if pred.ready:
            raw = dict(age=age, gender=g, hypertension=h, diabetes=d, cvd=c, etiology=e, upcr=upcr, albumin=alb,
                       sbp=sbp, egfr_0m=e0, egfr_6m=e6, egfr_12m=e12)
            out = pred.predict(raw)
            mv = db.scalar(select(ModelVersion).where(ModelVersion.status == "active"))
            run = PredictionRun(patient_id=p.id, model_version_id=mv.id if mv else None, measurement_id=m.id, requested_by=doc.id, status="success",
                                input_snapshot=raw, cluster=out.cluster, slope_per_year=out.slope_per_year,
                                total_change=out.total_change, risk_score=out.risk_score,
                                last_observed=out.last_observed, stage_36m=out.stage_36m, n_visits=out.n_visits,
                                confidence=out.confidence, warnings=out.warnings)
            run.results = [PredictionResult(month=mo, egfr_pred=v, stage=out.stages[mo]) for mo, v in out.predicted.items()]
            db.add(run)
    db.commit()
print("Đã tạo dữ liệu minh hoạ (is_demo=true).")
