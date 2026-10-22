from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

Role = Literal["admin", "clinician", "patient"]


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------- Auth ----------
def _check_password(v: str) -> str:
    if len(v.encode("utf-8")) > 72:
        raise ValueError("Mật khẩu tối đa 72 byte")
    if len(v) < 10:
        raise ValueError("Mật khẩu tối thiểu 10 ký tự")
    if v.lower() == v or v.upper() == v or not any(c.isdigit() for c in v):
        raise ValueError("Mật khẩu cần có chữ hoa, chữ thường và chữ số")
    return v


class RegisterIn(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=120)
    password: str
    role: Literal["clinician", "patient"]  # Admin KHÔNG thể tự đăng ký

    _pw = field_validator("password")(_check_password)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(max_length=200)


class ChangePasswordIn(BaseModel):
    current_password: str = Field(max_length=200)
    new_password: str

    _pw = field_validator("new_password")(_check_password)


class UserOut(ORM):
    id: int
    email: str
    full_name: str
    role: Role
    status: str
    created_at: datetime
    last_login_at: datetime | None = None


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserOut


class AdminUserUpdate(BaseModel):
    role: Role | None = None
    status: Literal["active", "pending", "disabled"] | None = None


# ---------- Patients ----------
class PatientBase(BaseModel):
    gender: Literal[1, 2]
    etiology: Literal[1, 2, 3, 4]
    hypertension: bool
    diabetes: bool
    cvd: bool


class PatientCreate(PatientBase):
    linked_email: EmailStr | None = None
    is_demo: bool = False


class PatientUpdate(BaseModel):
    gender: Literal[1, 2] | None = None
    etiology: Literal[1, 2, 3, 4] | None = None
    hypertension: bool | None = None
    diabetes: bool | None = None
    cvd: bool | None = None
    linked_email: EmailStr | None = None


class PatientOut(ORM, PatientBase):
    id: int
    code: str
    linked_email: str | None = None
    is_demo: bool
    created_at: datetime
    updated_at: datetime
    latest_cluster: str | None = None
    latest_prediction_at: datetime | None = None
    latest_egfr: float | None = None


class Page(BaseModel):
    items: list
    total: int
    page: int
    page_size: int


# ---------- Measurements ----------
class EgfrIn(BaseModel):
    month: Literal[0, 6, 12]
    value: float = Field(gt=0, le=200, description="mL/phút/1,73m²")
    measured_on: date | None = None


class MeasurementIn(BaseModel):
    recorded_on: date
    age_years: float = Field(ge=18, le=110, description="tuổi (năm) tại thời điểm đo")
    sbp: float = Field(ge=50, le=300, description="huyết áp tâm thu, mmHg")
    albumin: float = Field(ge=1.0, le=6.0, description="albumin huyết thanh, g/dL")
    upcr: float | None = Field(default=None, ge=0, le=50, description="UPCR, g/g (mg/mg); để trống nếu chưa đo")
    egfr: list[EgfrIn] = Field(min_length=1, max_length=3)

    @model_validator(mode="after")
    def _check(self):
        months = [e.month for e in self.egfr]
        if len(set(months)) != len(months):
            raise ValueError("Mỗi mốc eGFR chỉ được nhập một lần")
        if 0 not in months:
            raise ValueError("eGFR tại tháng 0 là bắt buộc")
        return self


class EgfrOut(ORM):
    month: int
    value: float
    measured_on: date | None = None


class MeasurementOut(ORM):
    id: int
    patient_id: int
    recorded_on: date
    age_years: float
    sbp: float
    albumin: float
    upcr: float | None
    created_at: datetime
    egfr: list[EgfrOut]


# ---------- Predictions ----------
class PredictIn(BaseModel):
    measurement_id: int


class ResultOut(ORM):
    month: int
    egfr_pred: float
    stage: str


class RunOut(ORM):
    id: int
    patient_id: int
    measurement_id: int | None
    status: str
    error: str | None
    cluster: str | None
    slope_per_year: float | None
    total_change: float | None
    risk_score: float | None
    last_observed: float | None
    stage_36m: str | None
    n_visits: int | None
    confidence: str | None
    warnings: list[str] | None
    created_at: datetime
    model_version: str | None = None
    requested_by_role: str | None = None
    results: list[ResultOut] = []
    history: list[EgfrOut] = []


# ---------- Notes ----------
class NoteIn(BaseModel):
    kind: Literal["note", "plan", "follow_up"] = "note"
    body: str = Field(min_length=1, max_length=4000)
    due_date: date | None = None
    visible_to_patient: bool = False


class NoteOut(ORM):
    id: int
    kind: str
    body: str
    due_date: date | None
    visible_to_patient: bool
    created_at: datetime
    author_name: str | None = None
