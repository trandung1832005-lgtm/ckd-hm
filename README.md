# CKD Progress – dự đoán tiến triển bệnh thận mạn qua eGFR

Hệ thống web: **GRU** dự đoán eGFR tháng 18/24/30/36 từ eGFR tháng 0/6/12 + chỉ số lâm sàng, sau đó **K-Means** xếp bệnh nhân vào nhóm *Chuyển biến xấu / Ổn định / Cải thiện*.
Chỉ hỗ trợ nghiên cứu và theo dõi; **không** chẩn đoán, không kê đơn, không quyết định phác đồ.

```
ckd-app/
├─ backend/            FastAPI + PyTorch + SQLAlchemy/Alembic
│  ├─ app/ml/          network.py (kiến trúc GRU, sao chép nguyên văn notebook), predictor.py (pipeline)
│  ├─ app/routers/     auth, patients (+đo lường, dự đoán, ghi chú), admin, misc (health, dashboard, giáo dục)
│  ├─ app/data/        education.json, evaluation_computed.json, evaluation_reported.json
│  ├─ ml_assets/       gru_lstm_phat_nang.pt, phan_cum.joblib, tham_so_tien_xu_ly.json
│  ├─ migrations/      Alembic (0001_initial_schema)
│  ├─ scripts/         verify_model.py, build_evaluation.py, seed_demo.py
│  └─ tests/           20 test (phân quyền, dự đoán, lỗi, admin)
├─ frontend/           React + TypeScript + Vite + Tailwind + Recharts
├─ render.yaml         Blueprint Render (API Docker + PostgreSQL)
└─ screenshots/        ảnh chụp các trang chính
```

## 1. Tích hợp mô hình AI (quan trọng)
- Đầu vào mô hình là **13 cột tĩnh đã chuẩn hoá + chuỗi eGFR 3 mốc**, không phải 20 đặc trưng thô. Từ dữ liệu thô, `Predictor.raw_to_model_inputs` tạo đúng các cột đó bằng tham số z-score của **Train** trong `tham_so_tien_xu_ly.json`:
  tuổi, giới (mã 1/2), tăng huyết áp, đái tháo đường, tim mạch, nguyên nhân (mã 1–4, one-hot), UPCR (log1p, z-score; thiếu → giá trị điền cố định + cờ `UPCR_thieu`), albumin, huyết áp tâm thu.
- eGFR thiếu tháng 6/12 được truyền vào mô hình dưới dạng NaN (mô hình tự xử lý bằng cờ quan sát) – đúng như lúc huấn luyện. eGFR tháng 0 và albumin/SBP bắt buộc.
- Đặc trưng phân cụm: độ dốc eGFR (theo năm), thay đổi tổng, UPCR_z, Alb_z, SBP_z → cắt phân vị 5–95% của Train → StandardScaler → K-Means (cụm 2 = Chuyển biến xấu, 1 = Ổn định, 0 = Cải thiện).
- **Đã kiểm chứng**: `python scripts/verify_model.py` tái hiện đầu ra notebook (sai khác ≤ 1e-5, nhóm trùng 100%) và test API `test_predict_matches_notebook_reference` dựng lại dữ liệu thô của BN 10208 rồi so với `ket_qua_toan_he_thong_test.csv`.
- Nếu thiếu tệp mô hình: `/api/health` báo `model_ready=false`, API dự đoán trả **503** `model_not_ready` (và ghi nhật ký lỗi); không có kết quả giả.
- Mã hoá `gender` (1/2) và `etiology` (1–4) chưa có nhãn lâm sàng trong dữ liệu; UI hiển thị "Nhóm 1/2…" – sửa tại `frontend/src/lib/labels.ts` khi có nhãn.

### ⚠ Số liệu đánh giá: hai nguồn chưa trùng
Trọng số `gru_lstm_phat_nang.pt` trong thư mục tái hiện **MAE 3.693 / 4.179 / 3.508** (Train/Val/Test), khớp các CSV của notebook (`tong_hop_cuoi_train_val_test.csv`), **không** phải 3.780 / 4.205 / 3.562 trong báo cáo (thí nghiệm 4 "chống quá khớp"). Tương tự phát hiện suy giảm nhanh trên Test: tái tính AUC 0.662 / Acc 72.0% / Sens 50.0% / Spec 82.4% so với báo cáo 0.677 / 73.0% / 53.1% / 82.4%.
Trang Admin hiển thị **cả hai nguồn, tách bạch** (cột "BC" = báo cáo, "triển khai" = tái tính) và có cảnh báo. Phiên bản báo cáo được ghi trong `model_versions` với trạng thái `pending_weights`. **Cần bổ sung trọng số của phiên bản báo cáo** (hoặc cập nhật báo cáo) để thống nhất.
Tái sinh số liệu tái tính: `python scripts/build_evaluation.py <thư_mục_Demo_HM>` (cần `train/val/test.xlsx`; các tệp dữ liệu này **không** nằm trong repo).

