"""Dịch vụ dự đoán: GRU (eGFR tương lai) -> đặc trưng xu hướng -> K-Means (nhóm tiến triển).

Toàn bộ logic ở đây bám sát GRU.ipynb (ô 6, 8, 9). Không huấn luyện lại, không tạo kết quả giả:
nếu thiếu tệp mô hình thì `Predictor.ready` là False và `predict` ném ModelNotReady.
"""
from __future__ import annotations

import json
import logging
import math
import warnings
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import torch

from .network import Seq2SeqNangCao, TapHop, dac_trung_chuoi

log = logging.getLogger(__name__)

MONTHS_HISTORY = [0, 6, 12]
MONTHS_PREDICT = [18, 24, 30, 36]
THOI_GIAN = np.array([0, 0.5, 1, 1.5, 2, 2.5, 3])  # năm, ứng với 0M..36M
STAGES = ["G1", "G2", "G3a", "G3b", "G4", "G5"]
CONFIDENCE = {1: "Thấp", 2: "Trung bình", 3: "Cao"}
REQUIRED_FILES = ("gru_lstm_phat_nang.pt", "phan_cum.joblib", "tham_so_tien_xu_ly.json")


class ModelNotReady(RuntimeError):
    """Thiếu tệp mô hình / bộ tiền xử lý."""


def ckd_stage(egfr: float) -> str:
    if egfr >= 90:
        return "G1"
    if egfr >= 60:
        return "G2"
    if egfr >= 45:
        return "G3a"
    if egfr >= 30:
        return "G3b"
    if egfr >= 15:
        return "G4"
    return "G5"


def slope_per_year(y: np.ndarray) -> float:
    """Độ dốc đường thẳng khớp nhất (theo năm) qua các điểm không NaN; NaN nếu < 2 điểm."""
    ok = ~np.isnan(y)
    if ok.sum() < 2:
        return float("nan")
    t = THOI_GIAN[ok]
    return float(((t - t.mean()) * (y[ok] - y[ok].mean())).sum() / ((t - t.mean()) ** 2).sum())


@dataclass
class PredictionOutput:
    history: dict[int, float | None]      # tháng -> eGFR đo thật (None nếu không đo)
    predicted: dict[int, float]           # tháng -> eGFR dự đoán
    last_observed: float
    slope_per_year: float
    total_change: float
    cluster: str
    risk_score: float
    stage_36m: str
    stages: dict[int, str]
    n_visits: int
    confidence: str
    warnings: list[str]
    features_z: dict[str, float]


