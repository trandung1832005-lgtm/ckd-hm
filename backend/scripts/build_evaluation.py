"""Sinh app/data/evaluation.json từ trọng số ĐANG TRIỂN KHAI + dữ liệu Train/Val/Test gốc (offline).

Usage: python scripts/build_evaluation.py <thu_muc_Demo_HM>
Mọi chỉ số được tính lại bằng đúng định nghĩa trong GRU.ipynb (ô 9-10); không dùng dữ liệu bệnh nhân người dùng.
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import kruskal
from sklearn.metrics import confusion_matrix, roc_auc_score

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from app.ml.predictor import Predictor, ckd_stage, slope_per_year, STAGES  # noqa: E402

demo = Path(sys.argv[1] if len(sys.argv) > 1 else "../../Demo_HM")
pr = Predictor(ROOT / "ml_assets")
assert pr.ready, pr.error
MOC = [18, 24, 30, 36]
NAMES = ["Chuyển biến xấu", "Ổn định", "Cải thiện"]
res = {"sets": {}}
RES = {}
for name, label in (("train", "Train"), ("val", "Validation"), ("test", "Test")):
    df = pd.read_excel(demo / f"{name}.xlsx")
    Vh = np.stack([df.eGFR_0M_in, np.where(df.obs_6M == 1, df.eGFR_6M_in, np.nan),
                   np.where(df.obs_12M == 1, df.eGFR_12M_in, np.nan)], 1)
    r = pr.predict_arrays(Vh, df[pr.static_cols].values)
    P = r["du_doan"]
    Y = df[["y_18M", "y_24M", "y_30M", "y_36M"]].values * pr.sd + pr.mu
    m = ~np.isnan(Y)
    e = (Y - P)
    ee = e[m]
    reg = dict(n_patients=int(m.any(1).sum()), n_values=int(m.sum()),
               mae=float(np.abs(ee).mean()), rmse=float(np.sqrt((ee ** 2).mean())),
               r2=float(1 - (ee ** 2).sum() / ((Y[m] - Y[m].mean()) ** 2).sum()),
               within5=float((np.abs(ee) <= 5).mean()), within10=float((np.abs(ee) <= 10).mean()),
               bias=float(ee.mean()),
               per_month={str(mo): dict(n=int(m[:, k].sum()), mae=float(np.abs(e[:, k][m[:, k]]).mean()),
                                        rmse=float(np.sqrt((e[:, k][m[:, k]] ** 2).mean())))
                          for k, mo in enumerate(MOC)})
    # MAE theo giai đoạn eGFR THẬT
    st_true = np.array([[ckd_stage(v) if not np.isnan(v) else "" for v in row] for row in Y])
    reg["mae_by_stage"] = {g: dict(n=int(((st_true == g) & m).sum()),
                                   mae=float(np.abs(e[(st_true == g) & m]).mean()))
                           for g in STAGES if ((st_true == g) & m).sum() > 0}
    # Giai đoạn 36M
    k36 = m[:, 3]
    gd_t = np.array([STAGES.index(ckd_stage(v)) for v in Y[k36, 3]])
    gd_p = np.array([STAGES.index(ckd_stage(v)) for v in P[k36, 3]])
    reg["stage36"] = dict(n=int(k36.sum()), exact=float((gd_t == gd_p).mean()), within1=float((np.abs(gd_t - gd_p) <= 1).mean()))

    # Phân cụm
    ls = r["lich_su"]
    slope_true = np.array([slope_per_year(row) for row in np.concatenate([ls, Y], 1)])
    has_future = m.any(1)
    slope_true[~has_future] = np.nan
    co = ~np.isnan(slope_true)
    cl = np.array([pr.cluster_names[i] for i in r["cluster_id"]])
    groups = [slope_true[co & (cl == nme)] for nme in NAMES]
    H, p = kruskal(*groups)
    n = sum(len(g) for g in groups)
    fast = (slope_true[co] <= pr.fast_decline_threshold).astype(int)
    pred_bad = (cl[co] == "Chuyển biến xấu")
    tn, fp, fn, tp = confusion_matrix(fast, pred_bad.astype(int), labels=[0, 1]).ravel()
    cluster = dict(
        counts={nme: int((cl == nme).sum()) for nme in NAMES}, n_eval=int(co.sum()), n_fast=int(fast.sum()),
        mean_true_slope={nme: float(g.mean()) for nme, g in zip(NAMES, groups)},
        eta2=float(max((H - 2) / (n - 3), 0)), kruskal_p=float(p),
        order_ok=bool(np.all(np.diff([g.mean() for g in groups]) > 0)),
        auc=float(roc_auc_score(fast, pred_bad.astype(int))), auc_distance=float(roc_auc_score(fast, r["risk"][co])),
        accuracy=float((tp + tn) / (tp + tn + fp + fn)), sensitivity=float(tp / (tp + fn)) if tp + fn else None,
        specificity=float(tn / (tn + fp)) if tn + fp else None,
        confusion=dict(tn=int(tn), fp=int(fp), fn=int(fn), tp=int(tp)))
    res["sets"][label] = dict(regression=reg, cluster=cluster)
    RES[name] = (Y, P, m)
    if name == "test":  # điểm thực tế vs dự đoán (ẩn danh, không kèm ID)
        res["scatter_test"] = [dict(month=mo, actual=round(float(Y[i, k]), 2), predicted=round(float(P[i, k]), 2))
                               for k, mo in enumerate(MOC) for i in np.where(m[:, k])[0]]
# E. Độ tin cậy (ô 10): khoảng dự đoán 90% lấy từ phân vị phần dư VALIDATION, kiểm tra độ phủ trên TEST
Yv, Pv, Mv = RES["val"]
Yt, Pt, Mt = RES["test"]
interval = []
for k, mo in enumerate(MOC):
    lo, hi = np.quantile((Yv - Pv)[:, k][Mv[:, k]], [0.05, 0.95])
    cov = np.mean((Yt[:, k][Mt[:, k]] >= Pt[:, k][Mt[:, k]] + lo) & (Yt[:, k][Mt[:, k]] <= Pt[:, k][Mt[:, k]] + hi))
    interval.append(dict(month=mo, lower=float(lo), upper=float(hi), half_width=float((hi - lo) / 2), coverage=float(cov)))
y_f, p_f = Yt[Mt], Pt[Mt]
edges = np.unique(np.quantile(p_f, np.linspace(0, 1, 11)))
grp = np.clip(np.digitize(p_f, edges[1:-1]), 0, len(edges) - 2)
cal = pd.DataFrame({"p": p_f, "y": y_f, "b": grp}).groupby("b").agg(p_mean=("p", "mean"), y_mean=("y", "mean"), y_sd=("y", "std"), n=("y", "size"))
res["reliability"] = dict(
    interval_90=interval,
    interval_note="Khoảng 90% = phân vị 5%-95% của phần dư (thực tế - dự đoán) trên Validation; độ phủ đo trên Test. Đây là khoảng thực nghiệm, chưa phải khoảng tin cậy thống kê.",
    calibration=[dict(bin=int(i), p_mean=float(r.p_mean), y_mean=float(r.y_mean), y_sd=None if np.isnan(r.y_sd) else float(r.y_sd), n=int(r.n)) for i, r in cal.iterrows()])
res["fast_decline_threshold"] = pr.fast_decline_threshold
json.dump(res, open(ROOT / "app" / "data" / "evaluation_computed.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
for k, v in res["sets"].items():
    c = v["cluster"]
    print(k, "MAE %.3f RMSE %.3f R2 %.3f" % (v["regression"]["mae"], v["regression"]["rmse"], v["regression"]["r2"]),
          "| eta2 %.3f AUC %.3f acc %.3f sens %.3f spec %.3f" % (c["eta2"], c["auc"], c["accuracy"], c["sensitivity"] or -1, c["specificity"] or -1),
          c["counts"], c["confusion"])
