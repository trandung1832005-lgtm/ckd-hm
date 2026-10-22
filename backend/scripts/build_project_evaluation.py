"""Đóng gói các CSV kết quả của notebook (Demo_HM) thành app/data/evaluation_project.json.

Usage: python scripts/build_project_evaluation.py <thu_muc_Demo_HM>
Chỉ đọc số liệu đã được notebook xuất ra; không tính lại.
"""
import json
import sys
from pathlib import Path

import pandas as pd

demo = Path(sys.argv[1] if len(sys.argv) > 1 else "../../Demo_HM")
out = Path(__file__).resolve().parents[1] / "app" / "data" / "evaluation_project.json"
rd = lambda f: pd.read_csv(demo / f)
tbl = lambda f: {r[0]: dict(zip(rd(f).columns[1:], r[1:])) for r in rd(f).itertuples(index=False)}

lc = rd("learning_curve_du_lieu.csv").groupby("so_bn")[["train", "val"]].agg(["mean", "std"]).reset_index()
lc.columns = ["so_bn", "train_mean", "train_std", "val_mean", "val_std"]
res = {
    "learning_epoch": rd("learning_curve_epoch.csv").round(4).to_dict("records"),
    "learning_data": lc.round(4).to_dict("records"),
    "learning_note": "Huấn luyện lại chỉ để vẽ đường cong (seed 0 theo epoch; 3 seed theo lượng dữ liệu). Không dùng làm mô hình triển khai.",
    "robustness": {"Validation": rd("do_ben_kham_thieu_he_thong_val.csv").round(4).to_dict("records"),
                   "Test": rd("do_ben_kham_thieu_test.csv").round(4).to_dict("records")},
    "final_summary": tbl("tong_hop_cuoi_train_val_test.csv"),
    "accuracy_train_val": tbl("ty_le_chinh_xac_train_val.csv"),
    "sample_counts": [{"name": r[0], "Train": str(r[1]), "Validation": str(r[2])} for r in rd("so_mau_danh_gia.csv").itertuples(index=False)],
    "cluster_experiments": rd("nhat_ky_thi_nghiem_phan_cum.csv").to_dict("records"),
}
out.write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
print("ok", {k: (len(v) if hasattr(v, "__len__") else v) for k, v in res.items()})