class Predictor:
    def __init__(self, asset_dir: str | Path, device: str = "cpu"):
        self.asset_dir = Path(asset_dir)
        self.device = device
        self.ready = False
        self.error: str | None = None
        self.version_info: dict[str, Any] = {}
        try:
            self._load()
            self.ready = True
        except Exception as exc:  # noqa: BLE001 - báo trạng thái cho /api/health thay vì làm sập app
            self.error = f"{type(exc).__name__}: {exc}"
            log.error("Không nạp được mô hình AI: %s", self.error)

    # ------------------------------------------------------------------ nạp
    def _load(self) -> None:
        missing = [f for f in REQUIRED_FILES if not (self.asset_dir / f).exists()]
        if missing:
            raise ModelNotReady(f"Thiếu tệp mô hình trong {self.asset_dir}: {', '.join(missing)}")

        self.params = json.loads((self.asset_dir / "tham_so_tien_xu_ly.json").read_text(encoding="utf-8"))
        self.static_cols: list[str] = self.params["cot_dau_vao_tinh"]
        ck = torch.load(self.asset_dir / "gru_lstm_phat_nang.pt", map_location=self.device, weights_only=False)
        cfg = ck["GRU"]["cau_hinh"]
        models = []
        for sd in ck["GRU"]["state_dicts"]:
            m = Seq2SeqNangCao("GRU", hidden=cfg["hidden"], layers=cfg["layers"], dropout=cfg["dropout"])
            m.load_state_dict(sd)
            models.append(m)
        self.gru = TapHop(models).to(self.device).eval()
        self.mu, self.sd = float(ck["mu"]), float(ck["sd"])

        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            pc = joblib.load(self.asset_dir / "phan_cum.joblib")
        if pc["MO_HINH_CHON"] != "KMeans":
            raise ModelNotReady(f"Mô hình phân cụm được chọn là {pc['MO_HINH_CHON']}, dịch vụ này chỉ hỗ trợ KMeans.")
        self.pc = pc
        self.cluster_cols: list[str] = pc["COT_VAO"]
        self.kmeans = pc["kmeans"]
        self.cluster_names: dict[int, str] = pc["ten_km"]
        self.bad_cluster = next(c for c, n in self.cluster_names.items() if n == "Chuyển biến xấu")
        self.fast_decline_threshold = float(pc["NGUONG_NHANH"])
        self.version_info = {
            "gru_config": cfg,
            "n_gru_seeds": len(models),
            "cluster_model": pc["MO_HINH_CHON"],
            "n_clusters": int(pc["K"]),
            "fast_decline_threshold": self.fast_decline_threshold,
        }

    # ------------------------------------------------------- tiền xử lý thô -> z
    def raw_to_model_inputs(self, raw: dict[str, Any]) -> tuple[np.ndarray, np.ndarray]:
        """Chuyển dữ liệu lâm sàng thô sang đúng đầu vào mô hình.

        Trả về (Vh[3], S[13]) ở thang z-score, theo thứ tự cột trong tham_so_tien_xu_ly.json.
        Tham số z-score lấy từ tập Train (đúng như lúc huấn luyện).
        """
        z = self.params["zscore_lam_sang"]

        def zs(name: str, v: float) -> float:
            return (v - z[name]["mean"]) / z[name]["std"]

        upcr = raw.get("upcr")
        upcr_missing = upcr is None
        if upcr_missing:
            upcr = self.params["dien_thieu"]["UPCR"]  # giá trị điền thiếu cố định của tập Train
        etiology = int(raw["etiology"])
        static = {
            "age_z": zs("age", float(raw["age"])),
            "gender_2": 1.0 if int(raw["gender"]) == 2 else 0.0,
            "hypertension": float(bool(raw["hypertension"])),
            "diabetes": float(bool(raw["diabetes"])),
            "prevalence of CVD": float(bool(raw["cvd"])),
            "etiology_1": float(etiology == 1),
            "etiology_2": float(etiology == 2),
            "etiology_3": float(etiology == 3),
            "etiology_4": float(etiology == 4),
            "log1p_UPCR_z": zs("UPCR", math.log1p(float(upcr))),
            "UPCR_thieu": 1.0 if upcr_missing else 0.0,
            "Alb_z": zs("Alb", float(raw["albumin"])),
            "SBP_z": zs("SBP", float(raw["sbp"])),
        }
        S = np.array([static[c] for c in self.static_cols], dtype=np.float32)

        vh = np.full(3, np.nan, dtype=np.float32)
        for i, key in enumerate(("egfr_0m", "egfr_6m", "egfr_12m")):
            v = raw.get(key)
            if v is not None:
                vh[i] = (float(v) - self.mu) / self.sd
        if np.isnan(vh[0]):
            raise ValueError("Thiếu eGFR tại tháng 0 (bắt buộc).")
        return vh, S

    # ------------------------------------------------------------- lõi dự đoán
    def predict_arrays(self, Vh: np.ndarray, S: np.ndarray) -> dict[str, np.ndarray]:
        """Lõi dùng chung cho dự đoán thật và kiểm chứng offline. Vh (N,3) có NaN, S (N,13)."""
        if not self.ready:
            raise ModelNotReady(self.error or "Mô hình chưa sẵn sàng")
        vh = torch.tensor(Vh, dtype=torch.float32)
        s = torch.tensor(S, dtype=torch.float32)
        ln = torch.full((len(vh),), 3, dtype=torch.long)
        with torch.no_grad():
            du = self.gru(vh.to(self.device), ln.to(self.device), s.to(self.device))[:, :4].cpu().numpy()
        du = du * self.sd + self.mu
        _, last, _ = dac_trung_chuoi(vh, ln)
        last = last.numpy() * self.sd + self.mu
        ls = vh.numpy() * self.sd + self.mu
        Y = np.concatenate([ls, du], axis=1)
        slope = np.array([slope_per_year(r) for r in Y])
        total = du[:, 3] - last
        # cột 2-4 của đầu vào phân cụm: log1p_UPCR_z, Alb_z, SBP_z
        col = {c: self.static_cols.index(c) for c in ("log1p_UPCR_z", "Alb_z", "SBP_z")}
        feats = {"do_doc": slope, "thay_doi_tong": total, **{c: S[:, i] for c, i in col.items()}}
        import pandas as pd  # cục bộ: chỉ cần để clip theo đúng Series phân vị đã lưu

        df = pd.DataFrame({c: feats[c] for c in self.cluster_cols})
        df = df.clip(lower=self.pc["can_duoi"], upper=self.pc["can_tren"], axis=1)
        X = self.pc["scaler"].transform(df.values)
        labels = self.kmeans.predict(X)
        risk = -self.kmeans.transform(X)[:, self.bad_cluster]
        return {"du_doan": du, "lich_su": ls, "last": last, "do_doc": slope, "thay_doi_tong": total,
                "cluster_id": labels, "risk": risk, "features": df.values}

    # ----------------------------------------------------------- dự đoán 1 bệnh nhân
    def predict(self, raw: dict[str, Any]) -> PredictionOutput:
        Vh, S = self.raw_to_model_inputs(raw)
        r = self.predict_arrays(Vh[None, :], S[None, :])
        du, ls = r["du_doan"][0], r["lich_su"][0]
        n_visits = int((~np.isnan(ls)).sum())
        cluster = self.cluster_names[int(r["cluster_id"][0])]
        stage36 = ckd_stage(float(du[3]))
        warns: list[str] = []
        if cluster == "Chuyển biến xấu":
            warns.append("eGFR dự kiến giảm nhanh hơn so với phần lớn bệnh nhân trong dữ liệu huấn luyện.")
        if stage36 in ("G4", "G5"):
            warns.append("eGFR dự đoán ở tháng 36 nằm trong khoảng G4–G5; cần được nhân viên y tế đánh giá.")
        if n_visits == 1:
            warns.append("Chỉ có 1 lần đo eGFR – độ tin cậy thấp, nên tái khám để cập nhật dữ liệu.")
        elif n_visits == 2:
            warns.append("Thiếu 1 lần đo eGFR – độ tin cậy ở mức trung bình.")
        if raw.get("upcr") is None:
            warns.append("Chưa có UPCR: hệ thống dùng giá trị điền thiếu cố định của tập huấn luyện (cờ UPCR_thieu = 1).")
        return PredictionOutput(
            history={m: (None if np.isnan(ls[i]) else round(float(ls[i]), 3)) for i, m in enumerate(MONTHS_HISTORY)},
            predicted={m: round(float(du[i]), 3) for i, m in enumerate(MONTHS_PREDICT)},
            last_observed=round(float(r["last"][0]), 3),
            slope_per_year=round(float(r["do_doc"][0]), 3),
            total_change=round(float(r["thay_doi_tong"][0]), 3),
            cluster=cluster,
            risk_score=round(float(r["risk"][0]), 4),
            stage_36m=stage36,
            stages={m: ckd_stage(float(du[i])) for i, m in enumerate(MONTHS_PREDICT)},
            n_visits=n_visits,
            confidence=CONFIDENCE[n_visits],
            warnings=warns,
            features_z={c: round(float(v), 4) for c, v in zip(self.cluster_cols, r["features"][0])},
        )
