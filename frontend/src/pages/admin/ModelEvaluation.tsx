import { Download } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts'
import { Alert, Button, Card, PageTitle, Spinner, StatusBadge, Table, Td, useAsync } from '../../components/ui'
import { api, download } from '../../lib/api'
import { CLUSTER_ORDER, fmtDateTime, pct } from '../../lib/labels'
import type { Evaluation } from '../../lib/types'

/* eslint-disable @typescript-eslint/no-explicit-any */
const SETS = ['Train', 'Validation', 'Test'] as const
const f3 = (v: number) => v.toFixed(3)
const TIP: Record<string, string> = {
  MAE: 'Sai số tuyệt đối trung bình giữa eGFR thực tế và dự đoán. Càng thấp càng tốt.',
  RMSE: 'Căn bậc hai sai số bình phương trung bình; phạt nặng các sai số lớn. Càng thấp càng tốt.',
  'R²': 'Tỷ lệ phương sai eGFR được mô hình giải thích. Càng gần 1 càng tốt.',
  AUC: 'Khả năng phân biệt bệnh nhân suy giảm nhanh với phần còn lại (0.5 = ngẫu nhiên, 1 = hoàn hảo). Cao hơn tốt hơn.',
  'η²': 'Mức các nhóm khác nhau về tốc độ eGFR thực tế (hiệu ứng Kruskal–Wallis). Cao hơn = nhóm tách biệt hơn.',
  ARI: 'Độ ổn định của cụm khi lấy mẫu lại (Adjusted Rand Index). Cao hơn = ổn định hơn.',
  Silhouette: 'Độ gọn và tách biệt của cụm (−1 đến 1). Cao hơn tốt hơn.',
  'Davies–Bouldin': 'Mức chồng lấn giữa các cụm. THẤP hơn tốt hơn.',
}
const Tip = ({ k }: { k: string }) => <abbr title={TIP[k]} className="cursor-help underline decoration-dotted">{k}</abbr>

