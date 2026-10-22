"""Đăng ký phiên bản mô hình vào DB khi khởi động. Trạng thái phản ánh đúng việc trọng số có tồn tại hay không."""
import hashlib
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from .ml.predictor import Predictor
from .models import ModelVersion

DEPLOYED = "gru-kmeans-1.0-deployed"
REPORTED = "gru-kmeans-1.1-report"


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def sync_model_versions(db: Session, predictor: Predictor) -> None:
    weights = Path(predictor.asset_dir) / "gru_lstm_phat_nang.pt"
    v = db.scalar(select(ModelVersion).where(ModelVersion.version == DEPLOYED))
    if v is None:
        v = ModelVersion(name="GRU + K-Means", version=DEPLOYED, status="inactive",
                         trained_on="Train 796 BN (train.xlsx); Val 171; Test 171",
                         description="Tập hợp 5 seed GRU (hidden=64, 1 lớp, dropout 0.3) + K-Means 3 cụm. "
                                     "Trọng số gru_lstm_phat_nang.pt; tái hiện MAE Train/Val/Test = 3.693/4.179/3.508.")
        db.add(v)
    if predictor.ready:
        v.status = "active"
        v.weights_sha256 = _sha256(weights)
        v.deployed_at = v.deployed_at or datetime.now(timezone.utc)
    else:
        v.status = "inactive"
    r = db.scalar(select(ModelVersion).where(ModelVersion.version == REPORTED))
    if r is None:
        db.add(ModelVersion(
            name="GRU + K-Means (phiên bản báo cáo)", version=REPORTED, status="pending_weights",
            trained_on="Train 796 BN; Val 171; Test 171",
            description="Phiên bản 'GRU + chống quá khớp' (MAE 3.780/4.205/3.562) ghi trong báo cáo. "
                        "Chưa có trọng số trong thư mục dự án nên CHƯA thể triển khai."))
    db.commit()
