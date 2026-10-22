"""Lược đồ cơ sở dữ liệu (PostgreSQL khi triển khai; SQLite chỉ dùng cho dev/test)."""
from datetime import date, datetime, timezone

from sqlalchemy import (JSON, Boolean, CheckConstraint, Date, DateTime, Float, ForeignKey, Index, Integer, String,
                        Text, UniqueConstraint)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("role IN ('admin','clinician','patient')", name="ck_users_role"),
        CheckConstraint("status IN ('active','pending','disabled')", name="ck_users_status"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(100))
    role: Mapped[str] = mapped_column(String(16))
    status: Mapped[str] = mapped_column(String(16), default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # tăng khi đổi mật khẩu / bị khoá -> vô hiệu hoá token cũ
    token_version: Mapped[int] = mapped_column(Integer, default=0)


class PatientProfile(Base):
    __tablename__ = "patient_profiles"
    __table_args__ = (
        CheckConstraint("gender IN (1,2)", name="ck_patient_gender"),
        CheckConstraint("etiology BETWEEN 1 AND 4", name="ck_patient_etiology"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True, index=True)  # mã nội bộ, không phải định danh thật
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), unique=True)
    linked_email: Mapped[str | None] = mapped_column(String(254), index=True)
    gender: Mapped[int] = mapped_column(Integer)          # mã hoá gốc của bộ dữ liệu: 1 | 2
    etiology: Mapped[int] = mapped_column(Integer)        # nhóm nguyên nhân 1..4 (mã hoá gốc)
    hypertension: Mapped[bool] = mapped_column(Boolean)
    diabetes: Mapped[bool] = mapped_column(Boolean)
    cvd: Mapped[bool] = mapped_column(Boolean)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)  # dữ liệu minh hoạ phải được đánh dấu
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    user: Mapped["User | None"] = relationship(foreign_keys=[user_id])


