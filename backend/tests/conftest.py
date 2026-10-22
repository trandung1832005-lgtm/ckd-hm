import os
import tempfile
from pathlib import Path

_tmp = Path(tempfile.mkdtemp()) / "test.db"
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp.as_posix()}"
os.environ["JWT_SECRET"] = "test-secret-not-for-production-0123456789"
os.environ["ENVIRONMENT"] = "test"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.db import SessionLocal  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User  # noqa: E402
from app.security import hash_password  # noqa: E402

PW = "Passw0rd-Strong!"


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c


def _mk(email, role, status="active"):
    with SessionLocal() as db:
        if not db.query(User).filter_by(email=email).first():
            db.add(User(email=email, full_name=email.split("@")[0], password_hash=hash_password(PW), role=role,
                        status=status))
            db.commit()


@pytest.fixture(scope="session")
def tokens(client):
    for email, role in (("admin@t.io", "admin"), ("doc1@t.io", "clinician"), ("doc2@t.io", "clinician"),
                        ("pat1@t.io", "patient"), ("pat2@t.io", "patient"),
                        ("pat3@t.io", "patient"), ("pat4@t.io", "patient"), ("pat5@t.io", "patient")):
        _mk(email, role)
    out = {}
    for email in ("admin@t.io", "doc1@t.io", "doc2@t.io", "pat1@t.io", "pat2@t.io", "pat3@t.io", "pat4@t.io", "pat5@t.io"):
        r = client.post("/api/auth/login", json={"email": email, "password": PW})
        assert r.status_code == 200, r.text
        out[email.split("@")[0]] = {"Authorization": f"Bearer {r.json()['access_token']}"}
    return out
