import { useState } from 'react'
import { Alert, Empty, PageTitle, Pagination, Select, Spinner, StatusBadge, Table, Td, useAsync } from '../../components/ui'
import { api } from '../../lib/api'
import { fmtDateTime } from '../../lib/labels'
import type { Page } from '../../lib/types'

/* eslint-disable @typescript-eslint/no-explicit-any */
export default function AdminLogs() {
  const [tab, setTab] = useState<'pred' | 'audit'>('pred')
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const url = tab === 'pred' ? `/api/admin/prediction-logs?page=${page}&status=${status}` : `/api/admin/audit-logs?page=${page}`
  const { data, loading, error } = useAsync(() => api<Page<any>>(url), [url])
  const sw = (t: 'pred' | 'audit') => { setTab(t); setPage(1) }
  return (
    <>
      <PageTitle title="Nhật ký hệ thống" subtitle="Chỉ ghi siêu dữ liệu vận hành (ai, làm gì, khi nào). Không chứa chỉ số y tế hay nội dung ghi chú." />
      <div className="mb-4 flex flex-wrap items-center gap-2" role="tablist">
        {([['pred', 'Lượt gọi API dự đoán'], ['audit', 'Nhật ký thao tác']] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => sw(k)} className={`min-h-10 rounded-lg border px-3 py-1.5 text-sm font-medium ${tab === k ? 'border-brand-700 bg-brand-700 text-white' : 'border-slate-300'}`}>{l}</button>))}
        {tab === 'pred' && <Select aria-label="Lọc trạng thái" className="ml-auto w-auto" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}><option value="">Tất cả</option><option value="success">Thành công</option><option value="failed">Lỗi</option></Select>}
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-2 sm:p-4">
        {loading ? <Spinner /> : error ? <Alert kind="error">{error}</Alert> : !data?.items.length ? <Empty title="Chưa có bản ghi" /> : (<>
          {tab === 'pred' ? (
            <Table head={['#', 'Thời điểm', 'Trạng thái', 'Thời gian xử lý', 'Phiên bản mô hình', 'Lỗi']}>
              {data.items.map((r) => (<tr key={r.id}><Td>{r.id}</Td><Td>{fmtDateTime(r.created_at)}</Td><Td><StatusBadge status={r.status} /></Td><Td>{r.latency_ms != null ? `${r.latency_ms} ms` : '—'}</Td><Td className="text-xs">{r.model_version ?? '—'}</Td><Td className="max-w-xs truncate text-xs text-red-800" title={r.error ?? ''}>{r.error ?? ''}</Td></tr>))}
            </Table>) : (
            <Table head={['Thời điểm', 'Người dùng', 'Hành động', 'Đối tượng', 'IP', 'Chi tiết']}>
              {data.items.map((r) => (<tr key={r.id}><Td className="whitespace-nowrap">{fmtDateTime(r.created_at)}</Td><Td className="break-all">{r.user ?? '—'}</Td><Td className="font-mono text-xs">{r.action}</Td><Td>{r.entity ? `${r.entity} #${r.entity_id ?? ''}` : '—'}</Td><Td className="text-xs">{r.ip}</Td><Td className="text-xs text-slate-600">{r.detail}</Td></tr>))}
            </Table>)}
          <Pagination page={page} pageSize={tab === 'pred' ? 20 : 30} total={data.total} onChange={setPage} /></>)}
      </div>
    </>
  )
}
