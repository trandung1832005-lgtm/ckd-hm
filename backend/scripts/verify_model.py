"""Kiểm chứng offline: chạy Predictor trên test.xlsx/val.xlsx và so với kết quả đã lưu của notebook.

Usage: python scripts/verify_model.py <thu_muc_Demo_HM>
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.ml.predictor import Predictor  # noqa: E402

demo = Path(sys.argv[1] if len(sys.argv) > 1 else "../../Demo_HM")
pr = Predictor(Path(__file__).resolve().parents[1] / "ml_assets")
assert pr.ready, pr.error
cols_s = pr.static_cols
out = {}
for name in ("train", "val", "test"):
    df = pd.read_excel(demo / f"{name}.xlsx")
    Vh = np.stack([df.eGFR_0M_in, np.where(df.obs_6M == 1, df.eGFR_6M_in, np.nan),
                   np.where(df.obs_12M == 1, df.eGFR_12M_in, np.nan)], 1)
    r = pr.predict_arrays(Vh, df[cols_s].values)
    Y = df[["y_18M", "y_24M", "y_30M", "y_36M"]].values * pr.sd + pr.mu
    m = ~np.isnan(Y)
    e = (Y - r["du_doan"])[m]
    ae = np.abs(e)
    print(f"{name:5s} n={len(df)} MAE={ae.mean():.3f} RMSE={np.sqrt((e**2).mean()):.3f} "
          f"R2={1-(e**2).sum()/((Y[m]-Y[m].mean())**2).sum():.3f} <=5:{(ae<=5).mean():.1%} <=10:{(ae<=10).mean():.1%}")
    out[name] = (df, r)

df, r = out["test"]
ref = pd.read_csv(demo / "ket_qua_toan_he_thong_test.csv")
ids = df.ID.astype(int).values
assert (ids == ref.ID.values).all()
for j, c in enumerate(["du_doan_18M", "du_doan_24M", "du_doan_30M", "du_doan_36M"]):
    print(c, "max|diff| vs notebook CSV:", np.abs(r["du_doan"][:, j] - ref[c].values).max())
nm = [pr.cluster_names[i] for i in r["cluster_id"]]
print("nhóm trùng với CSV test:", np.mean(np.array(nm) == ref.nhom.values))
