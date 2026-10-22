"""Kiến trúc mạng GRU/LSTM seq2seq - sao chép NGUYÊN VĂN từ GRU.ipynb (ô 4).

Không chỉnh sửa: tên lớp và tên tham số phải khớp với state_dict trong gru_lstm_phat_nang.pt.
"""
import torch
import torch.nn as nn
from torch.nn.utils.rnn import pack_padded_sequence, pad_packed_sequence


def dac_trung_chuoi(Vh, Ln):
    """Vh (B,3) có NaN, Ln (B,) = số mốc lịch sử.
    Trả về X (B,3,5) = [eGFR điền tiến, obs, dt, độ dốc, thời điểm], last, gap."""
    B = Vh.shape[0]
    t_idx = torch.arange(3, device=Vh.device)
    hop_le = t_idx[None, :] < Ln[:, None]
    obs = (~torch.isnan(Vh)) & hop_le
    Vz = torch.nan_to_num(Vh, nan=0.0)
    zero = torch.zeros(B, device=Vh.device)
    e, dt, sl = [Vz[:, 0]], [zero], [zero]
    for t in (1, 2):
        o = obs[:, t]
        doc = (Vz[:, t] - e[-1]) / (dt[-1] + 0.5)
        sl.append(torch.where(o, doc, sl[-1]))
        e.append(torch.where(o, Vz[:, t], e[-1]))
        dt.append(torch.where(o, zero, dt[-1] + 0.5))
    e, dt, sl = torch.stack(e, 1), torch.stack(dt, 1), torch.stack(sl, 1)
    tabs = (t_idx.float() * 0.5)[None, :].expand(B, 3)
    X = torch.stack([e, obs.float(), dt, sl, tabs], 2) * hop_le[..., None].float()
    i = (Ln - 1)[:, None]
    return X, e.gather(1, i).squeeze(1), dt.gather(1, i).squeeze(1)


class Seq2SeqNangCao(nn.Module):
    def __init__(self, kieu='GRU', n_feat=5, n_stat=13, hidden=64, layers=2, dropout=0.2, n_out=6):
        super().__init__()
        assert kieu in ('GRU', 'LSTM')
        self.kieu, self.n_out = kieu, n_out
        RNN, Cell = (nn.GRU, nn.GRUCell) if kieu == 'GRU' else (nn.LSTM, nn.LSTMCell)

        self.encoder = RNN(n_feat, hidden, num_layers=layers, batch_first=True,
                           dropout=dropout if layers > 1 else 0.0)
        self.stat    = nn.Sequential(nn.Linear(n_stat, hidden), nn.ReLU(), nn.Dropout(dropout))
        self.init_h  = nn.Sequential(nn.Linear(2 * hidden, hidden), nn.Tanh())
        if kieu == 'LSTM':
            self.init_c = nn.Sequential(nn.Linear(2 * hidden, hidden), nn.Tanh())
        self.attn    = nn.Linear(hidden, hidden, bias=False)
        self.decoder = Cell(3 + hidden, hidden)
        self.out     = nn.Sequential(nn.Linear(2 * hidden, hidden), nn.ReLU(),
                                     nn.Dropout(dropout), nn.Linear(hidden, 1))
        self.tuyen_tinh = nn.Linear(3 * n_feat + n_stat + 3, n_out)
        for lop in (self.out[-1], self.tuyen_tinh):              # khởi đầu = "giữ nguyên eGFR cuối"
            nn.init.zeros_(lop.weight); nn.init.zeros_(lop.bias)

    def forward(self, Vh, Ln, S):
        X, last, gap = dac_trung_chuoi(Vh, Ln)
        B = X.shape[0]

        # (a) Nhánh tuyến tính
        lin = self.tuyen_tinh(torch.cat([X.reshape(B, -1), S,
                                         nn.functional.one_hot(Ln - 1, 3).float()], 1))

        # (b) Encoder đọc chuỗi độ dài thay đổi
        goi = pack_padded_sequence(X, Ln.cpu(), batch_first=True, enforce_sorted=False)
        H_goi, trang_thai = self.encoder(goi)
        h_enc = trang_thai[0] if self.kieu == 'LSTM' else trang_thai
        H, _ = pad_packed_sequence(H_goi, batch_first=True, total_length=3)
        hop_le = torch.arange(3, device=X.device)[None, :] < Ln[:, None]

        z = torch.cat([h_enc[-1], self.stat(S)], 1)
        h = self.init_h(z)
        c = self.init_c(z) if self.kieu == 'LSTM' else None

        # (c) Decoder sinh từng mốc tương lai, có Attention
        prev = last.unsqueeze(1)
        tich_luy = torch.zeros_like(prev)
        outs = []
        for k in range(self.n_out):
            diem = (H * self.attn(h).unsqueeze(1)).sum(-1).masked_fill(~hop_le, -1e9)
            ctx = (torch.softmax(diem, 1).unsqueeze(-1) * H).sum(1)
            vao = torch.cat([prev,
                             (gap + 0.5 * (k + 1)).unsqueeze(1),
                             (0.5 * (Ln + k)).float().unsqueeze(1),
                             ctx], 1)
            if self.kieu == 'LSTM':
                h, c = self.decoder(vao, (h, c))
            else:
                h = self.decoder(vao, h)
            tich_luy = tich_luy + self.out(torch.cat([h, ctx], 1))
            pred = last.unsqueeze(1) + lin[:, k:k + 1] + tich_luy
            outs.append(pred)
            prev = pred
        return torch.cat(outs, 1)

class TapHop(nn.Module):
    """Trung bình dự đoán của nhiều mô hình."""
    def __init__(self, models):
        super().__init__(); self.models = nn.ModuleList(models)
    def forward(self, *a):
        return torch.stack([m(*a) for m in self.models]).mean(0)
