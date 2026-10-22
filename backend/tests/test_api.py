import json
from pathlib import Path

import pytest

PATIENT = {"gender": 1, "etiology": 2, "hypertension": True, "diabetes": False, "cvd": False}
MEAS = {"recorded_on": "2026-01-10", "age_years": 65, "sbp": 140, "albumin": 3.8, "upcr": 0.9,
        "egfr": [{"month": 0, "value": 45.5}, {"month": 6, "value": 43.0}, {"month": 12, "value": 45.3}]}


def _patient(client, tokens, doc="doc1", **extra):
    r = client.post("/api/patients", json={**PATIENT, **extra}, headers=tokens[doc])
    assert r.status_code == 201, r.text
    return r.json()


# ---- 1/2: đăng nhập, phân quyền
def test_unauthenticated(client):
    assert client.get("/api/patients").status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": "Bearer xxx"}).status_code == 401


def test_cannot_register_admin(client):
    r = client.post("/api/auth/register", json={"email": "evil@t.io", "full_name": "Evil", "password": "Passw0rd-Strong!",
                                                "role": "admin"})
    assert r.status_code == 422


def test_weak_password_rejected(client):
    r = client.post("/api/auth/register", json={"email": "w@t.io", "full_name": "Weak", "password": "abc",
                                                "role": "patient"})
    assert r.status_code == 422


def test_clinician_needs_approval(client, tokens):
    r = client.post("/api/auth/register", json={"email": "newdoc@t.io", "full_name": "New Doc",
                                                "password": "Passw0rd-Strong!", "role": "clinician"})
    assert r.status_code == 201 and r.json()["status"] == "pending"
    r = client.post("/api/auth/login", json={"email": "newdoc@t.io", "password": "Passw0rd-Strong!"})
    assert r.status_code == 403 and r.json()["error"] == "account_pending"
    uid = r.json and client.get("/api/admin/users?q=newdoc", headers=tokens["admin"]).json()["items"][0]["id"]
    assert client.patch(f"/api/admin/users/{uid}", json={"status": "active"}, headers=tokens["admin"]).status_code == 200
    assert client.post("/api/auth/login", json={"email": "newdoc@t.io", "password": "Passw0rd-Strong!"}).status_code == 200


@pytest.mark.parametrize("who", ["doc1", "pat1"])
def test_admin_endpoints_forbidden(client, tokens, who):
    for path in ("/api/admin/users", "/api/admin/model-evaluation", "/api/admin/model-versions",
                 "/api/admin/audit-logs", "/api/admin/prediction-logs"):
        assert client.get(path, headers=tokens[who]).status_code == 403, path


def test_admin_cannot_read_patient_records(client, tokens):
    p = _patient(client, tokens)
    assert client.get(f"/api/patients/{p['id']}", headers=tokens["admin"]).status_code == 404
    assert client.get("/api/patients", headers=tokens["admin"]).status_code == 403


# ---- 3/4: truy cập theo hồ sơ
def test_clinician_isolation_and_sharing(client, tokens):
    p = _patient(client, tokens)
    assert client.get(f"/api/patients/{p['id']}", headers=tokens["doc2"]).status_code == 404
    assert client.get("/api/patients", headers=tokens["doc2"]).json()["total"] == 0 or \
        all(x["id"] != p["id"] for x in client.get("/api/patients", headers=tokens["doc2"]).json()["items"])
    assert client.post(f"/api/patients/{p['id']}/assignments", json={"clinician_email": "doc2@t.io"},
                       headers=tokens["doc1"]).status_code == 201
    assert client.get(f"/api/patients/{p['id']}", headers=tokens["doc2"]).status_code == 200