## 2. Chạy local
Yêu cầu: Python 3.12, Node 20+. (SQLite tự dùng khi dev; PostgreSQL khi triển khai.)
```bash
# Backend
cd backend
python -m venv .venv && .venv/Scripts/activate        # Linux/mac: source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env     # điền JWT_SECRET (python -c "import secrets;print(secrets.token_urlsafe(48))")
python -m app.cli create-admin --email you@example.org    # mật khẩu: biến ADMIN_PASSWORD hoặc nhập tay
uvicorn app.main:app --reload --port 8000                 # Swagger: http://localhost:8000/api/docs
# (tuỳ chọn) dữ liệu minh hoạ tổng hợp, gắn cờ is_demo:
DEMO_PASSWORD='<mật khẩu mạnh>' python scripts/seed_demo.py
pytest -q

# Frontend
cd ../frontend && npm install && npm run dev               # http://localhost:5173 (proxy /api -> :8000)
```
PostgreSQL local: đặt `DATABASE_URL=postgresql://user:pass@localhost:5432/ckd` rồi `alembic upgrade head`.

## 3. API (tiền tố `/api`, lỗi thống nhất `{error, message, details?}`)
| Method & đường dẫn | Quyền | Ghi chú |
|---|---|---|
| POST `/auth/register` | công khai | role `patient` hoặc `clinician` (chờ Admin duyệt). Không thể đăng ký admin |
| POST `/auth/login` · GET `/auth/me` · POST `/auth/logout` · POST `/auth/change-password` | | JWT 60 phút; giới hạn 5 lần sai/15 phút |
| GET `/patients?q=&cluster=&page=` · POST `/patients` · GET/PATCH `/patients/{id}` | clinician (hồ sơ được phân công) / patient (chỉ hồ sơ của chính mình) | bệnh nhân tự tạo hồ sơ (mỗi tài khoản 1 hồ sơ, 409 nếu đã có) |
| POST `/patients/{id}/assignments` | clinician / chủ hồ sơ (patient) | cấp quyền xem hồ sơ cho bác sĩ (email) |
| POST/GET `/patients/{id}/measurements` | clinician và patient (hồ sơ của mình) | |
| POST `/patients/{id}/predict` `{measurement_id}` | clinician và patient (hồ sơ của mình) | lưu `prediction_runs` + `prediction_results`, không ghi đè lần cũ |
| GET `/patients/{id}/predictions` · GET `/predictions/{id}` | clinician/patient (hồ sơ của mình) | |
| GET/POST `/patients/{id}/notes` | chỉ clinician ghi; patient chỉ đọc ghi chú `visible_to_patient` | ghi chú/kế hoạch là phần chuyên môn của nhân viên y tế |
| GET `/dashboard` · GET `/education` · GET `/health` | đăng nhập / công khai | |
| GET `/admin/users` · PATCH `/admin/users/{id}` | admin | duyệt/khoá/đổi vai trò |
| GET `/admin/model-evaluation` (+`/export` CSV) · `/admin/model-versions` · `/admin/prediction-logs` · `/admin/audit-logs` | admin | |

Ví dụ dự đoán:
```http
POST /api/patients/12/measurements
{"recorded_on":"2026-01-10","age_years":65,"sbp":140,"albumin":3.8,"upcr":0.9,
 "egfr":[{"month":0,"value":45.5},{"month":6,"value":43.0},{"month":12,"value":45.3}]}
POST /api/patients/12/predict   {"measurement_id": 7}
→ 201 {"id":21,"cluster":"Ổn định","stage_36m":"G3a","n_visits":3,"confidence":"Cao",
       "results":[{"month":18,"egfr_pred":44.7,"stage":"G3a"}, …], "model_version":"gru-kmeans-1.0-deployed", …}
```

## 4. Bảo mật & quyền riêng tư
Quyền kiểm tra ở backend cho từng endpoint; vai trò/trạng thái đọc từ DB mỗi request (token cũ vô hiệu khi đổi mật khẩu/khoá/đổi vai trò). Hồ sơ không có quyền trả **404** (không lộ tồn tại). **Admin không đọc được dữ liệu lâm sàng của bệnh nhân** (chỉ số liệu vận hành). bcrypt cho mật khẩu; ORM tham số hoá (chống SQL injection); React escape mặc định (không dùng `dangerouslySetInnerHTML`); CORS theo danh sách; header `nosniff`, `X-Frame-Options`, `no-store`; nhật ký thao tác không chứa dữ liệu y tế/nội dung ghi chú; không có bí mật trong mã nguồn (`.env` bị `.gitignore`). Token lưu `sessionStorage` (mất khi đóng tab; đánh đổi so với cookie httpOnly vì frontend/backend khác domain). Hồ sơ chỉ dùng mã nội bộ, không thu họ tên/số định danh.