class PatientAssignment(Base):
    __tablename__ = "patient_assignments"
    __table_args__ = (UniqueConstraint("patient_id", "clinician_id", name="uq_assignment"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patient_profiles.id", ondelete="CASCADE"), index=True)
    clinician_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ClinicalMeasurement(Base):
    """Một bộ dữ liệu lâm sàng dùng làm đầu vào một lần dự đoán (cùng các mốc eGFR đi kèm)."""
    __tablename__ = "clinical_measurements"
    id: Mapped[int] = mapped_column(primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patient_profiles.id", ondelete="CASCADE"), index=True)
    recorded_on: Mapped[date] = mapped_column(Date)
    age_years: Mapped[float] = mapped_column(Float)
    sbp: Mapped[float] = mapped_column(Float)              # mmHg
    albumin: Mapped[float] = mapped_column(Float)          # g/dL
    upcr: Mapped[float | None] = mapped_column(Float)      # mg/mg (g/g); None = chưa đo
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    egfr: Mapped[list["EgfrMeasurement"]] = relationship(back_populates="measurement", cascade="all, delete-orphan",
                                                         order_by="EgfrMeasurement.month")


class EgfrMeasurement(Base):
    __tablename__ = "egfr_measurements"
    __table_args__ = (
        UniqueConstraint("measurement_id", "month", name="uq_egfr_set_month"),
        CheckConstraint("month IN (0,6,12)", name="ck_egfr_month"),
        CheckConstraint("value > 0", name="ck_egfr_value"),
        Index("ix_egfr_patient", "patient_id"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patient_profiles.id", ondelete="CASCADE"))
    measurement_id: Mapped[int] = mapped_column(ForeignKey("clinical_measurements.id", ondelete="CASCADE"))
    month: Mapped[int] = mapped_column(Integer)           # mốc tương đối so với lần đo đầu: 0, 6, 12
    value: Mapped[float] = mapped_column(Float)           # mL/phút/1,73m²
    measured_on: Mapped[date | None] = mapped_column(Date)

    measurement: Mapped[ClinicalMeasurement] = relationship(back_populates="egfr")


class ModelVersion(Base):
    __tablename__ = "model_versions"
    __table_args__ = (CheckConstraint("status IN ('active','inactive','pending_weights')", name="ck_mv_status"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    version: Mapped[str] = mapped_column(String(40), unique=True)
    status: Mapped[str] = mapped_column(String(20))
    description: Mapped[str | None] = mapped_column(Text)
    weights_sha256: Mapped[str | None] = mapped_column(String(64))
    trained_on: Mapped[str | None] = mapped_column(String(120))
    deployed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class PredictionRun(Base):
    __tablename__ = "prediction_runs"
    __table_args__ = (CheckConstraint("status IN ('success','failed')", name="ck_run_status"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patient_profiles.id", ondelete="CASCADE"), index=True)
    measurement_id: Mapped[int | None] = mapped_column(ForeignKey("clinical_measurements.id", ondelete="SET NULL"))
    model_version_id: Mapped[int | None] = mapped_column(ForeignKey("model_versions.id"))
    requested_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    status: Mapped[str] = mapped_column(String(10))
    error: Mapped[str | None] = mapped_column(Text)
    input_snapshot: Mapped[dict | None] = mapped_column(JSON)   # đầu vào đúng như đã gửi cho mô hình -> tái hiện được
    cluster: Mapped[str | None] = mapped_column(String(30))
    slope_per_year: Mapped[float | None] = mapped_column(Float)
    total_change: Mapped[float | None] = mapped_column(Float)
    risk_score: Mapped[float | None] = mapped_column(Float)
    last_observed: Mapped[float | None] = mapped_column(Float)
    stage_36m: Mapped[str | None] = mapped_column(String(4))
    n_visits: Mapped[int | None] = mapped_column(Integer)
    confidence: Mapped[str | None] = mapped_column(String(12))
    warnings: Mapped[list | None] = mapped_column(JSON)
    latency_ms: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)

    results: Mapped[list["PredictionResult"]] = relationship(back_populates="run", cascade="all, delete-orphan",
                                                             order_by="PredictionResult.month")
    version_obj: Mapped[ModelVersion | None] = relationship()
    requester: Mapped["User"] = relationship(foreign_keys=[requested_by])


class PredictionResult(Base):
    __tablename__ = "prediction_results"
    __table_args__ = (UniqueConstraint("run_id", "month", name="uq_result_run_month"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("prediction_runs.id", ondelete="CASCADE"), index=True)
    month: Mapped[int] = mapped_column(Integer)
    egfr_pred: Mapped[float] = mapped_column(Float)
    stage: Mapped[str] = mapped_column(String(4))

    run: Mapped[PredictionRun] = relationship(back_populates="results")


class ClinicalNote(Base):
    """Ghi chú chuyên môn / kế hoạch theo dõi do nhân viên y tế xác nhận (không do AI tạo)."""
    __tablename__ = "clinical_notes"
    __table_args__ = (CheckConstraint("kind IN ('note','plan','follow_up')", name="ck_note_kind"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patient_profiles.id", ondelete="CASCADE"), index=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    kind: Mapped[str] = mapped_column(String(10), default="note")
    body: Mapped[str] = mapped_column(Text)
    due_date: Mapped[date | None] = mapped_column(Date)           # dùng cho follow_up (lịch tái khám)
    visible_to_patient: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    author: Mapped[User] = relationship()


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    action: Mapped[str] = mapped_column(String(50), index=True)
    entity: Mapped[str | None] = mapped_column(String(40))
    entity_id: Mapped[int | None] = mapped_column(Integer)
    ip: Mapped[str | None] = mapped_column(String(45))
    detail: Mapped[str | None] = mapped_column(String(300))   # không ghi dữ liệu y tế
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)

    user: Mapped[User | None] = relationship()