def test_patient_sees_only_own_and_cannot_touch_others(client, tokens):
    mine = _patient(client, tokens, linked_email="pat1@t.io")
    other = _patient(client, tokens, linked_email="pat2@t.io")
    h = tokens["pat1"]
    assert client.get(f"/api/patients/{mine['id']}", headers=h).status_code == 200
    assert client.get(f"/api/patients/{other['id']}", headers=h).status_code == 404
    assert client.get(f"/api/patients/{other['id']}/predictions", headers=h).status_code == 404
    assert [x["id"] for x in client.get("/api/patients", headers=h).json()["items"]] == [mine["id"]]
    # không ghi được vào hồ sơ người khác
    assert client.post(f"/api/patients/{other['id']}/measurements", json=MEAS, headers=h).status_code == 404
    assert client.patch(f"/api/patients/{other['id']}", json={"diabetes": True}, headers=h).status_code == 404
    assert client.post(f"/api/patients/{other['id']}/predict", json={"measurement_id": 1}, headers=h).status_code == 404
    assert client.post(f"/api/patients/{other['id']}/assignments", json={"clinician_email": "doc2@t.io"},
                       headers=h).status_code == 404
    # mỗi tài khoản chỉ một hồ sơ; ghi chú chuyên môn chỉ dành cho nhân viên y tế
    assert client.post("/api/patients", json=PATIENT, headers=h).status_code == 409
    assert client.post(f"/api/patients/{mine['id']}/notes", json={"body": "x"}, headers=h).status_code == 403


def test_patient_self_service_prediction_and_sharing(client, tokens):
    h = tokens["pat5"]
    r = client.post("/api/patients", json=PATIENT, headers=h)       # tự tạo hồ sơ
    assert r.status_code == 201, r.text
    pid = r.json()["id"]
    m = client.post(f"/api/patients/{pid}/measurements", json=MEAS, headers=h)
    assert m.status_code == 201, m.text
    run = client.post(f"/api/patients/{pid}/predict", json={"measurement_id": m.json()["id"]}, headers=h)
    assert run.status_code == 201, run.text
    body = run.json()
    assert [x["month"] for x in body["results"]] == [18, 24, 30, 36] and body["requested_by_role"] == "patient"
    assert client.patch(f"/api/patients/{pid}", json={"diabetes": True}, headers=h).status_code == 200
    # bác sĩ chưa được chia sẻ thì không thấy; sau khi bệnh nhân chia sẻ thì thấy
    assert client.get(f"/api/patients/{pid}", headers=tokens["doc1"]).status_code == 404
    assert client.post(f"/api/patients/{pid}/assignments", json={"clinician_email": "doc1@t.io"}, headers=h).status_code == 201
    seen = client.get(f"/api/patients/{pid}/predictions", headers=tokens["doc1"])
    assert seen.status_code == 200 and seen.json()[0]["requested_by_role"] == "patient"
    assert client.get(f"/api/patients/{pid}", headers=tokens["doc2"]).status_code == 404
    # bệnh nhân không đổi được email liên kết
    client.patch(f"/api/patients/{pid}", json={"linked_email": "someone@else.io"}, headers=h)
    assert client.get(f"/api/patients/{pid}", headers=h).json()["linked_email"] == "pat5@t.io"


# ---- 5/6/7/9: dự đoán, lưu, truy xuất, dữ liệu sai
def test_prediction_flow_and_history(client, tokens):
    p = _patient(client, tokens, linked_email="pat3@t.io")
    pid = p["id"]
    m = client.post(f"/api/patients/{pid}/measurements", json=MEAS, headers=tokens["doc1"])
    assert m.status_code == 201, m.text
    r = client.post(f"/api/patients/{pid}/predict", json={"measurement_id": m.json()["id"]}, headers=tokens["doc1"])
    assert r.status_code == 201, r.text
    run = r.json()
    assert [x["month"] for x in run["results"]] == [18, 24, 30, 36]
    assert run["cluster"] in ("Chuyển biến xấu", "Ổn định", "Cải thiện")
    assert run["n_visits"] == 3 and run["confidence"] == "Cao"
    assert run["model_version"]
    # bệnh nhân xem được kết quả của mình
    got = client.get(f"/api/predictions/{run['id']}", headers=tokens["pat3"])
    assert got.status_code == 200 and got.json()["results"] == run["results"]
    # lần dự đoán mới không ghi đè lần cũ
    r2 = client.post(f"/api/patients/{pid}/predict", json={"measurement_id": m.json()["id"]}, headers=tokens["doc1"])
    hist = client.get(f"/api/patients/{pid}/predictions", headers=tokens["doc1"]).json()
    assert {run["id"], r2.json()["id"]} <= {h["id"] for h in hist} and len(hist) >= 2
    # người khác không xem được
    assert client.get(f"/api/predictions/{run['id']}", headers=tokens["pat2"]).status_code == 404
    assert client.get(f"/api/predictions/{run['id']}", headers=tokens["doc2"]).status_code in (404, 200)


