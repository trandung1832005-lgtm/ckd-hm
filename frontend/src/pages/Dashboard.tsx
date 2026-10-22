import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { EgfrChart } from '../components/EgfrChart'
import { Alert, Card, ClusterBadge, Disclaimer, Empty, PageTitle, Spinner, Table, Td, useAsync } from '../components/ui'
import { api } from '../lib/api'
import { CLUSTER_ORDER, fmtDate, fmtDateTime, num } from '../lib/labels'
import type { Run } from '../lib/types'

/* eslint-disable @typescript-eslint/no-explicit-any */
const Stat = ({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-5">
    <p className="text-sm text-slate-500">{label}</p>
    <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
    {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
  </div>
)

export default function Dashboard() {
  const { user } = useAuth()
  const { data, error, loading } = useAsync(() => api<any>('/api/dashboard'), [])
  if (loading) return <Spinner />
  if (error || !data) return <Alert kind="error">{error ?? 'Không tải được dashboard'}</Alert>
  return (
    <>
      <PageTitle title={`Xin chào, ${user?.full_name}`} subtitle="Tổng quan theo vai trò của bạn." />
      {data.role === 'clinician' && <Clinician d={data} />}
      {data.role === 'patient' && <PatientDash d={data} />}
      {data.role === 'admin' && <AdminDash d={data} />}
    </>
  )
}

function Clinician({ d }: { d: any }) {
  const chart = CLUSTER_ORDER.map((c) => ({ name: c, 'Số bệnh nhân': d.cluster_counts[c] ?? 0 }))
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Bệnh nhân đang quản lý" value={d.patients} />
        <Stat label="Lượt dự đoán 7 ngày qua" value={d.predictions_7d} />
        <Stat label="Cần xem xét theo dõi" value={d.needs_review.length} hint="Nhóm Chuyển biến xấu hoặc eGFR dự đoán 36 tháng ở G4–G5" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Cần xem xét theo dõi" actions={<Link to="/app/patients" className="text-sm text-brand-700 underline">Tất cả bệnh nhân</Link>}>
          {d.needs_review.length === 0 ? <Empty title="Chưa có trường hợp nào" hint="Các bệnh nhân có lần dự đoán mới nhất thuộc nhóm Chuyển biến xấu hoặc G4–G5 sẽ hiển thị ở đây." /> : (
            <Table head={['Mã', 'Nhóm', 'G (36 th.)', 'Ngày']}>
              {d.needs_review.map((r: any) => (
                <tr key={r.patient_id}>
                  <Td><Link className="font-medium text-brand-700 underline" to={`/app/patients/${r.patient_id}`}>{r.code}</Link></Td>
                  <Td><ClusterBadge cluster={r.cluster} /></Td><Td>{r.stage_36m}</Td><Td>{fmtDate(r.at)}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
        <Card title="Phân bố nhóm xu hướng (lần dự đoán mới nhất)">
          <div style={{ height: 240 }} role="img" aria-label="Biểu đồ cột số bệnh nhân theo nhóm xu hướng">
            <ResponsiveContainer><BarChart data={chart}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="name" tick={{ fontSize: 12 }} /><YAxis allowDecimals={false} /><Tooltip /><Bar isAnimationActive={false} dataKey="Số bệnh nhân" fill="#0f766e" radius={[4, 4, 0, 0]} label={{ position: 'top', fontSize: 12 }} /></BarChart></ResponsiveContainer>
          </div>
        </Card>
      </div>
      <Card title="Hồ sơ mới cập nhật">
        {d.recent_patients.length === 0 ? <Empty title="Chưa có hồ sơ" hint="Tạo hồ sơ bệnh nhân đầu tiên để bắt đầu." action={<Link to="/app/patients/new" className="text-brand-700 underline">Tạo hồ sơ</Link>} /> : (
          <ul className="divide-y divide-slate-100 text-sm">{d.recent_patients.map((p: any) => (
            <li key={p.id} className="flex justify-between py-2"><Link className="font-medium text-brand-700 underline" to={`/app/patients/${p.id}`}>{p.code}</Link><span className="text-slate-500">{fmtDateTime(p.updated_at)}</span></li>))}</ul>)}
      </Card>
      <Disclaimer />
    </div>
  )
}

function PatientDash({ d }: { d: any }) {
  const run = useAsync(() => (d.latest_run_id ? api<Run>(`/api/predictions/${d.latest_run_id}`) : Promise.resolve(null)), [d.latest_run_id])
  if (!d.profile) return <Alert kind="info" title="Chưa có hồ sơ liên kết">Nhân viên y tế cần tạo hồ sơ và liên kết với email đăng ký của bạn. Hãy cung cấp email này cho cơ sở khám.</Alert>
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="eGFR gần nhất" value={d.latest_egfr != null ? `${num(d.latest_egfr)}` : '—'} hint="mL/phút/1,73m²" />
        <Stat label="Nhóm xu hướng" value={<ClusterBadge cluster={d.cluster} />} />
        <Stat label="Giai đoạn eGFR dự đoán ở tháng 36" value={d.stage_36m ?? '—'} hint="Phân loại theo eGFR, không phải chẩn đoán" />
      </div>
      <Card title="Biểu đồ eGFR" actions={d.latest_run_id && <Link className="text-sm text-brand-700 underline" to={`/app/predictions/${d.latest_run_id}`}>Xem chi tiết</Link>}>
        {run.loading ? <Spinner /> : run.data ? <EgfrChart history={run.data.history} results={run.data.results} /> : <Empty title="Chưa có dự đoán" hint="Khi nhân viên y tế thực hiện dự đoán, biểu đồ sẽ xuất hiện tại đây." />}
      </Card>
      <Card title="Lịch tái khám">
        {d.appointments.length === 0 ? <p className="text-sm text-slate-500">Chưa có lịch tái khám do nhân viên y tế ghi nhận.</p> : (
          <ul className="space-y-2 text-sm">{d.appointments.map((a: any, i: number) => <li key={i}><b>{fmtDate(a.due_date)}</b> – {a.body}</li>)}</ul>)}
      </Card>
      <Disclaimer />
    </div>
  )
}

function AdminDash({ d }: { d: any }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Người dùng" value={Object.values(d.users_by_role).reduce((a: number, b: any) => a + b, 0) as number}
          hint={`Admin ${d.users_by_role.admin ?? 0} · Y tế ${d.users_by_role.clinician ?? 0} · Bệnh nhân ${d.users_by_role.patient ?? 0}`} />
        <Stat label="Hồ sơ bệnh nhân" value={d.patients} />
        <Stat label="Lượt dự đoán" value={d.predictions_ok} hint={`24 giờ qua: ${d.predictions_24h} · lỗi: ${d.predictions_failed}`} />
        <Stat label="Thời gian xử lý TB" value={d.avg_latency_ms != null ? `${d.avg_latency_ms} ms` : '—'} />
      </div>
      {d.pending_users > 0 && <Alert kind="warn" title={`${d.pending_users} tài khoản chờ duyệt`}><Link to="/app/admin/users?status=pending" className="underline">Xem danh sách</Link></Alert>}
      <Card title="Đánh giá mô hình AI"><p className="mb-3 text-sm text-slate-600">Xem hiệu năng GRU + K-Means trên Train, Validation và Test, phiên bản mô hình và trạng thái API.</p>
        <Link to="/app/admin/model" className="text-sm font-medium text-brand-700 underline">Mở trang đánh giá mô hình</Link></Card>
    </div>
  )
}