## 5. Triển khai
1. **Database + backend (Render)**: tạo từ `render.yaml` (Blueprint) hoặc thủ công: Web Service Docker, root `backend`, PostgreSQL. Biến môi trường: `DATABASE_URL` (tự nối), `JWT_SECRET` (tự sinh), `ENVIRONMENT=production`, `CORS_ORIGINS=https://<app>.vercel.app`. Container tự chạy `alembic upgrade head`. Bản miễn phí RAM nhỏ: PyTorch CPU ~ vài trăm MB, có thể cần gói trả phí.
2. **Tạo Admin đầu tiên** (Render Shell): `ADMIN_PASSWORD='…' python -m app.cli create-admin --email … --name …`.
3. **Frontend (Vercel)**: import repo, Root Directory `frontend`, Build `npm run build`, Output `dist`, biến `VITE_API_URL=https://<api>.onrender.com`. `vercel.json` đã có rewrite SPA.
4. **Kiểm tra sau deploy**: `GET <api>/api/health` → `{"status":"ok","model_ready":true}`; đăng nhập Admin → *Đánh giá mô hình AI* → API "Đang hoạt động"; tạo bệnh nhân + dự đoán; kiểm tra HTTPS và CORS (không lỗi trong console).
5. **Sao lưu**: dùng backup tự động của nhà cung cấp PostgreSQL, hoặc `pg_dump $DATABASE_URL > backup.sql` định kỳ; khôi phục bằng `psql $DATABASE_URL < backup.sql`.

## 6. Kiểm thử từng vai trò (thủ công, sau seed demo)
- **Admin**: vào `/app/admin/users`, duyệt tài khoản bác sĩ `pending`; mở `/app/admin/model`; thử vào `/app/patients/1` → 404 (không có quyền dữ liệu lâm sàng).
- **Bác sĩ**: tạo hồ sơ → *Nhập dữ liệu & dự đoán* (5 bước, hoặc CSV mẫu) → trang kết quả; thêm ghi chú/lịch tái khám; chia sẻ hồ sơ cho bác sĩ khác. Bác sĩ thứ hai chưa được cấp quyền không thấy hồ sơ.
- **Bệnh nhân**: đăng ký → *Tạo hồ sơ của tôi* → nhập dữ liệu (5 bước) → xem kết quả dự đoán; có thể *Chia sẻ với bác sĩ* bằng email. Hoặc đăng ký bằng email đã được bác sĩ liên kết sẵn hồ sơ. Không thấy hồ sơ người khác; không ghi được ghi chú chuyên môn; `/app/admin/*` tự chuyển về `/app`. Lịch sử dự đoán ghi rõ ai nhập (bệnh nhân hay nhân viên y tế).
Tự động: `pytest -q` (20 test).

## 7. Trạng thái chức năng
**Đã hoàn thành**: đăng ký/đăng nhập/phân quyền 3 vai trò, duyệt bác sĩ, hồ sơ & phân công, nhập liệu nhiều bước + CSV 1 dòng, dự đoán GRU+K-Means lưu lịch sử, trang kết quả (biểu đồ G1–G5, diễn giải, cảnh báo độ tin cậy), so sánh các lần dự đoán, ghi chú/kế hoạch/lịch tái khám do bác sĩ nhập, trang giáo dục có nguồn, dashboard theo vai trò, trang Admin đánh giá mô hình (5 nhóm), phiên bản mô hình, nhật ký API & thao tác, xuất CSV đánh giá, migration, Dockerfile, hướng dẫn deploy.
**Chưa có / hạn chế**: khôi phục mật khẩu qua email (cần dịch vụ email; hiện có đổi mật khẩu API, chưa có màn hình đổi mật khẩu); chuông thông báo trong header; nhập hàng loạt nhiều bệnh nhân; xuất PDF phía máy chủ (hiện dùng In/Lưu PDF của trình duyệt); khoảng bất định (chưa có phương pháp được xác thực nên không hiển thị); nhãn lâm sàng cho giới tính/nguyên nhân; trọng số phiên bản báo cáo; giới hạn đăng nhập lưu trong bộ nhớ (1 instance); nội dung giáo dục cần bác sĩ chuyên khoa rà soát; chưa triển khai thực tế lên Vercel/Render và chưa đẩy GitHub (cần tài khoản/xác nhận của bạn).
