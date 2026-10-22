import { Download } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import {
  Bar, BarChart, CartesianGrid, ComposedChart, ErrorBar, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer,
  Scatter, ScatterChart, Tooltip, XAxis, YAxis,
} from 'recharts'
import { Alert, Button, Card, PageTitle, Spinner, StatusBadge, Table, Td, useAsync } from '../../components/ui'
import { api, download } from '../../lib/api'
import { CLUSTER_ORDER, fmtDateTime, pct } from '../../lib/labels'
import type { Evaluation } from '../../lib/types'

/* eslint-disable @typescript-eslint/no-explicit-any */
const SETS = ['Train', 'Validation', 'Test'] as const
const C = { train: '#94a3b8', val: '#475569', test: '#0f766e', warn: '#dc2626', gru: '#1565c0', lstm: '#e65100' }
const f3 = (v: number) => v.toFixed(3)
const TIP: Record<string, string> = {
  MAE: 'Sai số tuyệt đối trung bình giữa eGFR thực tế và dự đoán. Càng thấp càng tốt.',
  RMSE: 'Căn bậc hai sai số bình phương trung bình; phạt nặng các sai số lớn. Càng thấp càng tốt.',
  'R²': 'Tỷ lệ phương sai eGFR được mô hình giải thích. Càng gần 1 càng tốt.',
  AUC: 'Khả năng phân biệt bệnh nhân suy giảm nhanh với phần còn lại (0.5 = ngẫu nhiên, 1 = hoàn hảo). Cao hơn tốt hơn.',
  'η²': 'Mức các nhóm khác nhau về tốc độ eGFR thực tế (Kruskal–Wallis). Cao hơn = nhóm tách biệt hơn.',
  ARI: 'Độ ổn định của cụm khi lấy mẫu lại (Adjusted Rand Index). Cao hơn = ổn định hơn.',
  Silhouette: 'Độ gọn và tách biệt của cụm (−1 đến 1). Cao hơn tốt hơn.',
  'Davies–Bouldin': 'Mức chồng lấn giữa các cụm. THẤP hơn tốt hơn.',
}
const Tip = ({ k }: { k: string }) => <abbr title={TIP[k]} className="cursor-help underline decoration-dotted">{k}</abbr>
const Chart = ({ h = 300, label, children }: { h?: number; label: string; children: ReactNode }) => (
  <div style={{ height: h }} role="img" aria-label={label}><ResponsiveContainer>{children as any}</ResponsiveContainer></div>
)
const Note = ({ children }: { children: ReactNode }) => <p className="mt-2 text-xs text-slate-500">{children}</p>

const TABS = [
  ['overview', 'Tổng quan'], ['experiments', 'Experiment Tracking'], ['learning', 'Learning Curve'],
  ['training', 'Kết quả huấn luyện'], ['testing', 'Kết quả kiểm thử'], ['reliability', 'Độ tin cậy'],
] as const
type Tab = (typeof TABS)[number][0]

