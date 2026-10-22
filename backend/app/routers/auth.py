from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..deps import audit, current_user, err
from ..models import PatientProfile, User
from ..schemas import ChangePasswordIn, LoginIn, RegisterIn, TokenOut, UserOut
from ..security import create_access_token, hash_password, login_limiter, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])
settings = get_settings()


def _token_out(user: User) -> TokenOut:
    return TokenOut(access_token=create_access_token(user.id, user.role, user.token_version),
                    expires_in=settings.access_token_minutes * 60, user=UserOut.model_validate(user))


@router.post("/register", response_model=UserOut, status_code=201)
def register(body: RegisterIn, request: Request, db: Session = Depends(get_db)):
    email = body.email.lower()
    if db.scalar(select(User.id).where(User.email == email)):
        raise err(409, "Email đã được sử dụng", "email_taken")
    # Bác sĩ/nhân viên y tế phải được Admin duyệt trước khi dùng; bệnh nhân hoạt động ngay.
    user = User(email=email, full_name=body.full_name.strip(), password_hash=hash_password(body.password),
                role=body.role, status="pending" if body.role == "clinician" else "active")
    db.add(user)
    db.flush()
    if user.role == "patient":  # liên kết với hồ sơ do bác sĩ tạo sẵn theo email (nếu có)
        prof = db.scalar(select(PatientProfile).where(PatientProfile.linked_email == email,
                                                      PatientProfile.user_id.is_(None)))
        if prof:
            prof.user_id = user.id
    audit(db, user, "register", "user", user.id, request, f"role={user.role}")
    db.commit()
    return user


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, request: Request, db: Session = Depends(get_db)):
    email = body.email.lower()
    key = f"{email}|{request.client.host if request.client else ''}"
    if login_limiter.blocked(key):
        raise err(429, "Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau ít phút.", "too_many_attempts")
    user = db.scalar(select(User).where(User.email == email))
    if user is None or not verify_password(body.password, user.password_hash):
        login_limiter.fail(key)
        audit(db, user, "login_failed", "user", user.id if user else None, request)
        db.commit()
        raise err(401, "Email hoặc mật khẩu không đúng", "bad_credentials")
    if user.status == "pending":
        raise err(403, "Tài khoản đang chờ Admin duyệt", "account_pending")
    if user.status != "active":
        raise err(403, "Tài khoản đã bị khoá", "account_disabled")
    login_limiter.reset(key)
    user.last_login_at = datetime.now(timezone.utc)
    audit(db, user, "login", "user", user.id, request)
    db.commit()
    return _token_out(user)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    return user


@router.post("/logout", status_code=204)
def logout(request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Vô hiệu hoá mọi token đã cấp cho tài khoản (đăng xuất khỏi tất cả thiết bị)."""
    db.execute(update(User).where(User.id == user.id).values(token_version=User.token_version + 1))
    audit(db, user, "logout", "user", user.id, request)
    db.commit()


@router.post("/change-password", status_code=204)
def change_password(body: ChangePasswordIn, request: Request, user: User = Depends(current_user),
                    db: Session = Depends(get_db)):
    if not verify_password(body.current_password, user.password_hash):
        raise err(400, "Mật khẩu hiện tại không đúng", "bad_credentials")
    user.password_hash = hash_password(body.new_password)
    user.token_version += 1
    audit(db, user, "change_password", "user", user.id, request)
    db.commit()
