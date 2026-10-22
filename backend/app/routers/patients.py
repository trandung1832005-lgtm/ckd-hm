import time


from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, EmailStr
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from ..db import get_db
from ..deps import audit, current_user, err, get_patient_for, get_predictor, require_roles
from ..ml.predictor import ModelNotReady, Predictor
from ..models import (ClinicalMeasurement, ClinicalNote, EgfrMeasurement, ModelVersion, PatientAssignment,
                      PatientProfile, PredictionResult, PredictionRun, User, utcnow)
from ..schemas import (EgfrOut, MeasurementIn, MeasurementOut, NoteIn, NoteOut, PatientCreate, PatientOut,
                       PatientUpdate, PredictIn, ResultOut, RunOut)

router = APIRouter(prefix="/api", tags=["patients"])
clinician_only = require_roles("clinician")


# ------------------------------------------------------------------ helpers
def run_to_out(run: PredictionRun) -> RunOut:
    hist = []
    if run.measurement_id and run.input_snapshot:
        snap = run.input_snapshot
        for m, k in ((0, "egfr_0m"), (6, "egfr_6m"), (12, "egfr_12m")):
            if snap.get(k) is not None:
                hist.append(EgfrOut(month=m, value=snap[k]))
    out = RunOut.model_validate(run)
    out.model_version = run.version_obj.version if run.version_obj else None
    out.results = [ResultOut.model_validate(r) for r in run.results]
    out.history = hist
    return out


def patient_out(db: Session, p: PatientProfile) -> PatientOut:
    out = PatientOut.model_validate(p)
    last = db.scalar(select(PredictionRun).where(PredictionRun.patient_id == p.id, PredictionRun.status == "success")
                     .order_by(PredictionRun.created_at.desc()).limit(1))
    if last:
        out.latest_cluster, out.latest_prediction_at = last.cluster, last.created_at
        out.latest_egfr = last.last_observed
    return out


def visible_patients_query(user: User):
    q = select(PatientProfile)
    if user.role == "clinician":
        q = q.join(PatientAssignment, PatientAssignment.patient_id == PatientProfile.id).where(
            PatientAssignment.clinician_id == user.id)
    elif user.role == "patient":
        q = q.where(PatientProfile.user_id == user.id)
    else:  # admin không đọc dữ liệu lâm sàng
        raise err(403, "Admin không có quyền xem hồ sơ bệnh nhân", "forbidden")
    return q


# ------------------------------------------------------------------ hồ sơ
@router.get("/patients")
def list_patients(q: str | None = None, cluster: str | None = None, page: int = Query(1, ge=1),
                  page_size: int = Query(20, ge=1, le=100), user: User = Depends(current_user),
                  db: Session = Depends(get_db)):
    base = visible_patients_query(user)
    if q:
        like = f"%{q.strip()}%"
        base = base.where(or_(PatientProfile.code.ilike(like), PatientProfile.linked_email.ilike(like)))
    if cluster:
        last_cluster = (select(PredictionRun.cluster).where(PredictionRun.patient_id == PatientProfile.id,
                                                            PredictionRun.status == "success")
                        .order_by(PredictionRun.created_at.desc()).limit(1).scalar_subquery())
        base = base.where(last_cluster == cluster)
    total = db.scalar(select(func.count()).select_from(base.subquery()))
    rows = db.scalars(base.order_by(PatientProfile.updated_at.desc()).offset((page - 1) * page_size)
                      .limit(page_size)).all()
    return {"items": [patient_out(db, p) for p in rows], "total": total, "page": page, "page_size": page_size}


@router.post("/patients", response_model=PatientOut, status_code=201)
def create_patient(body: PatientCreate, request: Request, user: User = Depends(clinician_only),
                   db: Session = Depends(get_db)):
    email = body.linked_email.lower() if body.linked_email else None
    p = PatientProfile(code="TMP", gender=body.gender, etiology=body.etiology, hypertension=body.hypertension,
                       diabetes=body.diabetes, cvd=body.cvd, is_demo=body.is_demo, created_by=user.id,
                       linked_email=email)
    if email:
        acct = db.scalar(select(User).where(User.email == email, User.role == "patient"))
        if acct and not db.scalar(select(PatientProfile.id).where(PatientProfile.user_id == acct.id)):
            p.user_id = acct.id
    db.add(p)
    db.flush()
    p.code = f"BN{p.id:06d}"
    db.add(PatientAssignment(patient_id=p.id, clinician_id=user.id))
    audit(db, user, "patient_create", "patient", p.id, request)
    db.commit()
    return patient_out(db, p)


