import { Plus, Search } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Alert, Button, ClusterBadge, DemoBadge, Empty, Input, PageTitle, Pagination, Select, Spinner, Table, Td, useAsync } from '../components/ui'
import { api } from '../lib/api'
import { CLUSTER_ORDER, fmtDate, num } from '../lib/labels'
import type { Page, Patient } from '../lib/types'

export default function Patients() {
  const { user } = useAuth()
  const [q, setQ] = useState('')
  const [applied, setApplied] = useState('')
  const [cluster, setCluster] = useState('')
  const [page, setPage] = useState(1)
  const { data, error, loading } = useAsync(
    () => api<Page<Patient>>(`/api/patients?page=${page}&page_size=15&q=${encodeURIComponent(applied)}&cluster=${encodeURIComponent(cluster)}`),
    [page, applied, cluster],
  )
  const isDoc = user?.role === 'clinician'
  return (
    <>
      <PageTitle title={isDoc ? 'Bệnh nhân' : 'Hồ sơ của tôi'}
        subtitle={isDoc ? 'Chỉ hiển thị các hồ sơ bạn được phân công hoặc cấp quyền.' : undefined}
        actions={isDoc && <Link to="/app/patients/new"><Button><Plus className="h-4 w-4" aria-hidden /> Tạo hồ sơ</Button></Link>} />
      {isDoc && (
        <form className="mb-4 flex flex-wrap gap-2" role="search" onSubmit={(e) => { e.preventDefault(); setPage(1); setApplied(q) }}>
          <div className="relative min-w-52 flex-1"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" aria-hidden />
            <Input aria-label="Tìm theo mã hoặc email" placeholder="Tìm theo mã hoặc email…" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <Select aria-label="Lọc theo nhóm xu hướng" className="w-auto" value={cluster} onChange={(e) => { setCluster(e.target.value); setPage(1) }}>
            <option value="">Mọi nhóm</option>{CLUSTER_ORDER.map((c) => <option key={c}>{c}</option>)}</Select>
          <Button type="submit" variant="secondary">Tìm</Button>
        </form>)}
      <div className="rounded-xl border border-slate-200 bg-white p-2 sm:p-4">
        {loading ? <Spinner /> : error ? <Alert kind="error">{error}</Alert> : !data || data.items.length === 0 ? (
          <Empty title="Không có hồ sơ" hint={isDoc ? 'Tạo hồ sơ mới hoặc thay đổi bộ lọc.' : 'Nhân viên y tế cần tạo hồ sơ và liên kết với email của bạn.'} />
        ) : (
          <>
            <Table head={['Mã', 'eGFR gần nhất', 'Nhóm xu hướng', 'Dự đoán gần nhất', 'Cập nhật']}>
              {data.items.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <Td><Link to={`/app/patients/${p.id}`} className="font-medium text-brand-700 underline">{p.code}</Link> {p.is_demo && <DemoBadge />}</Td>
                  <Td>{num(p.latest_egfr)}</Td><Td><ClusterBadge cluster={p.latest_cluster} /></Td>
                  <Td>{fmtDate(p.latest_prediction_at)}</Td><Td>{fmtDate(p.updated_at)}</Td>
                </tr>))}
            </Table>
            <Pagination page={page} pageSize={15} total={data.total} onChange={setPage} />
          </>)}
      </div>
    </>
  )
}
