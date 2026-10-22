from typing import Callable

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import get_db
from .ml.predictor import Predictor
from .models import AuditLog, PatientAssignment, PatientProfile, User
from .security import decode_token

bearer = HTTPBearer(auto_error=False)


def err(code: int, message: str, error: str = "error") -> HTTPException:
    return HTTPException(status_code=code, detail={"error": error, "message": message})


def get_predictor(request: Request) -> Predictor:
    return request.app.state.predictor


def current_user(creds: HTTPAuthorizationCredentials | None = Depends(bearer),
                 db: Session = Depends(get_db)) -> User:
    if creds is None:
        raise err(401, "Chưa đăng nhập", "not_authenticated")
    try:
        payload = decode_token(creds.credentials)
    except jwt.ExpiredSignatureError:
        raise err(401, "Phiên đăng nhập đã hết hạn", "token_expired")
    except jwt.PyJWTError:
        raise err(401, "Token không hợp lệ", "invalid_token")
    user = db.get(User, int(payload["sub"]))
    # vai trò & trạng thái luôn lấy từ DB, không tin claim trong token
    if user is None or user.status != "active" or user.token_version != payload.get("tv"):
        raise err(401, "Phiên đăng nhập không còn hiệu lực", "invalid_token")
    return user


def require_roles(*roles: str) -> Callable:
    def dep(user: User = Depends(current_user)) -> User:
        if user.role not in roles:
            raise err(403, "Bạn không có quyền thực hiện thao tác này", "forbidden")
        return user
    return dep


def get_patient_for(db: Session, user: User, patient_id: int, write: bool = False) -> PatientProfile:
    """Kiểm soát truy cập theo từng hồ sơ.

    - clinician: chỉ hồ sơ được phân công. - patient: chỉ hồ sơ của chính mình, chỉ đọc.
    - admin: KHÔNG truy cập dữ liệu lâm sàng (nguyên tắc tối thiểu hoá dữ liệu).
    Trả 404 (không phải 403) khi không có quyền để không lộ sự tồn tại của hồ sơ.
    """
    p = db.get(PatientProfile, patient_id)
    if p is None:
        raise err(404, "Không tìm thấy hồ sơ bệnh nhân", "not_found")
    if user.role == "clinician":
        ok = db.scalar(select(PatientAssignment.id).where(PatientAssignment.patient_id == p.id,
                                                          PatientAssignment.clinician_id == user.id))
        if ok:
            return p
    elif user.role == "patient" and not write and p.user_id == user.id:
        return p
    raise err(404, "Không tìm thấy hồ sơ bệnh nhân", "not_found")


def audit(db: Session, user: User | None, action: str, entity: str | None = None, entity_id: int | None = None,
          request: Request | None = None, detail: str | None = None) -> None:
    ip = request.client.host if request and request.client else None
    db.add(AuditLog(user_id=user.id if user else None, action=action, entity=entity, entity_id=entity_id,
                    ip=ip, detail=(detail or "")[:300] or None))