@router.get("/patients/{patient_id}", response_model=PatientOut)
def get_patient(patient_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return patient_out(db, get_patient_for(db, user, patient_id))


@router.patch("/patients/{patient_id}", response_model=PatientOut)
def update_patient(patient_id: int, body: PatientUpdate, request: Request, user: User = Depends(clinician_only),
                   db: Session = Depends(get_db)):
    p = get_patient_for(db, user, patient_id, write=True)
    data = body.model_dump(exclude_unset=True)
    if "linked_email" in data:
        data["linked_email"] = data["linked_email"].lower() if data["linked_email"] else None
    for k, v in data.items():
        setattr(p, k, v)
    audit(db, user, "patient_update", "patient", p.id, request, f"fields={','.join(data)}")
    db.commit()
    return patient_out(db, p)


class ShareIn(BaseModel):
    clinician_email: EmailStr


@router.post("/patients/{patient_id}/assignments", status_code=201)
def share_patient(patient_id: int, body: ShareIn, request: Request, user: User = Depends(clinician_only),
                  db: Session = Depends(get_db)):
    """Cấp quyền truy cập hồ sơ cho nhân viên y tế khác (đã được duyệt)."""
    p = get_patient_for(db, user, patient_id, write=True)
    other = db.scalar(select(User).where(User.email == body.clinician_email.lower(), User.role == "clinician",
                                         User.status == "active"))
    if other is None:
        raise err(404, "Không tìm thấy nhân viên y tế với email này", "not_found")
    if not db.scalar(select(PatientAssignment.id).where(PatientAssignment.patient_id == p.id,
                                                        PatientAssignment.clinician_id == other.id)):
        db.add(PatientAssignment(patient_id=p.id, clinician_id=other.id))
        audit(db, user, "patient_share", "patient", p.id, request, f"to_user={other.id}")
        db.commit()
    return {"ok": True}


# ------------------------------------------------------------------ đo lường
@router.post("/patients/{patient_id}/measurements", response_model=MeasurementOut, status_code=201)
def add_measurement(patient_id: int, body: MeasurementIn, request: Request, user: User = Depends(clinician_only),
                    db: Session = Depends(get_db)):
    p = get_patient_for(db, user, patient_id, write=True)
    m = ClinicalMeasurement(patient_id=p.id, recorded_on=body.recorded_on, age_years=body.age_years, sbp=body.sbp,
                            albumin=body.albumin, upcr=body.upcr, created_by=user.id)
    m.egfr = [EgfrMeasurement(patient_id=p.id, month=e.month, value=e.value, measured_on=e.measured_on)
              for e in sorted(body.egfr, key=lambda e: e.month)]
    db.add(m)
    p.updated_at = utcnow()
    db.flush()
    audit(db, user, "measurement_create", "measurement", m.id, request)
    db.commit()
    return m


@router.get("/patients/{patient_id}/measurements", response_model=list[MeasurementOut])
def list_measurements(patient_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = get_patient_for(db, user, patient_id)
    return db.scalars(select(ClinicalMeasurement).options(selectinload(ClinicalMeasurement.egfr))
                      .where(ClinicalMeasurement.patient_id == p.id)
                      .order_by(ClinicalMeasurement.recorded_on.desc(), ClinicalMeasurement.id.desc())).all()


# ------------------------------------------------------------------ dự đoán
def _active_version(db: Session) -> ModelVersion | None:
    return db.scalar(select(ModelVersion).where(ModelVersion.status == "active").order_by(ModelVersion.id.desc()))


@router.post("/patients/{patient_id}/predict", response_model=RunOut, status_code=201)
def predict(patient_id: int, body: PredictIn, request: Request, user: User = Depends(clinician_only),
            db: Session = Depends(get_db), predictor: Predictor = Depends(get_predictor)):
    p = get_patient_for(db, user, patient_id, write=True)
    m = db.scalar(select(ClinicalMeasurement).options(selectinload(ClinicalMeasurement.egfr))
                  .where(ClinicalMeasurement.id == body.measurement_id, ClinicalMeasurement.patient_id == p.id))
    if m is None:
        raise err(404, "Không tìm thấy bộ dữ liệu đo của bệnh nhân này", "not_found")
    by_month = {e.month: e.value for e in m.egfr}
    raw = {"age": m.age_years, "gender": p.gender, "hypertension": p.hypertension, "diabetes": p.diabetes,
           "cvd": p.cvd, "etiology": p.etiology, "upcr": m.upcr, "albumin": m.albumin, "sbp": m.sbp,
           "egfr_0m": by_month.get(0), "egfr_6m": by_month.get(6), "egfr_12m": by_month.get(12)}
    version = _active_version(db)
    run = PredictionRun(patient_id=p.id, measurement_id=m.id, requested_by=user.id, input_snapshot=raw,
                        model_version_id=version.id if version else None, status="failed")
    t0 = time.perf_counter()
    try:
        if not predictor.ready:
            raise ModelNotReady(predictor.error or "Mô hình chưa sẵn sàng")
        out = predictor.predict(raw)
    except ModelNotReady as exc:
        run.error, run.latency_ms = str(exc)[:500], int((time.perf_counter() - t0) * 1000)
        db.add(run)
        audit(db, user, "predict_failed", "patient", p.id, request, "model_not_ready")
        db.commit()
        raise err(503, "Mô hình AI chưa sẵn sàng. Không thể tạo dự đoán.", "model_not_ready")
    except ValueError as exc:
        run.error = str(exc)[:500]
        db.add(run)
        db.commit()
        raise err(422, f"Dữ liệu đầu vào không hợp lệ: {exc}", "invalid_input")
    run.status, run.latency_ms = "success", int((time.perf_counter() - t0) * 1000)
    run.cluster, run.slope_per_year, run.total_change = out.cluster, out.slope_per_year, out.total_change
    run.risk_score, run.last_observed, run.stage_36m = out.risk_score, out.last_observed, out.stage_36m
    run.n_visits, run.confidence, run.warnings = out.n_visits, out.confidence, out.warnings
    run.results = [PredictionResult(month=mo, egfr_pred=v, stage=out.stages[mo]) for mo, v in out.predicted.items()]
    db.add(run)
    p.updated_at = utcnow()
    db.flush()
    audit(db, user, "predict", "prediction", run.id, request, f"patient={p.id} latency={run.latency_ms}ms")
    db.commit()
    db.refresh(run)
    return run_to_out(run)


@router.get("/patients/{patient_id}/predictions", response_model=list[RunOut])
def list_predictions(patient_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = get_patient_for(db, user, patient_id)
    runs = db.scalars(select(PredictionRun).options(selectinload(PredictionRun.results),
                                                    selectinload(PredictionRun.version_obj))
                      .where(PredictionRun.patient_id == p.id, PredictionRun.status == "success")
                      .order_by(PredictionRun.created_at.desc())).all()
    return [run_to_out(r) for r in runs]


@router.get("/predictions/{run_id}", response_model=RunOut)
def get_prediction(run_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    run = db.get(PredictionRun, run_id)
    if run is None:
        raise err(404, "Không tìm thấy lần dự đoán", "not_found")
    get_patient_for(db, user, run.patient_id)  # kiểm tra quyền trên hồ sơ (404 nếu không có quyền)
    return run_to_out(run)


# ------------------------------------------------------------------ ghi chú / kế hoạch
def _note_out(n: ClinicalNote) -> NoteOut:
    o = NoteOut.model_validate(n)
    o.author_name = n.author.full_name if n.author else None
    return o


@router.get("/patients/{patient_id}/notes", response_model=list[NoteOut])
def list_notes(patient_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = get_patient_for(db, user, patient_id)
    q = select(ClinicalNote).where(ClinicalNote.patient_id == p.id)
    if user.role == "patient":
        q = q.where(ClinicalNote.visible_to_patient.is_(True))
    return [_note_out(n) for n in db.scalars(q.order_by(ClinicalNote.created_at.desc())).all()]


@router.post("/patients/{patient_id}/notes", response_model=NoteOut, status_code=201)
def add_note(patient_id: int, body: NoteIn, request: Request, user: User = Depends(clinician_only),
             db: Session = Depends(get_db)):
    p = get_patient_for(db, user, patient_id, write=True)
    if body.kind == "follow_up" and body.due_date is None:
        raise err(422, "Lịch tái khám cần có ngày hẹn", "invalid_input")
    n = ClinicalNote(patient_id=p.id, author_id=user.id, **body.model_dump())
    db.add(n)
    db.flush()
    audit(db, user, "note_create", "note", n.id, request, f"kind={n.kind}")  # không ghi nội dung ghi chú
    db.commit()
    db.refresh(n)
    return _note_out(n)