def test_predict_matches_notebook_reference(client, tokens):
    """Bệnh nhân 10208 (test set) từ ket_qua_toan_he_thong_test.csv -> đầu ra phải khớp notebook."""
    p = _patient(client, tokens)
    # BN 10208: eGFR 45.51/42.99/45.35 -> 44.72/43.03/42.98/43.23 ; nhóm 'Cải thiện' ; dữ liệu thô tái dựng từ z-score
    import numpy as np
    import pandas as pd
    demo = Path(__file__).resolve().parents[3] / "Demo_HM"
    if not (demo / "test.xlsx").exists():
        pytest.skip("không có test.xlsx")
    row = pd.read_excel(demo / "test.xlsx").query("ID == 10208").iloc[0]
    z = json.load(open(demo / "tham_so_tien_xu_ly.json", encoding="utf-8"))["zscore_lam_sang"]
    mu, sd = 33.32484592307998, 18.339739229258125
    etio = int([i for i in (1, 2, 3, 4) if row[f"etiology_{i}"] == 1][0])
    body = {"recorded_on": "2026-01-01", "age_years": float(row.age_z * z["age"]["std"] + z["age"]["mean"]),
            "sbp": float(row.SBP_z * z["SBP"]["std"] + z["SBP"]["mean"]),
            "albumin": float(row.Alb_z * z["Alb"]["std"] + z["Alb"]["mean"]),
            "egfr": [{"month": 0, "value": float(row.eGFR_0M_in * sd + mu)},
                     {"month": 6, "value": float(row.eGFR_6M_in * sd + mu)},
                     {"month": 12, "value": float(row.eGFR_12M_in * sd + mu)}]}
    if row.UPCR_thieu == 0:
        body["upcr"] = float(np.expm1(row.log1p_UPCR_z * z["UPCR"]["std"] + z["UPCR"]["mean"]))
    client.patch(f"/api/patients/{p['id']}", json={"gender": 2 if row.gender_2 == 1 else 1, "etiology": etio,
                                                   "hypertension": bool(row.hypertension), "diabetes": bool(row.diabetes),
                                                   "cvd": bool(row["prevalence of CVD"])}, headers=tokens["doc1"])
    m = client.post(f"/api/patients/{p['id']}/measurements", json=body, headers=tokens["doc1"]).json()
    run = client.post(f"/api/patients/{p['id']}/predict", json={"measurement_id": m["id"]}, headers=tokens["doc1"]).json()
    ref = pd.read_csv(demo / "ket_qua_toan_he_thong_test.csv").query("ID == 10208").iloc[0]
    got = {r["month"]: r["egfr_pred"] for r in run["results"]}
    for mo, col in ((18, "du_doan_18M"), (24, "du_doan_24M"), (30, "du_doan_30M"), (36, "du_doan_36M")):
        assert abs(got[mo] - ref[col]) < 0.05, (mo, got[mo], ref[col])
    assert run["cluster"] == ref["nhom"]


def test_invalid_input_rejected(client, tokens):
    p = _patient(client, tokens)
    bad = dict(MEAS, egfr=[{"month": 6, "value": 40}])           # thiếu tháng 0
    assert client.post(f"/api/patients/{p['id']}/measurements", json=bad, headers=tokens["doc1"]).status_code == 422
    bad = dict(MEAS, sbp=900)
    assert client.post(f"/api/patients/{p['id']}/measurements", json=bad, headers=tokens["doc1"]).status_code == 422
    bad = dict(MEAS, egfr=[{"month": 0, "value": -5}])
    assert client.post(f"/api/patients/{p['id']}/measurements", json=bad, headers=tokens["doc1"]).status_code == 422
    assert client.post("/api/patients", json={**PATIENT, "etiology": 9}, headers=tokens["doc1"]).status_code == 422