export default function ModelEvaluation() {
  const ev = useAsync(() => api<Evaluation>('/api/admin/model-evaluation'), [])
  const ver = useAsync(() => api<any>('/api/admin/model-versions'), [])
  const [tab, setTab] = useState<Tab>('overview')
  if (ev.loading || ver.loading) return <Spinner />
  if (!ev.data || !ver.data) return <Alert kind="error">{ev.error ?? ver.error ?? 'Không tải được dữ liệu đánh giá'}</Alert>
  const E = ev.data

  return (
    <>
      <PageTitle title="Đánh giá mô hình AI" subtitle="Chỉ Admin truy cập. Đánh giá offline trên dữ liệu nghiên cứu (Demo_HM), không phải hiệu năng vận hành trực tuyến."
        actions={<Button variant="secondary" onClick={() => download('/api/admin/model-evaluation/export', 'model_evaluation.csv')}><Download className="h-4 w-4" aria-hidden /> Xuất CSV</Button>} />
      <div className="mb-5 flex flex-wrap gap-2" role="tablist" aria-label="Nhóm đánh giá">
        {TABS.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`min-h-10 rounded-lg border px-3 py-1.5 text-sm font-medium ${tab === k ? 'border-brand-700 bg-brand-700 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>{l}</button>))}
      </div>
      <div className="space-y-6">
        {tab === 'overview' && <Overview E={E} ver={ver.data} />}
        {tab === 'experiments' && <Experiments E={E} />}
        {tab === 'learning' && <Learning E={E} />}
        {tab === 'training' && <Training E={E} />}
        {tab === 'testing' && <Testing E={E} />}
        {tab === 'reliability' && <Reliability E={E} />}
      </div>
    </>
  )
}

/* ============================ Tổng quan ============================ */
function Overview({ E, ver }: { E: Evaluation; ver: any }) {
  const R = E.reported
  const fs = E.project.final_summary
  return (
    <>
      <Alert kind="warn" title="Hai nguồn số liệu chưa trùng khớp">
        {R.caveat} Các bảng hiển thị cả số liệu <b>theo báo cáo</b> (BC) và số liệu <b>tái tính từ trọng số đang triển khai</b>; không trộn lẫn hai nguồn. Các biểu đồ Learning Curve, độ tin cậy và bảng tổng hợp cuối dưới đây đều từ trọng số/notebook đang có trong Demo_HM.
      </Alert>
      <Card title="Thông tin mô hình" actions={<span className="flex items-center gap-2 text-sm">API dự đoán: <StatusBadge status={ver.api.model_ready ? 'active' : 'inactive'} /></span>}>
        <Table head={['Tên', 'Phiên bản', 'Trạng thái', 'Dữ liệu', 'Triển khai', 'SHA-256 trọng số']}>
          {ver.items.map((v: any) => (
            <tr key={v.id}><Td className="font-medium">{v.name}</Td><Td className="font-mono text-xs">{v.version}</Td><Td><StatusBadge status={v.status} /></Td><Td className="text-xs">{v.trained_on}</Td><Td>{fmtDateTime(v.deployed_at)}</Td><Td className="font-mono text-xs">{v.weights_sha256 ? v.weights_sha256.slice(0, 12) + '…' : '—'}</Td></tr>))}
        </Table>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">
          {ver.items.map((v: any) => <li key={v.id}><b>{v.version}</b>: {v.description}</li>)}
          <li>Quy trình: GRU (5 seed gộp) → đặc trưng xu hướng (độ dốc, thay đổi tổng) + UPCR/Albumin/SBP → cắt phân vị 5–95% theo Train → chuẩn hoá → K-Means 3 cụm. Số bệnh nhân: Train {E.dataset.Train}, Validation {E.dataset.Validation}, Test {E.dataset.Test}.</li>
        </ul>
      </Card>
      <Card title="Bảng tổng hợp cuối: Train / Validation / Test (trọng số triển khai)">
        <Table head={['Chỉ số', 'Train', 'Validation', 'Test']}>
          {Object.entries(fs).map(([k, v]) => (<tr key={k}><Td className="font-medium">{k}</Td><Td>{v.Train}</Td><Td>{v.Validation}</Td><Td className="bg-slate-50">{v.Test}</Td></tr>))}
        </Table>
        <Note>Nguồn: tong_hop_cuoi_train_val_test.csv (notebook ô 10, mục F). Test chỉ chạy một lần duy nhất.</Note>
      </Card>
      <Card title="Hồi quy eGFR: báo cáo so với trọng số triển khai (mL/phút/1,73m²)">
        <Table head={['Chỉ số', 'Train (BC)', 'Validation (BC)', 'Test (BC)', 'Train (triển khai)', 'Validation (triển khai)', 'Test (triển khai)']}>
          {([['MAE', 'mae', f3], ['RMSE', 'rmse', f3], ['R²', 'r2', f3], ['Sai số ≤ 5', 'within5', pct], ['Sai số ≤ 10', 'within10', pct]] as const).map(([lab, key, fm]) => (
            <tr key={lab}><Td className="font-medium">{lab in TIP ? <Tip k={lab} /> : lab}</Td>
              {SETS.map((s) => <Td key={'r' + s}>{(fm as any)(R.regression[s][key])}</Td>)}
              {SETS.map((s) => <Td key={'d' + s} className="bg-slate-50">{(fm as any)(E.deployed.sets[s].regression[key])}</Td>)}</tr>))}
        </Table>
        <Note>BC = theo báo cáo (đã được xác nhận). Tỷ lệ sai số ≤ 5/≤ 10 = số giá trị dự đoán (bệnh nhân × mốc 18–36 tháng có eGFR thật) có |sai số| ≤ ngưỡng, chia cho tổng số giá trị có nhãn thật.</Note>
      </Card>
    </>
  )
}

/* ============================ Experiment Tracking ============================ */
function Experiments({ E }: { E: Evaluation }) {
  const R = E.reported
  const testMae = E.deployed.sets.Test.regression.mae
  const rows = R.experiments.map((e, i) => ({ ...e, key: i, label: `TN${e.id} · ${e.model}`, gap: e.train_mae != null ? +(e.val_mae - e.train_mae).toFixed(3) : null }))
  const cc = R.cluster_comparison
  const cmpRows: [string, 'auc' | 'eta2' | 'ari' | 'silhouette' | 'davies_bouldin', boolean][] = [['AUC', 'auc', true], ['η²', 'eta2', true], ['ARI', 'ari', true], ['Silhouette', 'silhouette', true], ['Davies–Bouldin', 'davies_bouldin', false]]
  return (
    <>
      <Card title="Experiment Tracking – nhật ký thí nghiệm dự đoán eGFR (GRU / LSTM)">
        <Chart h={360} label="Biểu đồ cột ngang Validation MAE và Train MAE qua các thí nghiệm">
          <BarChart data={rows} layout="vertical" margin={{ left: 20, right: 40 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis type="number" domain={[3, 5]} tick={{ fontSize: 12 }} label={{ value: 'MAE (mL/phút/1,73m²)', position: 'insideBottom', offset: -2, fontSize: 12 }} />
            <YAxis type="category" dataKey="label" width={80} tick={{ fontSize: 12 }} />
            <Tooltip formatter={(v: any) => (typeof v === 'number' ? v.toFixed(3) : '—')} />
            <Legend />
            <ReferenceLine x={testMae} stroke={C.test} strokeDasharray="5 4" label={{ value: `Test (triển khai) ${testMae.toFixed(3)}`, position: 'top', fontSize: 11, fill: C.test }} />
            <Bar isAnimationActive={false} dataKey="val_mae" name="Validation MAE" fill={C.val} label={{ position: 'right', fontSize: 10, formatter: (v: any) => Number(v).toFixed(3) }} />
            <Bar isAnimationActive={false} dataKey="train_mae" name="Train MAE" fill={C.train} label={{ position: 'right', fontSize: 10, formatter: (v: any) => (v == null ? '' : Number(v).toFixed(3)) }} />
          </BarChart>
        </Chart>
        <Note>Trục bắt đầu từ 3.0 để thấy rõ khác biệt. Đường chấm = MAE Test của trọng số đang triển khai ({testMae.toFixed(3)}); số theo báo cáo cho phiên bản “chống quá khớp” là {R.regression.Test.mae.toFixed(3)}.</Note>
        <div className="mt-4">
          <Table head={['TN', 'Mô hình', 'Tên', 'Val MAE', 'Train MAE', 'Khoảng cách Val−Train', 'Số tham số', 'Ghi chú']}>
            {rows.map((e) => (<tr key={e.key} className={e.name.includes('được chọn') ? 'bg-brand-50' : ''}><Td>{e.id}</Td><Td>{e.model}</Td><Td className="font-medium">{e.name}</Td><Td>{f3(e.val_mae)}</Td><Td>{e.train_mae != null ? f3(e.train_mae) : '—'}</Td><Td>{e.gap ?? '—'}</Td><Td>{e.params ?? '—'}</Td><Td className="text-xs">{e.note}</Td></tr>))}
          </Table>
        </div>
        <Note>Khoảng cách Val−Train càng nhỏ càng ít quá khớp: TN3 GRU 0.580 → TN4 GRU 0.425 sau khi thêm phạt khoảng cách và regularization, đổi lại Val MAE tăng nhẹ 4.101 → 4.205.</Note>
      </Card>

      <Card title="Experiment Tracking – phân cụm: K-Means so với GMM">
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <Table head={['Chỉ số', 'GMM', 'K-Means', 'Nhận xét']}>
              {cmpRows.map(([k, key, hi]) => {
                const g = cc.GMM[key], m = cc.KMeans[key]
                const better = Math.abs(m - g) < 0.005 ? 'Tương đương' : (hi ? m > g : m < g) ? 'K-Means tốt hơn' : 'GMM tốt hơn'
                return <tr key={k}><Td className="font-medium"><Tip k={k} /></Td><Td>{f3(g)}</Td><Td>{f3(m)}</Td><Td className="text-xs">{better}{!hi && ' (thấp hơn là tốt)'}</Td></tr>
              })}
            </Table>
            <Note>{cc.note} K-Means được chọn vì thắng nhiều tiêu chí hơn; AUC hai mô hình gần như bằng nhau.</Note>
          </div>
          <Chart h={260} label="Biểu đồ cột so sánh GMM và K-Means theo AUC, η², ARI, Silhouette">
            <BarChart data={cmpRows.filter(([, , hi]) => hi).map(([k, key]) => ({ metric: k, GMM: cc.GMM[key], 'K-Means': cc.KMeans[key] }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="metric" tick={{ fontSize: 12 }} /><YAxis domain={[0, 1]} /><Tooltip /><Legend />
              <Bar isAnimationActive={false} dataKey="GMM" fill={C.train} label={{ position: 'top', fontSize: 10, formatter: (v: any) => Number(v).toFixed(2) }} />
              <Bar isAnimationActive={false} dataKey="K-Means" fill={C.test} label={{ position: 'top', fontSize: 10, formatter: (v: any) => Number(v).toFixed(2) }} />
            </BarChart>
          </Chart>
        </div>
      </Card>
    </>
  )
}

/* ============================ Learning Curve ============================ */
function Learning({ E }: { E: Evaluation }) {
  const P = E.project
  const ep = P.learning_epoch
  const best = ep.reduce((b, r) => (r.diem < b.diem ? r : b), ep[0])
  const ld = P.learning_data.map((r) => ({ ...r, train_err: r.train_std, val_err: r.val_std }))
  const last = ld[ld.length - 1]
  return (
    <>
      <Alert kind="info">{P.learning_note}</Alert>
      <Card title="Learning Curve theo epoch (MAE, mL/phút/1,73m²)">
        <Chart h={320} label="Đường cong học tập theo epoch: Train MAE, Validation MAE và điểm phạt">
          <LineChart data={ep} margin={{ right: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="epoch" tick={{ fontSize: 12 }} label={{ value: 'Epoch', position: 'insideBottom', offset: -2, fontSize: 12 }} />
            <YAxis domain={['auto', 'auto']} tick={{ fontSize: 12 }} /><Tooltip formatter={(v: any) => Number(v).toFixed(3)} /><Legend verticalAlign="top" />
            <ReferenceLine x={best.epoch} stroke={C.warn} strokeDasharray="4 4" label={{ value: `Tốt nhất: epoch ${best.epoch}`, position: 'insideTopRight', fontSize: 11, fill: C.warn }} />
            <Line isAnimationActive={false} type="monotone" dataKey="train" name="Train MAE" stroke={C.gru} dot={false} strokeWidth={2} />
            <Line isAnimationActive={false} type="monotone" dataKey="val" name="Validation MAE" stroke={C.lstm} dot={false} strokeWidth={2} />
            <Line isAnimationActive={false} type="monotone" dataKey="diem" name="Điểm phạt (dùng cho early stopping)" stroke="#64748b" strokeDasharray="5 4" dot={false} />
          </LineChart>
        </Chart>
        <Note>Điểm phạt = Val MAE + 0.5 × max(Val − Train, 0); mô hình được chọn ở epoch có điểm phạt thấp nhất (epoch {best.epoch}: Train {best.train.toFixed(3)}, Val {best.val.toFixed(3)}), sau đó dừng sớm khi không cải thiện. Chạy {ep.length} epoch.</Note>
      </Card>
      <Card title="Learning Curve theo lượng dữ liệu huấn luyện">
        <Chart h={320} label="Đường cong học tập theo lượng dữ liệu: MAE Train và Validation theo số bệnh nhân">
          <ComposedChart data={ld} margin={{ right: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="so_bn" type="number" domain={[100, 850]} ticks={ld.map((r) => r.so_bn)} tick={{ fontSize: 12 }} label={{ value: 'Số bệnh nhân Train', position: 'insideBottom', offset: -2, fontSize: 12 }} />
            <YAxis domain={[3.2, 5]} tick={{ fontSize: 12 }} /><Tooltip formatter={(v: any) => Number(v).toFixed(3)} /><Legend verticalAlign="top" />
            <Line isAnimationActive={false} dataKey="train_mean" name="Train MAE (TB 3 seed)" stroke={C.gru} strokeWidth={2} />
            <Line isAnimationActive={false} dataKey="val_mean" name="Validation MAE (TB 3 seed)" stroke={C.lstm} strokeWidth={2} />
          </ComposedChart>
        </Chart>
        <Table head={['Số BN Train', 'Train MAE (TB)', 'Train SD', 'Validation MAE (TB)', 'Validation SD', 'Val − Train']}>
          {ld.map((r) => (<tr key={r.so_bn}><Td>{r.so_bn}</Td><Td>{f3(r.train_mean)}</Td><Td>{f3(r.train_std)}</Td><Td>{f3(r.val_mean)}</Td><Td>{f3(r.val_std)}</Td><Td>{(r.val_mean - r.train_mean).toFixed(3)}</Td></tr>))}
        </Table>
        <Note>Khi tăng dữ liệu từ 20% lên 100%, Val MAE giảm {ld[0].val_mean.toFixed(2)} → {last.val_mean.toFixed(2)} và khoảng cách Val−Train thu hẹp từ {(ld[0].val_mean - ld[0].train_mean).toFixed(2)} xuống {(last.val_mean - last.train_mean).toFixed(2)}. Đường Validation vẫn đi xuống ở 100% dữ liệu, gợi ý thêm dữ liệu có thể còn cải thiện mô hình.</Note>
      </Card>
    </>
  )
}

/* ============================ Kết quả huấn luyện (Train/Val) ============================ */
function Training({ E }: { E: Evaluation }) {
  const P = E.project, D = E.deployed
  const monthData = ['18', '24', '30', '36'].map((m) => ({ month: `Tháng ${m}`, Train: +D.sets.Train.regression.per_month![m].mae.toFixed(2), Validation: +D.sets.Validation.regression.per_month![m].mae.toFixed(2) }))
  return (
    <>
      <Card title="Kết quả huấn luyện toàn dự án (Train và Validation)">
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <Table head={['Chỉ số', 'Train', 'Validation']}>
              {Object.entries(P.accuracy_train_val).map(([k, v]) => (<tr key={k}><Td className="font-medium">{k}</Td><Td>{v.Train}</Td><Td>{v.Validation}</Td></tr>))}
              {(['GRU – MAE', 'GRU – RMSE', 'GRU – R²', 'KMeans – η²', 'KMeans – AUC suy giảm nhanh'] as const).map((k) => (
                <tr key={k}><Td className="font-medium">{k}</Td><Td>{P.final_summary[k].Train}</Td><Td>{P.final_summary[k].Validation}</Td></tr>))}
            </Table>
          </div>
          <Chart h={280} label="Biểu đồ cột MAE theo mốc thời gian, Train và Validation">
            <BarChart data={monthData}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="month" /><YAxis /><Tooltip /><Legend />
              <Bar isAnimationActive={false} dataKey="Train" fill={C.train} label={{ position: 'top', fontSize: 11 }} /><Bar isAnimationActive={false} dataKey="Validation" fill={C.val} label={{ position: 'top', fontSize: 11 }} /></BarChart>
          </Chart>
        </div>
        <Note>MAE có xu hướng tăng khi dự đoán xa hơn (18 → 36 tháng). Độ nhạy phát hiện suy giảm nhanh trên Validation chỉ 44.0% (Train 55.5%).</Note>
      </Card>
      <Card title="Cỡ mẫu của từng phép đánh giá">
        <Table head={['Phép đánh giá', 'Train', 'Validation']}>
          {P.sample_counts.map((r) => (<tr key={r.name}><Td>{r.name}</Td><Td>{r.Train}</Td><Td>{r.Validation}</Td></tr>))}
        </Table>
      </Card>
    </>
  )
}

/* ============================ Kết quả kiểm thử (Test) ============================ */
function Testing({ E }: { E: Evaluation }) {
  const R = E.reported, D = E.deployed, dt = D.sets.Test.cluster, cm = dt.confusion
  const fs = E.project.final_summary
  const monthData = ['18', '24', '30', '36'].map((m) => ({ month: `Tháng ${m}`, ...Object.fromEntries(SETS.map((s) => [s, +D.sets[s].regression.per_month![m].mae.toFixed(2)])) }))
  const clusterData = CLUSTER_ORDER.map((c) => ({ name: c, ...Object.fromEntries(SETS.map((s) => [s, D.sets[s].cluster.counts[c]])) }))
  return (
    <>
      <Card title="Kết quả kiểm thử toàn dự án trên tập Test (một lần duy nhất)">
        <Table head={['Chỉ số', 'Train', 'Validation', 'Test']}>
          {Object.entries(fs).map(([k, v]) => (<tr key={k}><Td className="font-medium">{k}</Td><Td>{v.Train}</Td><Td>{v.Validation}</Td><Td className="bg-slate-50 font-medium">{v.Test}</Td></tr>))}
        </Table>
        <Note>Trọng số triển khai. Test có {D.sets.Test.regression.n_patients} bệnh nhân có nhãn thật ở ít nhất một mốc ({D.sets.Test.regression.n_values} giá trị). Phân nhóm Test: {CLUSTER_ORDER.map((c) => `${c} ${dt.counts[c]}`).join(' · ')}; thứ tự nhóm theo tốc độ eGFR thật: {dt.order_ok ? 'đúng' : 'sai'}.</Note>
      </Card>

      <Card title="Phát hiện suy giảm nhanh (Test)">
        <Table head={['Chỉ số', 'Theo báo cáo', 'Tái tính (triển khai)']}>
          <tr><Td><Tip k="AUC" /></Td><Td>{f3(R.risk_detection_test.auc)}</Td><Td className="bg-slate-50">{f3(dt.auc)}</Td></tr>
          <tr><Td>Accuracy</Td><Td>{pct(R.risk_detection_test.accuracy)}</Td><Td className="bg-slate-50">{pct(dt.accuracy)}</Td></tr>
          <tr><Td>Sensitivity (độ nhạy)</Td><Td>{pct(R.risk_detection_test.sensitivity)}</Td><Td className="bg-slate-50">{pct(dt.sensitivity)}</Td></tr>
          <tr><Td>Specificity (độ đặc hiệu)</Td><Td>{pct(R.risk_detection_test.specificity)}</Td><Td className="bg-slate-50">{pct(dt.specificity)}</Td></tr>
        </Table>
        <div className="mt-4 grid gap-6 md:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-medium">Ma trận nhầm lẫn – Test, trọng số triển khai (n = {dt.n_eval})</p>
            <table className="w-full max-w-sm border-collapse text-center text-sm" aria-label="Ma trận nhầm lẫn">
              <thead><tr><th></th><th className="border p-2">Dự đoán: không thuộc nhóm xấu</th><th className="border p-2">Dự đoán: Chuyển biến xấu</th></tr></thead>
              <tbody>
                <tr><th className="border p-2 text-left">Thực tế: không suy giảm nhanh</th><td className="border p-2">TN = <b>{cm.tn}</b></td><td className="border p-2">FP = <b>{cm.fp}</b></td></tr>
                <tr><th className="border p-2 text-left">Thực tế: suy giảm nhanh</th><td className="border p-2">FN = <b>{cm.fn}</b></td><td className="border p-2">TP = <b>{cm.tp}</b></td></tr>
              </tbody>
            </table>
          </div>
          <Alert kind="warn" title="Giới hạn cần lưu ý">
            Ngưỡng “suy giảm nhanh” là eGFR ≤ {D.fast_decline_threshold.toFixed(2)} mL/phút/1,73m²/năm, xác định thực nghiệm từ Train (25% thấp nhất tốc độ eGFR thật), không phải ngưỡng chẩn đoán phổ quát. Độ nhạy ~{pct(R.risk_detection_test.sensitivity, 0)} nghĩa là mô hình còn bỏ sót gần một nửa số trường hợp suy giảm nhanh; không dùng nhãn này để loại trừ nguy cơ.
          </Alert>
        </div>
      </Card>

      <Card title="So sánh dự đoán với thực tế (Test, trọng số triển khai)">
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <p className="mb-1 text-sm font-medium">eGFR thực tế so với dự đoán (đường chéo = hoàn hảo)</p>
            <Chart h={320} label="Biểu đồ phân tán eGFR thực tế và dự đoán trên tập Test">
              <ScatterChart margin={{ left: 0, right: 10, top: 10, bottom: 20 }}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" dataKey="actual" name="Thực tế" domain={[0, 120]} label={{ value: 'eGFR thực tế', position: 'insideBottom', offset: -10, fontSize: 12 }} />
                <YAxis type="number" dataKey="predicted" name="Dự đoán" domain={[0, 120]} label={{ value: 'eGFR dự đoán', angle: -90, position: 'insideLeft', fontSize: 12 }} />
                <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 120, y: 120 }]} stroke={C.warn} strokeDasharray="5 5" /><Tooltip cursor={{ strokeDasharray: '3 3' }} />
                <Scatter isAnimationActive={false} data={D.scatter_test} fill={C.test} fillOpacity={0.45} /></ScatterChart>
            </Chart>
          </div>
          <div>
            <p className="mb-1 text-sm font-medium">MAE theo mốc thời gian (Train / Validation / Test)</p>
            <Chart h={320} label="Biểu đồ cột MAE theo mốc thời gian">
              <BarChart data={monthData}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="month" /><YAxis /><Tooltip /><Legend />
                <Bar isAnimationActive={false} dataKey="Train" fill={C.train} /><Bar isAnimationActive={false} dataKey="Validation" fill={C.val} /><Bar isAnimationActive={false} dataKey="Test" fill={C.test} /></BarChart>
            </Chart>
          </div>
          <div className="lg:col-span-2">
            <p className="mb-1 text-sm font-medium">Phân bố nhãn cụm theo tập</p>
            <Chart h={260} label="Biểu đồ cột phân bố nhãn cụm">
              <BarChart data={clusterData}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="name" tick={{ fontSize: 12 }} /><YAxis /><Tooltip /><Legend />
                <Bar isAnimationActive={false} dataKey="Train" fill={C.train} /><Bar isAnimationActive={false} dataKey="Validation" fill={C.val} /><Bar isAnimationActive={false} dataKey="Test" fill={C.test} /></BarChart>
            </Chart>
          </div>
        </div>
      </Card>
    </>
  )
}

/* ============================ Độ tin cậy ============================ */
function Reliability({ E }: { E: Evaluation }) {
  const { reliability: rel, sets } = E.deployed
  const rob = E.project.robustness
  const stage = Object.entries(sets.Test.regression.mae_by_stage!).map(([g, v]) => ({ stage: g, MAE: +v.mae.toFixed(2), n: v.n }))
  const cal = rel.calibration.map((r) => ({ ...r, err: r.y_sd ?? 0 }))
  const robChart = rob.Test.map((r, i) => ({ kich_ban: r.kich_ban, 'MAE Test': +r.mae.toFixed(2), 'MAE Validation': +rob.Validation[i].mae.toFixed(2) }))
  return (
    <>
      <Alert kind="info">Các biểu đồ dưới đây đánh giá mức đáng tin của dự đoán trên tập Test: khoảng dự đoán 90%, hiệu chỉnh (calibration), sai số theo giai đoạn CKD và độ bền khi bệnh nhân khám thiếu. {rel.interval_note}</Alert>
      <Card title="E1. Khoảng dự đoán 90% và độ phủ trên Test">
        <div className="grid gap-6 lg:grid-cols-2">
          <Table head={['Mốc', 'Khoảng (thực tế − dự đoán)', 'Nửa độ rộng ±', 'Độ phủ Test']}>
            {rel.interval_90.map((r) => (<tr key={r.month}><Td>Tháng {r.month}</Td><Td>[{r.lower.toFixed(1)}; {r.upper.toFixed(1)}]</Td><Td>{r.half_width.toFixed(1)}</Td><Td className="font-medium">{pct(r.coverage, 0)}</Td></tr>))}
          </Table>
          <Chart h={240} label="Biểu đồ độ phủ của khoảng dự đoán 90% theo mốc, so với mục tiêu 90%">
            <BarChart data={rel.interval_90.map((r) => ({ month: `Tháng ${r.month}`, 'Độ phủ': +(r.coverage * 100).toFixed(1) }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="month" /><YAxis domain={[0, 100]} unit="%" /><Tooltip formatter={(v: any) => `${v}%`} />
              <ReferenceLine y={90} stroke={C.warn} strokeDasharray="5 4" label={{ value: 'Mục tiêu 90%', position: 'insideTopRight', fontSize: 11, fill: C.warn }} />
              <Bar isAnimationActive={false} dataKey="Độ phủ" fill={C.test} label={{ position: 'top', fontSize: 11, formatter: (v: any) => `${v}%` }} /></BarChart>
          </Chart>
        </div>
        <Note>Độ phủ gần 90% (85–96%) cho thấy khoảng ± này khá hợp lý trên Test, nhưng khoảng khá rộng (±7 → ±11 mL/phút/1,73m² từ 18 đến 36 tháng). Phương pháp chưa được xác thực thống kê nên giao diện bệnh nhân không hiển thị dải bất định.</Note>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="E2. Hiệu chỉnh: dự đoán trung bình so với thực tế trung bình (10 nhóm, Test)">
          <Chart h={300} label="Biểu đồ hiệu chỉnh: eGFR dự đoán trung bình so với thực tế trung bình theo 10 nhóm">
            <ComposedChart data={cal} margin={{ right: 12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="p_mean" type="number" domain={[0, 80]} tickFormatter={(v) => Number(v).toFixed(0)} label={{ value: 'eGFR dự đoán trung bình', position: 'insideBottom', offset: -2, fontSize: 12 }} />
              <YAxis domain={[0, 80]} label={{ value: 'eGFR thực tế trung bình', angle: -90, position: 'insideLeft', fontSize: 12 }} /><Tooltip formatter={(v: any) => Number(v).toFixed(1)} />
              <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 80, y: 80 }]} stroke={C.warn} strokeDasharray="5 5" />
              <Line isAnimationActive={false} dataKey="y_mean" name="Thực tế TB (± SD)" stroke={C.test} strokeWidth={2} dot={{ r: 4 }}><ErrorBar dataKey="err" stroke={C.test} width={4} /></Line>
            </ComposedChart>
          </Chart>
          <Note>Điểm càng sát đường chéo đỏ thì dự đoán càng được hiệu chỉnh tốt. Mỗi điểm là một nhóm 10% giá trị dự đoán (n ≈ {cal[0]?.n}/nhóm).</Note>
        </Card>
        <Card title="E3. Sai số MAE theo giai đoạn CKD thực tế (Test)">
          <Chart h={300} label="Biểu đồ cột MAE theo giai đoạn eGFR thực tế">
            <BarChart data={stage}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="stage" /><YAxis /><Tooltip /><Bar isAnimationActive={false} dataKey="MAE" fill={C.test} label={{ position: 'top', fontSize: 11 }} /></BarChart>
          </Chart>
          <Note>Số giá trị: {stage.map((s) => `${s.stage}: ${s.n}`).join(' · ')}. Sai số lớn nhất ở G2 (eGFR cao), nơi ít bệnh nhân hơn.</Note>
        </Card>
      </div>
      <Card title="E4. Độ bền khi bệnh nhân khám thiếu (chỉ bệnh nhân khám đủ 3 lần)">
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <Table head={['Kịch bản', 'Giữ nhóm (Test)', 'AUC (Test)', 'MAE (Test)', 'MAE (Val)']}>
              {rob.Test.map((r, i) => (<tr key={r.kich_ban}><Td className="font-medium">{r.kich_ban}</Td><Td>{pct(r.giu_nhom)}</Td><Td>{f3(r.auc)}</Td><Td>{r.mae.toFixed(2)}</Td><Td>{rob.Validation[i].mae.toFixed(2)}</Td></tr>))}
            </Table>
          </div>
          <Chart h={260} label="Biểu đồ cột MAE theo kịch bản khám thiếu, Validation và Test">
            <BarChart data={robChart}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="kich_ban" tick={{ fontSize: 11 }} /><YAxis /><Tooltip /><Legend />
              <Bar isAnimationActive={false} dataKey="MAE Validation" fill={C.val} /><Bar isAnimationActive={false} dataKey="MAE Test" fill={C.test} label={{ position: 'top', fontSize: 11 }} /></BarChart>
          </Chart>
        </div>
        <Note>Khi chỉ có lần đo tháng 0, MAE tăng khoảng 3.5 → 5.9 và nhóm bị đổi cho ~10% bệnh nhân; AUC không giảm (dao động 0.66–0.70, mẫu nhỏ). Vì vậy giao diện hạ “độ tin cậy” xuống Trung bình/Thấp khi thiếu lần đo.</Note>
      </Card>
    </>
  )
}