export default function ModelEvaluation() {
  const ev = useAsync(() => api<Evaluation>('/api/admin/model-evaluation'), [])
  const ver = useAsync(() => api<any>('/api/admin/model-versions'), [])
  if (ev.loading || ver.loading) return <Spinner />
  if (!ev.data || !ver.data) return <Alert kind="error">{ev.error ?? ver.error ?? 'Không tải được dữ liệu đánh giá'}</Alert>
  const { deployed: D, reported: R } = ev.data

  const monthData = ['18', '24', '30', '36'].map((m) => ({ month: `Tháng ${m}`, ...Object.fromEntries(SETS.map((s) => [s, +D.sets[s].regression.per_month![m].mae.toFixed(2)])) }))
  const stageNames = Object.keys(D.sets.Test.regression.mae_by_stage!)
  const stageData = stageNames.map((g) => ({ stage: g, 'MAE (Test)': +D.sets.Test.regression.mae_by_stage![g].mae.toFixed(2), n: D.sets.Test.regression.mae_by_stage![g].n }))
  const clusterData = CLUSTER_ORDER.map((c) => ({ name: c, ...Object.fromEntries(SETS.map((s) => [s, D.sets[s].cluster.counts[c]])) }))
  const cc = R.cluster_comparison
  const cmpRows: [string, keyof typeof cc.GMM, boolean][] = [['AUC', 'auc', true], ['η²', 'eta2', true], ['ARI', 'ari', true], ['Silhouette', 'silhouette', true], ['Davies–Bouldin', 'davies_bouldin', false]]
  const cmpChart = cmpRows.filter(([, , hi]) => hi).map(([k, key]) => ({ metric: k, GMM: cc.GMM[key], 'K-Means': cc.KMeans[key] }))
  const cm = D.sets.Test.cluster.confusion
  const dt = D.sets.Test.cluster

  return (
    <>
      <PageTitle title="Đánh giá mô hình AI" subtitle="Chỉ Admin truy cập. Đây là đánh giá offline trên tập dữ liệu nghiên cứu, không phải hiệu năng vận hành trực tuyến."
        actions={<Button variant="secondary" onClick={() => download('/api/admin/model-evaluation/export', 'model_evaluation.csv')}><Download className="h-4 w-4" aria-hidden /> Xuất CSV</Button>} />
      <div className="space-y-6">
        <Alert kind="warn" title="Hai nguồn số liệu chưa trùng khớp">
          {R.caveat} Bảng bên dưới hiển thị cả số liệu <b>theo báo cáo</b> và số liệu <b>tái tính từ trọng số đang triển khai</b>; không trộn lẫn hai nguồn.
        </Alert>

        {/* Nhóm 1 */}
        <Card title="1. Thông tin mô hình" actions={<span className="flex items-center gap-2 text-sm">API dự đoán: <StatusBadge status={ver.data.api.model_ready ? 'active' : 'inactive'} /></span>}>
          <Table head={['Tên', 'Phiên bản', 'Trạng thái', 'Dữ liệu', 'Triển khai', 'SHA-256 trọng số']}>
            {ver.data.items.map((v: any) => (
              <tr key={v.id}><Td className="font-medium">{v.name}</Td><Td className="font-mono text-xs">{v.version}</Td><Td><StatusBadge status={v.status} /></Td><Td className="text-xs">{v.trained_on}</Td><Td>{fmtDateTime(v.deployed_at)}</Td><Td className="font-mono text-xs">{v.weights_sha256 ? v.weights_sha256.slice(0, 12) + '…' : '—'}</Td></tr>))}
          </Table>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">
            {ver.data.items.map((v: any) => <li key={v.id}><b>{v.version}</b>: {v.description}</li>)}
            <li>Tiền xử lý: z-score theo Train, điền thiếu cố định (UPCR), log1p(UPCR); đặc trưng phân cụm cắt phân vị 5–95% của Train rồi chuẩn hoá. Số bệnh nhân: Train {ev.data.dataset.Train}, Validation {ev.data.dataset.Validation}, Test {ev.data.dataset.Test}.</li>
          </ul>
        </Card>

        {/* Nhóm 2 */}
        <Card title="2. Đánh giá hồi quy eGFR (mL/phút/1,73m²)">
          <Table head={['Chỉ số', 'Train (BC)', 'Validation (BC)', 'Test (BC)', 'Train (triển khai)', 'Validation (triển khai)', 'Test (triển khai)']}>
            {([['MAE', 'mae', f3], ['RMSE', 'rmse', f3], ['R²', 'r2', f3], ['Sai số ≤ 5', 'within5', pct], ['Sai số ≤ 10', 'within10', pct]] as const).map(([lab, key, fm]) => (
              <tr key={lab}><Td className="font-medium">{lab in TIP ? <Tip k={lab} /> : lab}</Td>
                {SETS.map((s) => <Td key={'r' + s}>{(fm as any)(R.regression[s][key])}</Td>)}
                {SETS.map((s) => <Td key={'d' + s} className="bg-slate-50">{(fm as any)(D.sets[s].regression[key])}</Td>)}</tr>))}
          </Table>
          <p className="mt-3 text-xs text-slate-500">BC = theo báo cáo (người dùng xác nhận). Triển khai = tái tính từ gru_lstm_phat_nang.pt đang chạy (n = {D.sets.Train.regression.n_patients}/{D.sets.Validation.regression.n_patients}/{D.sets.Test.regression.n_patients} bệnh nhân có nhãn thực; tính trên {D.sets.Test.regression.n_values} giá trị ở Test). Tỷ lệ sai số ≤ 5/≤ 10 = số giá trị dự đoán (BN × mốc 18–36 tháng có eGFR thật) có |sai số| ≤ ngưỡng, chia cho tổng giá trị có nhãn thật.</p>
        </Card>

        {/* Nhóm 3 */}
        <Card title="3. Đánh giá phân cụm: K-Means so với GMM">
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <Table head={['Chỉ số', 'GMM', 'K-Means', 'Nhận xét']}>
                {cmpRows.map(([k, key, hi]) => {
                  const g = cc.GMM[key], m = cc.KMeans[key]
                  const better = hi ? (m > g ? 'K-Means tốt hơn' : m < g ? 'GMM tốt hơn' : 'Bằng nhau') : (m < g ? 'K-Means tốt hơn (thấp hơn)' : 'GMM tốt hơn (thấp hơn)')
                  return <tr key={k}><Td className="font-medium"><Tip k={k} /></Td><Td>{f3(g)}</Td><Td>{f3(m)}</Td><Td className="text-xs">{Math.abs(m - g) < 0.005 ? 'Tương đương' : better}</Td></tr>
                })}
              </Table>
              <p className="mt-2 text-xs text-slate-500">{cc.note} K-Means được chọn vì thắng nhiều tiêu chí hơn (η², ARI, Silhouette, Davies–Bouldin); AUC hai mô hình gần như bằng nhau.</p>
            </div>
            <div style={{ height: 260 }} role="img" aria-label="Biểu đồ cột so sánh GMM và K-Means theo AUC, η², ARI, Silhouette">
              <ResponsiveContainer><BarChart data={cmpChart}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="metric" tick={{ fontSize: 12 }} /><YAxis domain={[0, 1]} /><Tooltip /><Legend />
                <Bar isAnimationActive={false} dataKey="GMM" fill="#94a3b8" label={{ position: 'top', fontSize: 10, formatter: (v: any) => Number(v).toFixed(2) }} /><Bar isAnimationActive={false} dataKey="K-Means" fill="#0f766e" label={{ position: 'top', fontSize: 10, formatter: (v: any) => Number(v).toFixed(2) }} /></BarChart></ResponsiveContainer>
            </div>
          </div>
        </Card>

        {/* Nhóm 4 */}
        <Card title="4. Đánh giá phát hiện suy giảm nhanh (Test)">
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
                <thead><tr><th></th><th className="border p-2">Dự đoán: không thuộc nhóm xấu</th><th className="border p-2">Dự đoán: nhóm Chuyển biến xấu</th></tr></thead>
                <tbody>
                  <tr><th className="border p-2 text-left">Thực tế: không suy giảm nhanh</th><td className="border p-2">TN = <b>{cm.tn}</b></td><td className="border p-2">FP = <b>{cm.fp}</b></td></tr>
                  <tr><th className="border p-2 text-left">Thực tế: suy giảm nhanh</th><td className="border p-2">FN = <b>{cm.fn}</b></td><td className="border p-2">TP = <b>{cm.tp}</b></td></tr>
                </tbody>
              </table>
            </div>
            <Alert kind="warn" title="Giới hạn cần lưu ý">
              Ngưỡng “suy giảm nhanh” là eGFR ≤ {D.fast_decline_threshold.toFixed(2)} mL/phút/1,73m²/năm, xác định thực nghiệm từ tập Train (25% thấp nhất tốc độ eGFR thật), không phải ngưỡng chẩn đoán phổ quát. Độ nhạy ~{pct(R.risk_detection_test.sensitivity, 0)} nghĩa là mô hình còn bỏ sót gần một nửa số trường hợp suy giảm nhanh; không dùng nhãn này để loại trừ nguy cơ.
            </Alert>
          </div>
        </Card>

        {/* Nhóm 5 */}
        <Card title="5. So sánh dự đoán với thực tế (trọng số triển khai)">
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <p className="mb-1 text-sm font-medium">eGFR thực tế so với dự đoán – Test (đường chéo = dự đoán hoàn hảo)</p>
              <div style={{ height: 320 }} role="img" aria-label="Biểu đồ phân tán eGFR thực tế và dự đoán trên tập Test">
                <ResponsiveContainer><ScatterChart margin={{ left: 0, right: 10, top: 10, bottom: 20 }}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" dataKey="actual" name="Thực tế" domain={[0, 120]} label={{ value: 'eGFR thực tế', position: 'insideBottom', offset: -10, fontSize: 12 }} />
                  <YAxis type="number" dataKey="predicted" name="Dự đoán" domain={[0, 120]} label={{ value: 'eGFR dự đoán', angle: -90, position: 'insideLeft', fontSize: 12 }} />
                  <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 120, y: 120 }]} stroke="#dc2626" strokeDasharray="5 5" />
                  <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                  <Scatter isAnimationActive={false} data={D.scatter_test} fill="#0f766e" fillOpacity={0.45} /></ScatterChart></ResponsiveContainer>
              </div>
            </div>
            <div>
              <p className="mb-1 text-sm font-medium">MAE theo mốc thời gian (mL/phút/1,73m²)</p>
              <div style={{ height: 320 }} role="img" aria-label="Biểu đồ cột MAE theo mốc thời gian">
                <ResponsiveContainer><BarChart data={monthData}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="month" /><YAxis /><Tooltip /><Legend />
                  <Bar isAnimationActive={false} dataKey="Train" fill="#cbd5e1" /><Bar isAnimationActive={false} dataKey="Validation" fill="#64748b" /><Bar isAnimationActive={false} dataKey="Test" fill="#0f766e" /></BarChart></ResponsiveContainer>
              </div>
            </div>
            <div>
              <p className="mb-1 text-sm font-medium">MAE theo giai đoạn eGFR thực tế – Test</p>
              <div style={{ height: 260 }} role="img" aria-label="Biểu đồ cột MAE theo giai đoạn eGFR">
                <ResponsiveContainer><BarChart data={stageData}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="stage" /><YAxis /><Tooltip /><Bar isAnimationActive={false} dataKey="MAE (Test)" fill="#0f766e" label={{ position: 'top', fontSize: 11 }} /></BarChart></ResponsiveContainer>
              </div>
              <p className="text-xs text-slate-500">Số giá trị mỗi giai đoạn: {stageData.map((s) => `${s.stage}: ${s.n}`).join(' · ')}</p>
            </div>
            <div>
              <p className="mb-1 text-sm font-medium">Phân bố nhãn cụm theo tập</p>
              <div style={{ height: 260 }} role="img" aria-label="Biểu đồ cột phân bố nhãn cụm">
                <ResponsiveContainer><BarChart data={clusterData}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="name" tick={{ fontSize: 12 }} /><YAxis /><Tooltip /><Legend />
                  <Bar isAnimationActive={false} dataKey="Train" fill="#cbd5e1" /><Bar isAnimationActive={false} dataKey="Validation" fill="#64748b" /><Bar isAnimationActive={false} dataKey="Test" fill="#0f766e" /></BarChart></ResponsiveContainer>
              </div>
            </div>
          </div>
          <p className="mt-4 text-sm text-slate-600">Giai đoạn CKD ở tháng 36 (Test): đúng {pct(D.sets.Test.regression.stage36!.exact)}, lệch tối đa 1 giai đoạn {pct(D.sets.Test.regression.stage36!.within1)} (n = {D.sets.Test.regression.stage36!.n}).</p>
        </Card>

        <Card title="Lịch sử thí nghiệm & phiên bản (theo báo cáo)">
          <Table head={['TN', 'Mô hình', 'Tên', 'Val MAE', 'Train MAE', 'Số tham số', 'Ghi chú']}>
            {R.experiments.map((e, i) => (<tr key={i}><Td>{e.id}</Td><Td>{e.model}</Td><Td>{e.name}</Td><Td>{f3(e.val_mae)}</Td><Td>{e.train_mae != null ? f3(e.train_mae) : '—'}</Td><Td>{e.params ?? '—'}</Td><Td className="text-xs">{e.note}</Td></tr>))}
          </Table>
        </Card>
      </div>
    </>
  )
}
