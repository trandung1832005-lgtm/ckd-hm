import { Download } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, ErrorBar, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer,
  Scatter, ScatterChart, Tooltip, XAxis, YAxis,
} from 'recharts'
import { Alert, Button, Card, PageTitle, Spinner, StatusBadge, useAsync } from '../../components/ui'
import { api, download } from '../../lib/api'
import { CLUSTER_ORDER, fmtDateTime } from '../../lib/labels'
import type { Evaluation } from '../../lib/types'

/* eslint-disable @typescript-eslint/no-explicit-any */
const SETS = ['Train', 'Validation', 'Test'] as const
const C = { train: '#94a3b8', val: '#475569', test: '#0f766e', warn: '#dc2626', gru: '#1565c0', lstm: '#e65100', rep: '#7c3aed' }
const SET_COLOR: Record<string, string> = { Train: C.train, Validation: C.val, Test: C.test }
const MONTHS = ['18', '24', '30', '36']
/** "74.1%" -> 74.1 ; "0.922" -> 0.922 */
const num = (s: string | undefined) => (s == null ? NaN : parseFloat(String(s).replace('%', '')))
const r2 = (v: number) => +v.toFixed(2)
const r3 = (v: number) => +v.toFixed(3)

const lab = (d = 2, unit = '') => ({ position: 'top' as const, fontSize: 10, formatter: (v: any) => (v == null || Number.isNaN(Number(v)) ? '' : `${Number(v).toFixed(d)}${unit}`) })

function Chart({ title, note, h = 300, children, label }: { title: string; note?: ReactNode; h?: number; children: ReactNode; label?: string }) {
  return (
    <Card title={title}>
      <div style={{ height: h }} role="img" aria-label={label ?? title}><ResponsiveContainer>{children as any}</ResponsiveContainer></div>
      {note && <p className="mt-2 text-xs text-slate-500">{note}</p>}
    </Card>
  )
}

