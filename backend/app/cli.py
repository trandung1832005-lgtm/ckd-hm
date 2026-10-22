"""Lệnh quản trị. Tạo Admin đầu tiên mà không hard-code mật khẩu.

    python -m app.cli create-admin --email admin@example.org --name "Quản trị viên"
(mật khẩu lấy từ biến môi trường ADMIN_PASSWORD hoặc nhập tương tác)
"""
import argparse
import getpass
import os
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from sqlalchemy import select

from .db import Base, SessionLocal, engine
from .models import User
from .schemas import _check_password
from .security import hash_password


def create_admin(email: str, name: str) -> None:
    password = os.environ.get("ADMIN_PASSWORD") or getpass.getpass("Mật khẩu Admin: ")
    try:
        _check_password(password)
    except ValueError as exc:
        sys.exit(f"Mật khẩu không hợp lệ: {exc}")
    if str(engine.url).startswith("sqlite"):
        Base.metadata.create_all(engine)
    with SessionLocal() as db:
        email = email.lower()
        existing = db.scalar(select(User).where(User.email == email))
        if existing:
            sys.exit("Email đã tồn tại.")
        db.add(User(email=email, full_name=name, password_hash=hash_password(password), role="admin",
                    status="active"))
        db.commit()
    print(f"Đã tạo Admin: {email}")


def main() -> None:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("create-admin")
    c.add_argument("--email", required=True)
    c.add_argument("--name", default="Quản trị viên")
    args = ap.parse_args()
    if args.cmd == "create-admin":
        create_admin(args.email, args.name)


if __name__ == "__main__":
    main()
