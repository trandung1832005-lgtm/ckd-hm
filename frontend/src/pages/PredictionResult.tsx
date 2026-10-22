import { Printer } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { EgfrChart } from '../components/EgfrChart'
import { Alert, Button, Card, ClusterBadge, Disclaimer, PageTitle, Spinner, Table, Td, useAsync } from '../components/ui'
import { api } from '../lib/api'
import { STAGE_BANDS, fmtDateTime, num } from '../lib/labels'
import type { Education, Run } from '../lib/types'

export default function PredictionResult() {
  const { runId } = useParams()
  const { data: run, loading, error } = useAsync(() => api<Run>(`/api/predictions/${runId}`), [runId])
  const edu = useAsync(() => api<Education>('/api/education'), [])
  if (loading) return <Spinner />
  if (error || !run) return <Alert kind="error">{error ?? 'Không tìm thấy kết quả'}</Alert>

  const last = run.last_observed
  const final = run.results.find((r) => r.month === 36)?.egfr_pred
  const delta = last != null && final != null ? final - last : null
  const clusterText = edu.data?.clusters[run.cluster ?? '']

  return (
    <>
      <PageTitle title={`Kết quả dự đoán #${run.id}`} subtitle={<Link className="text-brand-700 underline" to={`/app/patients/${run.patient_id}`}>← Về hồ sơ bệnh nhân</Link>}
        actions={<Button variant="secondary" onClick={() => window.print()}><Printer className="h-4 w-4" aria-hidden /> In / lưu PDF</Button>} />
      <div className="space-y-6">
        {/* A. Tổng quan */}
        <Card title="Tổng quan">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <div><p className="text-xs text-slate-500">Nhóm tiến triển</p><div className="mt-1"><ClusterBadge cluster={run.cluster} size="lg" /></div></div>
            <div><p className="text-xs text-slate-500">eGFR đo gần nhất</p><p className="text-2xl font-semibold">{num(last)}</p></div>
            <div><p className="text-xs text-slate-500">eGFR dự đoán tháng 36</p><p className="text-2xl font-semibold">{num(final)}</p></div>
            <div><p className="text-xs text-slate-500">Thay đổi tới tháng 36</p><p className="text-2xl font-semibold">{delta == null ? '—' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}`}</p></div>
          </div>
          <dl className="mt-5 grid gap-2 border-t border-slate-100 pt-4 text-sm sm:grid-cols-3">
            <div><dt className="text-slate-500">Thời điểm dự đoán</dt><dd>{fmtDateTime(run.created_at)}</dd></div>
            <div><dt className="text-slate-500">Phiên bản mô hình</dt><dd>{run.model_version ?? '—'}</dd></div>
            <div><dt className="text-slate-500">Dữ liệu đầu vào</dt><dd>{run.n_visits}/3 lần đo eGFR · độ tin cậy: <b>{run.confidence}</b></dd></div>
          </dl>
          {run.warnings && run.warnings.length > 0 && <div className="mt-4 space-y-2">{run.warnings.map((w) => <Alert key={w} kind="warn">{w}</Alert>)}</div>}
        </Card>

        {/* B. Biểu đồ */}
        <Card title="Biểu đồ eGFR: thực tế và dự đoán">
          <EgfrChart history={run.history} results={run.results} />
          <p className="mt-2 text-xs text-slate-500">Đường liền, chấm đặc: eGFR đã đo. Đường nét đứt, chấm rỗng: eGFR do GRU dự đoán. Đường chấm xám nối lần đo cuối với mốc 18 tháng chỉ để dễ nhìn. Hệ thống chưa tính khoảng bất định nên không hiển thị khoảng tin cậy.</p>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* D. Phân loại */}
          <Card title="Giai đoạn eGFR dự đoán (G1–G5)">
            <Table head={['Tháng', 'eGFR dự đoán', 'Giai đoạn']}>
              {run.results.map((r) => (<tr key={r.month}><Td>{r.month}</Td><Td>{num(r.egfr_pred)}</Td><Td><b>{r.stage}</b> <span className="text-xs text-slate-500">({STAGE_BANDS.find((b) => b.stage === r.stage)?.label})</span></Td></tr>))}
            </Table>
            <p className="mt-3 text-xs text-slate-500">Đây là phân loại chỉ dựa trên eGFR theo ngưỡng trong hệ thống, không phải chẩn đoán CKD. Chẩn đoán CKD (đặc biệt G1–G2) cần thêm dấu hiệu tổn thương thận và thời gian ≥ 3 tháng.</p>
          </Card>
          {/* C. Diễn giải */}
          <Card title="Diễn giải xu hướng">
            <ul className="list-disc space-y-2 pl-5 text-sm text-slate-700">
              <li>Tốc độ thay đổi eGFR ước tính: <b>{num(run.slope_per_year, 2)}</b> mL/phút/1,73m² mỗi năm (đường thẳng khớp qua các điểm đã đo và dự đoán).</li>
              <li>{delta != null && <>Từ lần đo gần nhất tới tháng 36, eGFR dự kiến {delta < 0 ? 'giảm' : delta > 0 ? 'tăng' : 'không đổi'} khoảng <b>{Math.abs(delta).toFixed(1)}</b>.</>}</li>
              <li>Nhóm <b>{run.cluster}</b>: {clusterText ?? '—'} Nhóm được gán dựa trên tốc độ và mức thay đổi eGFR dự đoán, kết hợp đạm niệu, albumin và huyết áp tâm thu so với các cụm của dữ liệu huấn luyện.</li>
              <li>Độ tin cậy phụ thuộc số lần đo eGFR ({run.n_visits}/3) và việc có UPCR hay không. Các yếu tố đầu vào chỉ được dùng để dự đoán; không có nghĩa chúng là nguyên nhân gây suy giảm.</li>
              <li>Hãy trao đổi với nhân viên y tế khi eGFR giảm nhanh giữa các lần đo, khi có phù/tiểu ít/mệt nhiều, hoặc khi kết quả dự đoán khác nhiều so với tình trạng thực tế.</li>
            </ul>
            {run.stage_36m && edu.data?.stages[run.stage_36m] && (
              <p className="mt-3 text-sm text-slate-600">Thông tin tham khảo cho {run.stage_36m}: xem <Link className="text-brand-700 underline" to="/app/education">Hướng dẫn chăm sóc</Link>.</p>)}
          </Card>
        </div>
        <Disclaimer />
      </div>
    </>
  )
}