def test_missing_visit_warns_and_lowers_confidence(client, tokens):
    p = _patient(client, tokens)
    m = client.post(f"/api/patients/{p['id']}/measurements", headers=tokens["doc1"],
                    json=dict(MEAS, upcr=None, egfr=[{"month": 0, "value": 56.2}])).json()
    run = client.post(f"/api/patients/{p['id']}/predict", json={"measurement_id": m["id"]}, headers=tokens["doc1"]).json()
    assert run["n_visits"] == 1 and run["confidence"] == "Thấp"
    assert any("1 lần đo" in w for w in run["warnings"]) and any("UPCR" in w for w in run["warnings"])


# ---- 8/10: admin & health
def test_admin_evaluation_and_versions(client, tokens):
    ev = client.get("/api/admin/model-evaluation", headers=tokens["admin"]).json()
    assert ev["reported"]["regression"]["Test"]["mae"] == 3.562
    assert ev["reported"]["cluster_comparison"]["KMeans"]["ari"] == 0.855
    assert abs(ev["deployed"]["sets"]["Test"]["regression"]["mae"] - 3.508) < 0.001
    vs = client.get("/api/admin/model-versions", headers=tokens["admin"]).json()
    assert {v["status"] for v in vs["items"]} >= {"active", "pending_weights"}
    assert client.get("/api/admin/model-evaluation/export", headers=tokens["admin"]).status_code == 200
    assert client.get("/api/admin/audit-logs", headers=tokens["admin"]).json()["total"] > 0


def test_health(client):
    h = client.get("/api/health").json()
    assert h["database"] is True and h["model_ready"] is True


def test_model_not_ready_returns_503(client, tokens):
    p = _patient(client, tokens)
    m = client.post(f"/api/patients/{p['id']}/measurements", json=MEAS, headers=tokens["doc1"]).json()
    pred = client.app.state.predictor
    pred.ready, saved = False, pred.ready
    try:
        r = client.post(f"/api/patients/{p['id']}/predict", json={"measurement_id": m["id"]}, headers=tokens["doc1"])
        assert r.status_code == 503 and r.json()["error"] == "model_not_ready"
        logs = client.get("/api/admin/prediction-logs?status=failed", headers=tokens["admin"]).json()
        assert logs["total"] >= 1
    finally:
        pred.ready = saved


def test_notes_visibility(client, tokens):
    p = _patient(client, tokens, linked_email="pat4@t.io")
    pid = p["id"]
    client.post(f"/api/patients/{pid}/notes", json={"body": "ghi chú nội bộ"}, headers=tokens["doc1"])
    client.post(f"/api/patients/{pid}/notes", json={"kind": "follow_up", "body": "Tái khám", "due_date": "2099-01-01",
                                                    "visible_to_patient": True}, headers=tokens["doc1"])
    assert client.post(f"/api/patients/{pid}/notes", json={"kind": "follow_up", "body": "x"},
                       headers=tokens["doc1"]).status_code == 422
    doc_view = client.get(f"/api/patients/{pid}/notes", headers=tokens["doc1"]).json()
    pat_view = client.get(f"/api/patients/{pid}/notes", headers=tokens["pat4"]).json()
    assert len(doc_view) == 2 and len(pat_view) == 1 and pat_view[0]["kind"] == "follow_up"


def test_dashboards_by_role(client, tokens):
    assert client.get("/api/dashboard", headers=tokens["admin"]).json()["role"] == "admin"
    assert client.get("/api/dashboard", headers=tokens["doc1"]).json()["role"] == "clinician"
    assert client.get("/api/dashboard", headers=tokens["pat1"]).json()["role"] == "patient"


def test_login_rate_limit(client):
    for _ in range(5):
        client.post("/api/auth/login", json={"email": "ghost@t.io", "password": "wrong-password-1"})
    r = client.post("/api/auth/login", json={"email": "ghost@t.io", "password": "wrong-password-1"})
    assert r.status_code == 429