/** Cột nhóm: data = [{name, <series>: value}], series = [[key, color]] */
function Grouped({ title, data, series, d = 2, unit = '', domain, note, h = 280, xKey = 'name', ref }: {
  title: string; data: any[]; series: [string, string][]; d?: number; unit?: string; domain?: [number | string, number | string]; note?: ReactNode; h?: number; xKey?: string; ref?: { y: number; label: string }
}) {
  return (
    <Chart title={title} note={note} h={h}>
      <BarChart data={data} margin={{ top: 18, right: 12 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
        <YAxis domain={domain} tick={{ fontSize: 11 }} unit={unit} /><Tooltip formatter={(v: any) => `${Number(v).toFixed(d)}${unit}`} /><Legend wrapperStyle={{ fontSize: 12 }} />
        {ref && <ReferenceLine y={ref.y} stroke={C.warn} strokeDasharray="5 4" label={{ value: ref.label, position: 'insideTopRight', fontSize: 11, fill: C.warn }} />}
        {series.map(([k, c]) => <Bar key={k} isAnimationActive={false} dataKey={k} fill={c} label={lab(d, unit)} />)}
      </BarChart>
    </Chart>
  )
}
const bySet = (rows: [string, (s: string) => number][]) => rows.map(([name, f]) => ({ name, ...Object.fromEntries(SETS.map((s) => [s, f(s)])) }))
const bySetTV = (rows: [string, (s: string) => number][]) => rows.map(([name, f]) => ({ name, Train: f('Train'), Validation: f('Validation') }))
const setSeries: [string, string][] = SETS.map((s) => [s, SET_COLOR[s]])
const Grid2 = ({ children }: { children: ReactNode }) => <div className="grid gap-6 lg:grid-cols-2">{children}</div>

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
  const R = E.reported, D = E.deployed, fs = E.project.final_summary
  const reg = (s: string) => D.sets[s].regression
  const tk = (s: string, k: 'mae' | 'rmse' | 'r2') => r3(reg(s)[k])
  const cmp = (k: 'mae' | 'rmse' | 'r2') => SETS.map((s) => ({ name: s, 'Theo báo cáo': r3(R.regression[s][k]), 'Trọng số triển khai': tk(s, k) }))
  const cmpSeries: [string, string][] = [['Theo báo cáo', C.rep], ['Trọng số triển khai', C.test]]
  const fsv = (k: string) => (s: string) => num(fs[k][s as 'Train'])
  return (
    <>
      <Alert kind="warn" title="Hai nguồn số liệu chưa trùng khớp">
        {R.caveat} Biểu đồ so sánh bên dưới tách rõ <b>theo báo cáo</b> và <b>trọng số triển khai</b>; các biểu đồ còn lại đều từ trọng số/notebook đang có trong Demo_HM.
      </Alert>
      <Card title="Mô hình và phiên bản" actions={<span className="flex items-center gap-2 text-sm">API dự đoán: <StatusBadge status={ver.api.model_ready ? 'active' : 'inactive'} /></span>}>
        <div className="grid gap-3 md:grid-cols-2">
          {ver.items.map((v: any) => (
            <div key={v.id} className="rounded-lg border border-slate-200 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2"><b>{v.name}</b><StatusBadge status={v.status} /></div>
              <p className="mt-1 font-mono text-xs text-slate-500">{v.version}{v.weights_sha256 ? ` · sha256 ${v.weights_sha256.slice(0, 10)}…` : ''}</p>
              <p className="mt-1 text-slate-600">{v.description}</p>
              <p className="mt-1 text-xs text-slate-500">Triển khai: {fmtDateTime(v.deployed_at)}</p>
            </div>))}
        </div>
        <p className="mt-3 text-xs text-slate-500">Quy trình: GRU (5 seed gộp) → độ dốc và thay đổi tổng eGFR + UPCR/Albumin/SBP → cắt phân vị 5–95% theo Train → chuẩn hoá → K-Means 3 cụm. Dữ liệu: Train {E.dataset.Train}, Validation {E.dataset.Validation}, Test {E.dataset.Test} bệnh nhân.</p>
      </Card>

      <p className="text-sm font-semibold text-slate-700">Tổng hợp Train / Validation / Test (trọng số triển khai)</p>
      <Grid2>
        <Grouped title="Sai số hồi quy eGFR (mL/phút/1,73m², thấp hơn là tốt)" data={bySet([['MAE', (s) => tk(s, 'mae')], ['RMSE', (s) => tk(s, 'rmse')]])} series={setSeries} d={2} />
        <Grouped title="R² (cao hơn là tốt)" data={SETS.map((s) => ({ name: s, 'R²': tk(s, 'r2') }))} series={[['R²', C.gru]]} d={3} domain={[0, 1]} />
        <Grouped title="Tỷ lệ dự đoán đạt yêu cầu (%)" h={320}
          data={bySet([['Lệch ≤ 5', fsv('GRU – dự đoán lệch ≤ 5')], ['Lệch ≤ 10', fsv('GRU – dự đoán lệch ≤ 10')], ['Đúng xu hướng', fsv('GRU – đúng xu hướng')],
            ['Đúng G (36 th.)', fsv('Hệ thống – đúng giai đoạn 36M')], ['Lệch ≤ 1 G', fsv('Hệ thống – lệch ≤ 1 giai đoạn')]])} series={setSeries} d={1} unit="%" domain={[0, 105]} />
        <Grouped title="Phân cụm: Accuracy, độ nhạy, độ đặc hiệu (%)" h={320}
          data={bySet([['Accuracy', fsv('KMeans – Accuracy')], ['Độ nhạy', fsv('KMeans – Độ nhạy')], ['Độ đặc hiệu', fsv('KMeans – Độ đặc hiệu')]])}
          series={setSeries} d={1} unit="%" domain={[0, 100]} note="Độ nhạy thấp hơn đáng kể ở Validation và Test: mô hình bỏ sót nhiều ca suy giảm nhanh." />
        <Grouped title="Phân cụm: AUC suy giảm nhanh và η² (0–1)" data={bySet([['AUC', fsv('KMeans – AUC suy giảm nhanh')], ['η²', fsv('KMeans – η²')]])} series={setSeries} d={3} domain={[0, 1]} />
      </Grid2>

      <p className="text-sm font-semibold text-slate-700">Báo cáo so với trọng số triển khai</p>
      <Grid2>
        <Grouped title="MAE: báo cáo so với triển khai" data={cmp('mae')} series={cmpSeries} d={3} domain={[0, 5]} />
        <Grouped title="RMSE: báo cáo so với triển khai" data={cmp('rmse')} series={cmpSeries} d={3} domain={[0, 8]} />
        <Grouped title="R²: báo cáo so với triển khai" data={cmp('r2')} series={cmpSeries} d={3} domain={[0, 1]} />
        <Grouped title="Tỷ lệ sai số ≤ 5 và ≤ 10 (%): báo cáo so với triển khai"
          data={SETS.flatMap((s) => [{ name: `${s} ≤5`, 'Theo báo cáo': r2(R.regression[s].within5 * 100), 'Trọng số triển khai': r2(reg(s).within5 * 100) }, { name: `${s} ≤10`, 'Theo báo cáo': r2(R.regression[s].within10 * 100), 'Trọng số triển khai': r2(reg(s).within10 * 100) }])}
          series={cmpSeries} d={1} unit="%" domain={[0, 105]} note="Chênh lệch nhỏ (≤ 0.1 MAE) nhưng chưa trùng; cần trọng số phiên bản báo cáo để thống nhất." />
      </Grid2>
    </>
  )
}

/* ============================ Experiment Tracking ============================ */
function Experiments({ E }: { E: Evaluation }) {
  const R = E.reported
  const testMae = E.deployed.sets.Test.regression.mae
  const rows = R.experiments.map((e) => ({ ...e, label: `TN${e.id} · ${e.model}`, 'Validation MAE': e.val_mae, 'Train MAE': e.train_mae, 'Khoảng cách Val−Train': e.train_mae != null ? r3(e.val_mae - e.train_mae) : null, 'Số tham số': e.params }))
  const gapRows = rows.filter((r) => r['Khoảng cách Val−Train'] != null)
  const parRows = rows.filter((r) => r['Số tham số'] != null)
  const cc = R.cluster_comparison
  const cmp = (keys: [string, 'auc' | 'eta2' | 'ari' | 'silhouette' | 'davies_bouldin'][]) => keys.map(([n, k]) => ({ name: n, GMM: cc.GMM[k], 'K-Means': cc.KMeans[k] }))
  const cl: [string, string][] = [['GMM', C.train], ['K-Means', C.test]]
  return (
    <>
      <Chart title="Experiment Tracking – Validation MAE và Train MAE qua các thí nghiệm" h={380}
        note={<>Trục bắt đầu từ 3.0 để thấy rõ khác biệt. Đường chấm = MAE Test của trọng số triển khai ({testMae.toFixed(3)}); báo cáo ghi {R.regression.Test.mae.toFixed(3)} cho phiên bản “chống quá khớp”. Nguồn: nhật ký thí nghiệm của notebook.</>}>
        <BarChart data={rows} layout="vertical" margin={{ left: 20, right: 50 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis type="number" domain={[3, 5]} tick={{ fontSize: 12 }} label={{ value: 'MAE (mL/phút/1,73m²)', position: 'insideBottom', offset: -2, fontSize: 12 }} />
          <YAxis type="category" dataKey="label" width={80} tick={{ fontSize: 12 }} /><Tooltip formatter={(v: any) => (typeof v === 'number' ? v.toFixed(3) : '—')} /><Legend />
          <ReferenceLine x={testMae} stroke={C.test} strokeDasharray="5 4" label={{ value: `Test ${testMae.toFixed(3)}`, position: 'top', fontSize: 11, fill: C.test }} />
          <Bar isAnimationActive={false} dataKey="Validation MAE" fill={C.val} label={{ position: 'right', fontSize: 10, formatter: (v: any) => Number(v).toFixed(3) }} />
          <Bar isAnimationActive={false} dataKey="Train MAE" fill={C.train} label={{ position: 'right', fontSize: 10, formatter: (v: any) => (v == null ? '' : Number(v).toFixed(3)) }} />
        </BarChart>
      </Chart>
      <Grid2>
        <Chart title="Khoảng cách Val − Train (càng nhỏ càng ít quá khớp)" note="TN3 GRU 0.580 → TN4 GRU 0.425 sau khi thêm phạt khoảng cách và regularization; đổi lại Val MAE tăng nhẹ 4.101 → 4.205. Thí nghiệm 1–2 không ghi Train MAE. GRU xanh, LSTM cam.">
          <BarChart data={gapRows} margin={{ top: 18 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="label" tick={{ fontSize: 11 }} /><YAxis /><Tooltip />
            <Bar isAnimationActive={false} dataKey="Khoảng cách Val−Train" label={lab(3)}>{gapRows.map((r, i) => <Cell key={i} fill={r.model === 'GRU' ? C.gru : C.lstm} />)}</Bar>
          </BarChart>
        </Chart>
        <Chart title="Số tham số của mô hình" note="LSTM TN3 có 319 937 tham số, gấp ~5 lần GRU (60 929) nhưng không tốt hơn. GRU xanh, LSTM cam.">
          <BarChart data={parRows} margin={{ top: 18 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="label" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip />
            <Bar isAnimationActive={false} dataKey="Số tham số" label={{ position: 'top', fontSize: 10 }}>{parRows.map((r, i) => <Cell key={i} fill={r.model === 'GRU' ? C.gru : C.lstm} />)}</Bar>
          </BarChart>
        </Chart>
        <Grouped title="Phân cụm – K-Means so với GMM (cao hơn là tốt)" data={cmp([['AUC', 'auc'], ['η²', 'eta2'], ['ARI', 'ari'], ['Silhouette', 'silhouette']])} series={cl} d={3} domain={[0, 1]}
          note="AUC: phát hiện suy giảm nhanh; η²: tách biệt theo tốc độ eGFR thật; ARI: ổn định khi lấy mẫu lại; Silhouette: độ gọn của cụm." />
        <Grouped title="Phân cụm – Davies–Bouldin (THẤP hơn là tốt)" data={cmp([['Davies–Bouldin', 'davies_bouldin']])} series={cl} d={3} domain={[0, 3]}
          note={`${cc.note} K-Means được chọn vì thắng η², ARI, Silhouette và Davies–Bouldin; AUC hai mô hình gần như bằng nhau.`} />
      </Grid2>
    </>
  )
}

/* ============================ Learning Curve ============================ */
function Learning({ E }: { E: Evaluation }) {
  const P = E.project
  const ep = P.learning_epoch
  const best = ep.reduce((b, r) => (r.diem < b.diem ? r : b), ep[0])
  const ld = P.learning_data.map((r) => ({ ...r, gap: r3(r.val_mean - r.train_mean) }))
  const last = ld[ld.length - 1]
  return (
    <>
      <Alert kind="info">{P.learning_note}</Alert>
      <Chart title="Learning Curve theo epoch (MAE, mL/phút/1,73m²)" h={340}
        note={`Điểm phạt = Val MAE + 0.5 × max(Val − Train, 0). Mô hình được chọn ở epoch ${best.epoch} (Train ${best.train.toFixed(3)}, Val ${best.val.toFixed(3)}); dừng sớm khi không cải thiện. Tổng ${ep.length} epoch.`}>
        <LineChart data={ep} margin={{ right: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="epoch" tick={{ fontSize: 12 }} label={{ value: 'Epoch', position: 'insideBottom', offset: -2, fontSize: 12 }} />
          <YAxis domain={['auto', 'auto']} tick={{ fontSize: 12 }} /><Tooltip formatter={(v: any) => Number(v).toFixed(3)} /><Legend verticalAlign="top" />
          <ReferenceLine x={best.epoch} stroke={C.warn} strokeDasharray="4 4" label={{ value: `Tốt nhất: epoch ${best.epoch}`, position: 'insideTopRight', fontSize: 11, fill: C.warn }} />
          <Line isAnimationActive={false} type="monotone" dataKey="train" name="Train MAE" stroke={C.gru} dot={false} strokeWidth={2} />
          <Line isAnimationActive={false} type="monotone" dataKey="val" name="Validation MAE" stroke={C.lstm} dot={false} strokeWidth={2} />
          <Line isAnimationActive={false} type="monotone" dataKey="diem" name="Điểm phạt (early stopping)" stroke="#64748b" strokeDasharray="5 4" dot={false} />
        </LineChart>
      </Chart>
      <Chart title="Learning Curve theo số bệnh nhân Train (trung bình 3 seed)" h={340}
        note={`Tăng dữ liệu từ 20% lên 100%: Val MAE giảm ${ld[0].val_mean.toFixed(2)} → ${last.val_mean.toFixed(2)}, khoảng cách Val−Train ${ld[0].gap.toFixed(2)} → ${last.gap.toFixed(2)}. Đường Validation vẫn đi xuống ở 100% dữ liệu: thêm dữ liệu có thể còn cải thiện mô hình.`}>
        <LineChart data={ld} margin={{ right: 20, top: 18 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="so_bn" type="number" domain={[100, 850]} ticks={ld.map((r) => r.so_bn)} tick={{ fontSize: 12 }} label={{ value: 'Số bệnh nhân Train', position: 'insideBottom', offset: -2, fontSize: 12 }} />
          <YAxis domain={[3.2, 5]} tick={{ fontSize: 12 }} /><Tooltip formatter={(v: any) => Number(v).toFixed(3)} /><Legend verticalAlign="top" />
          <Line isAnimationActive={false} dataKey="train_mean" name="Train MAE" stroke={C.gru} strokeWidth={2} dot={{ r: 4 }} label={lab(2)} />
          <Line isAnimationActive={false} dataKey="val_mean" name="Validation MAE" stroke={C.lstm} strokeWidth={2} dot={{ r: 4 }} label={lab(2)} />
        </LineChart>
      </Chart>
      <Grid2>
        <Chart title="Khoảng cách Val − Train theo lượng dữ liệu" note="Khoảng cách lớn nhất ở 478 bệnh nhân rồi ổn định quanh 0.46–0.50: quá khớp không tăng thêm khi có nhiều dữ liệu hơn.">
          <BarChart data={ld} margin={{ top: 18 }}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="so_bn" tick={{ fontSize: 12 }} /><YAxis /><Tooltip />
            <Bar isAnimationActive={false} dataKey="gap" name="Val − Train" fill={C.rep} label={lab(3)} /></BarChart>
        </Chart>
        <Chart title="Độ lệch chuẩn giữa 3 seed (độ ổn định huấn luyện)" note="SD của Train MAE giảm mạnh khi có nhiều dữ liệu (0.265 → 0.029): kết quả ổn định hơn.">
          <BarChart data={ld} margin={{ top: 18 }}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="so_bn" tick={{ fontSize: 12 }} /><YAxis /><Tooltip formatter={(v: any) => Number(v).toFixed(3)} /><Legend />
            <Bar isAnimationActive={false} dataKey="train_std" name="SD Train" fill={C.gru} label={lab(3)} /><Bar isAnimationActive={false} dataKey="val_std" name="SD Validation" fill={C.lstm} label={lab(3)} /></BarChart>
        </Chart>
      </Grid2>
    </>
  )
}

/* ============================ Kết quả huấn luyện ============================ */
function Training({ E }: { E: Evaluation }) {
  const P = E.project, D = E.deployed
  const tv: [string, string][] = [['Train', C.train], ['Validation', C.val]]
  const acc = P.accuracy_train_val
  const pc = (k: string) => (s: string) => num(acc[k]?.[s as 'Train'])
  const monthMae = MONTHS.map((m) => ({ name: `Tháng ${m}`, Train: r2(D.sets.Train.regression.per_month![m].mae), Validation: r2(D.sets.Validation.regression.per_month![m].mae) }))
  const monthRmse = MONTHS.map((m) => ({ name: `Tháng ${m}`, Train: r2(D.sets.Train.regression.per_month![m].rmse), Validation: r2(D.sets.Validation.regression.per_month![m].rmse) }))
  const clusters = CLUSTER_ORDER.map((c) => ({ name: c, Train: D.sets.Train.cluster.counts[c], Validation: D.sets.Validation.cluster.counts[c] }))
  const stageData = ['G2', 'G3a', 'G3b', 'G4', 'G5'].map((g) => ({ name: g, Train: r2(D.sets.Train.regression.mae_by_stage![g]?.mae ?? NaN), Validation: r2(D.sets.Validation.regression.mae_by_stage![g]?.mae ?? NaN) }))
  const samples = P.sample_counts.filter((r) => /^\d+$/.test(r.Train) && /^\d+$/.test(r.Validation)).map((r) => ({ name: r.name.length > 42 ? r.name.slice(0, 40) + '…' : r.name, Train: +r.Train, Validation: +r.Validation }))
  return (
    <>
      <Alert kind="info">Kết quả huấn luyện toàn dự án trên Train ({E.dataset.Train} BN) và Validation ({E.dataset.Validation} BN), trọng số triển khai. Tập Test chỉ dùng một lần ở tab “Kết quả kiểm thử”.</Alert>
      <Grid2>
        <Grouped title="MAE theo mốc dự đoán (mL/phút/1,73m²)" data={monthMae} series={tv} d={2} note="Có xu hướng tăng khi dự đoán xa hơn (18 → 36 tháng)." />
        <Grouped title="RMSE theo mốc dự đoán (mL/phút/1,73m²)" data={monthRmse} series={tv} d={2} />
        <Grouped title="Độ chính xác dự đoán eGFR (%)" h={320}
          data={bySetTV([['Lệch ≤ 5', pc('GRU – dự đoán lệch ≤ 5')], ['Lệch ≤ 10', pc('GRU – dự đoán lệch ≤ 10')], ['100% − MAPE', pc('GRU – độ chính xác theo % (100% − MAPE)')], ['Đúng xu hướng', pc('GRU – đúng xu hướng (giảm / không giảm)')]])}
          series={tv} d={1} unit="%" domain={[0, 105]} />
        <Grouped title="Phân cụm và giai đoạn CKD (%)" h={320}
          data={bySetTV([['Accuracy', pc('KMeans – Accuracy')], ['Độ nhạy', pc('KMeans – Độ nhạy')], ['Độ đặc hiệu', pc('KMeans – Độ đặc hiệu')], ['Đúng G 36 th.', pc('Hệ thống – đúng giai đoạn CKD 36M')], ['Lệch ≤ 1 G', pc('Hệ thống – lệch ≤ 1 giai đoạn')]])}
          series={tv} d={1} unit="%" domain={[0, 105]} note="Độ nhạy chỉ 44.0% trên Validation (Train 55.5%)." />
        <Grouped title="MAE theo giai đoạn eGFR thực tế" data={stageData} series={tv} d={2} />
        <Grouped title="Số bệnh nhân mỗi nhóm cụm" data={clusters} series={tv} d={0} />
      </Grid2>
      <Chart title="Cỡ mẫu của từng phép đánh giá (số bệnh nhân)" h={Math.max(260, samples.length * 70)}>
        <BarChart data={samples} layout="vertical" margin={{ left: 30, right: 40 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis type="number" /><YAxis type="category" dataKey="name" width={260} tick={{ fontSize: 11 }} /><Tooltip /><Legend />
          <Bar isAnimationActive={false} dataKey="Train" fill={C.train} label={{ position: 'right', fontSize: 10 }} /><Bar isAnimationActive={false} dataKey="Validation" fill={C.val} label={{ position: 'right', fontSize: 10 }} /></BarChart>
      </Chart>
    </>
  )
}

/* ============================ Kết quả kiểm thử ============================ */
function Testing({ E }: { E: Evaluation }) {
  const R = E.reported, D = E.deployed, dt = D.sets.Test.cluster, cm = dt.confusion, fs = E.project.final_summary
  const rep: [string, string][] = [['Theo báo cáo', C.rep], ['Trọng số triển khai', C.test]]
  const risk = R.risk_detection_test
  const fsv = (k: string) => (s: string) => num(fs[k][s as 'Train'])
  const monthData = MONTHS.map((m) => ({ name: `Tháng ${m}`, ...Object.fromEntries(SETS.map((s) => [s, r2(D.sets[s].regression.per_month![m].mae)])) }))
  const clusterData = CLUSTER_ORDER.map((c) => ({ name: c, ...Object.fromEntries(SETS.map((s) => [s, D.sets[s].cluster.counts[c]])) }))
  const conf = [{ name: 'TN (đúng: không suy giảm nhanh)', v: cm.tn, c: '#16a34a' }, { name: 'FP (báo nhầm suy giảm nhanh)', v: cm.fp, c: '#f59e0b' },
    { name: 'FN (bỏ sót suy giảm nhanh)', v: cm.fn, c: C.warn }, { name: 'TP (đúng: suy giảm nhanh)', v: cm.tp, c: '#16a34a' }]
  const stage36 = SETS.map((s) => ({ name: s, 'Đúng giai đoạn': r2(D.sets[s].regression.stage36!.exact * 100), 'Lệch ≤ 1 giai đoạn': r2(D.sets[s].regression.stage36!.within1 * 100) }))
  return (
    <>
      <Alert kind="info">Kiểm thử trên tập Test ({D.sets.Test.regression.n_patients} BN có nhãn thật, {D.sets.Test.regression.n_values} giá trị). Test chỉ chạy một lần duy nhất; trọng số triển khai.</Alert>
      <Grid2>
        <Grouped title="MAE theo mốc thời gian: Train / Validation / Test" data={monthData} series={setSeries} d={2} />
        <Grouped title="Sai số hồi quy theo tập" data={bySet([['MAE', (s) => r3(D.sets[s].regression.mae)], ['RMSE', (s) => r3(D.sets[s].regression.rmse)]])} series={setSeries} d={2} />
        <Grouped title="Giai đoạn CKD ở tháng 36 (%)" data={stage36} series={[['Đúng giai đoạn', C.test], ['Lệch ≤ 1 giai đoạn', C.gru]]} d={1} unit="%" domain={[0, 105]}
          note={`Test: đúng ${fs['Hệ thống – đúng giai đoạn 36M'].Test}, lệch ≤ 1 giai đoạn ${fs['Hệ thống – lệch ≤ 1 giai đoạn'].Test}.`} />
        <Grouped title="Phân bố nhãn cụm theo tập (số bệnh nhân)" data={clusterData} series={setSeries} d={0} />
        <Grouped title="Phát hiện suy giảm nhanh (Test): Accuracy, độ nhạy, độ đặc hiệu (%)" h={320}
          data={[{ name: 'Accuracy', 'Theo báo cáo': r2(risk.accuracy * 100), 'Trọng số triển khai': r2(dt.accuracy * 100) }, { name: 'Độ nhạy', 'Theo báo cáo': r2(risk.sensitivity * 100), 'Trọng số triển khai': r2((dt.sensitivity ?? 0) * 100) },
            { name: 'Độ đặc hiệu', 'Theo báo cáo': r2(risk.specificity * 100), 'Trọng số triển khai': r2((dt.specificity ?? 0) * 100) }]} series={rep} d={1} unit="%" domain={[0, 100]}
          note={`Ngưỡng “suy giảm nhanh”: eGFR ≤ ${D.fast_decline_threshold.toFixed(2)} mL/phút/1,73m²/năm, xác định thực nghiệm từ Train, không phải ngưỡng chẩn đoán. Độ nhạy ~${(risk.sensitivity * 100).toFixed(0)}% nghĩa là còn bỏ sót gần một nửa ca suy giảm nhanh.`} />
        <Grouped title="AUC phát hiện suy giảm nhanh (Test)" data={[{ name: 'AUC', 'Theo báo cáo': risk.auc, 'Trọng số triển khai': r3(dt.auc) }]} series={rep} d={3} domain={[0, 1]} h={320} ref={{ y: 0.5, label: 'Ngẫu nhiên = 0.5' }} />
      </Grid2>
      <Grid2>
        <Chart title={`Ma trận nhầm lẫn dạng cột – Test (n = ${dt.n_eval}, trọng số triển khai)`} h={300} note="Dự đoán dương tính = nhóm K-Means “Chuyển biến xấu”; thực tế dương tính = suy giảm nhanh.">
          <BarChart data={conf} layout="vertical" margin={{ left: 40, right: 30 }}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis type="number" /><YAxis type="category" dataKey="name" width={210} tick={{ fontSize: 11 }} /><Tooltip />
            <Bar isAnimationActive={false} dataKey="v" name="Số bệnh nhân" label={{ position: 'right', fontSize: 11 }}>{conf.map((c, i) => <Cell key={i} fill={c.c} />)}</Bar></BarChart>
        </Chart>
        <Chart title="eGFR thực tế so với dự đoán – Test (đường chéo = hoàn hảo)" h={300}>
          <ScatterChart margin={{ left: 0, right: 10, top: 10, bottom: 20 }}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis type="number" dataKey="actual" name="Thực tế" domain={[0, 120]} label={{ value: 'eGFR thực tế', position: 'insideBottom', offset: -10, fontSize: 12 }} />
            <YAxis type="number" dataKey="predicted" name="Dự đoán" domain={[0, 120]} label={{ value: 'eGFR dự đoán', angle: -90, position: 'insideLeft', fontSize: 12 }} />
            <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 120, y: 120 }]} stroke={C.warn} strokeDasharray="5 5" /><Tooltip cursor={{ strokeDasharray: '3 3' }} />
            <Scatter isAnimationActive={false} data={D.scatter_test} fill={C.test} fillOpacity={0.45} /></ScatterChart>
        </Chart>
      </Grid2>
      <Grouped title="Kết quả kiểm thử toàn dự án – phân cụm và phát hiện nguy cơ (thang 0–100)" h={320}
        data={bySet([['AUC×100', (s) => r2(fsv('KMeans – AUC suy giảm nhanh')(s) * 100)], ['η²×100', (s) => r2(fsv('KMeans – η²')(s) * 100)], ['Accuracy %', fsv('KMeans – Accuracy')], ['Độ nhạy %', fsv('KMeans – Độ nhạy')], ['Độ đặc hiệu %', fsv('KMeans – Độ đặc hiệu')]])}
        series={setSeries} d={1} domain={[0, 100]} note="AUC và η² được nhân 100 để vẽ chung thang với các tỷ lệ phần trăm." />
    </>
  )
}

/* ============================ Độ tin cậy ============================ */
function Reliability({ E }: { E: Evaluation }) {
  const { reliability: rel, sets } = E.deployed
  const rob = E.project.robustness
  const cal = rel.calibration.map((r) => ({ ...r, err: r.y_sd ?? 0 }))
  const band = rel.interval_90.map((r) => ({ name: `Tháng ${r.month}`, 'Khoảng sai số 90%': [r2(r.lower), r2(r.upper)], 'Độ phủ': r2(r.coverage * 100) }))
  const stageData = ['G2', 'G3a', 'G3b', 'G4', 'G5'].map((g) => ({ name: g, ...Object.fromEntries(SETS.map((s) => [s, r2(sets[s].regression.mae_by_stage![g]?.mae ?? NaN)])) }))
  const scen = rob.Test.map((r, i) => ({ name: r.kich_ban, 'MAE Validation': r2(rob.Validation[i].mae), 'MAE Test': r2(r.mae), 'AUC Test': r3(r.auc), 'AUC Validation': r3(rob.Validation[i].auc), 'Giữ nhóm Test': r2(r.giu_nhom * 100), 'Giữ nhóm Validation': r2(rob.Validation[i].giu_nhom * 100) }))
  return (
    <>
      <Alert kind="info">Độ tin cậy của dự đoán trên Test. {rel.interval_note}</Alert>
      <Grid2>
        <Chart title="E1. Khoảng sai số 90% (thực tế − dự đoán) theo mốc" note="Dải nổi cho biết thực tế thường lệch khỏi dự đoán trong khoảng này (mL/phút/1,73m²). Khoảng rộng dần theo mốc: ±7 → ±11.">
          <BarChart data={band} margin={{ top: 18 }}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="name" /><YAxis domain={[-14, 14]} /><Tooltip />
            <ReferenceLine y={0} stroke="#0f172a" /><Bar isAnimationActive={false} dataKey="Khoảng sai số 90%" fill={C.gru} fillOpacity={0.7} /></BarChart>
        </Chart>
        <Chart title="E1. Độ phủ của khoảng 90% trên Test (mục tiêu 90%)" note="Độ phủ 85–96% cho thấy khoảng này khá hợp lý trên Test, nhưng chưa được xác thực thống kê nên giao diện bệnh nhân không hiển thị dải bất định.">
          <BarChart data={band} margin={{ top: 18 }}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="name" /><YAxis domain={[0, 100]} unit="%" /><Tooltip formatter={(v: any) => `${v}%`} />
            <ReferenceLine y={90} stroke={C.warn} strokeDasharray="5 4" label={{ value: 'Mục tiêu 90%', position: 'insideBottomRight', fontSize: 11, fill: C.warn }} />
            <Bar isAnimationActive={false} dataKey="Độ phủ" fill={C.test} label={lab(1, '%')} /></BarChart>
        </Chart>
        <Chart title="E2. Hiệu chỉnh: dự đoán trung bình so với thực tế trung bình (10 nhóm, Test)" note={`Điểm càng sát đường chéo đỏ càng được hiệu chỉnh tốt; thanh dọc = độ lệch chuẩn của thực tế trong nhóm (n ≈ ${cal[0]?.n}/nhóm).`}>
          <ComposedChart data={cal} margin={{ right: 12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="p_mean" type="number" domain={[0, 80]} tickFormatter={(v) => Number(v).toFixed(0)} label={{ value: 'eGFR dự đoán trung bình', position: 'insideBottom', offset: -2, fontSize: 12 }} />
            <YAxis domain={[0, 80]} label={{ value: 'eGFR thực tế trung bình', angle: -90, position: 'insideLeft', fontSize: 12 }} /><Tooltip formatter={(v: any) => Number(v).toFixed(1)} />
            <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 80, y: 80 }]} stroke={C.warn} strokeDasharray="5 5" />
            <Line isAnimationActive={false} dataKey="y_mean" name="Thực tế TB" stroke={C.test} strokeWidth={2} dot={{ r: 4 }}><ErrorBar dataKey="err" stroke={C.test} width={4} /></Line>
          </ComposedChart>
        </Chart>
        <Grouped title="E3. MAE theo giai đoạn CKD thực tế" data={stageData} series={setSeries} d={2} note="Sai số lớn nhất ở G2 (eGFR cao, chỉ 18 giá trị ở Test)." />
        <Grouped title="E4. Độ bền khi khám thiếu: MAE theo kịch bản" data={scen} series={[['MAE Validation', C.val], ['MAE Test', C.test]]} d={2}
          note="Chỉ bệnh nhân khám đủ 3 lần. Khi chỉ có lần đo tháng 0, MAE tăng khoảng 3.5 → 5.9; vì vậy giao diện hạ “độ tin cậy” khi thiếu lần đo." />
        <Grouped title="E4. Tỷ lệ bệnh nhân giữ nguyên nhóm khi khám thiếu (%)" data={scen} series={[['Giữ nhóm Validation', C.val], ['Giữ nhóm Test', C.test]]} d={1} unit="%" domain={[0, 105]} />
        <Grouped title="E4. AUC phát hiện suy giảm nhanh khi khám thiếu" data={scen} series={[['AUC Validation', C.val], ['AUC Test', C.test]]} d={3} domain={[0, 1]} ref={{ y: 0.5, label: 'Ngẫu nhiên' }}
          note="AUC không giảm khi thiếu lần đo (dao động 0.65–0.70, mẫu nhỏ nên không kết luận được cải thiện)." />
      </Grid2>
    </>
  )
}
