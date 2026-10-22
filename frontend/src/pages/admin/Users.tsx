import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { Alert, Button, Empty, Input, PageTitle, Pagination, Select, Spinner, StatusBadge, Table, Td, useAsync } from '../../components/ui'
import { api, ApiError } from '../../lib/api'
import { fmtDateTime } from '../../lib/labels'
import type { Page, Role, User } from '../../lib/types'

const ROLE: Record<Role, string> = { admin: 'Admin', clinician: 'Nhân viên y tế', patient: 'Bệnh nhân' }

export default function AdminUsers() {
  const { user: me } = useAuth()
  const [sp] = useSearchParams()
  const [q, setQ] = useState('')
  const [applied, setApplied] = useState('')
  const [role, setRole] = useState('')
  const [status, setStatus] = useState(sp.get('status') ?? '')
  const [page, setPage] = useState(1)
  const [msg, setMsg] = useState<string | null>(null)
  const { data, loading, error, reload } = useAsync(
    () => api<Page<User>>(`/api/admin/users?page=${page}&q=${encodeURIComponent(applied)}&role=${role}&status=${status}`), [page, applied, role, status])

  const patch = async (u: User, body: { role?: Role; status?: string }, label: string) => {
    if (!window.confirm(`${label} cho ${u.email}?`)) return
    try { await api(`/api/admin/users/${u.id}`, { method: 'PATCH', body }); setMsg(null); reload() }
    catch (ex) { setMsg(ex instanceof ApiError ? ex.message : 'Thất bại') }
  }
  return (
    <>
      <PageTitle title="Quản lý người dùng" subtitle="Duyệt tài khoản nhân viên y tế, đổi vai trò, khoá/mở khoá. Mật khẩu được băm, không thể xem." />
      {msg && <div className="mb-3"><Alert kind="error">{msg}</Alert></div>}
      <form className="mb-4 flex flex-wrap gap-2" role="search" onSubmit={(e) => { e.preventDefault(); setPage(1); setApplied(q) }}>
        <Input aria-label="Tìm người dùng" placeholder="Tìm theo tên hoặc email…" className="min-w-52 flex-1" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select aria-label="Lọc vai trò" className="w-auto" value={role} onChange={(e) => { setRole(e.target.value); setPage(1) }}><option value="">Mọi vai trò</option>{Object.entries(ROLE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        <Select aria-label="Lọc trạng thái" className="w-auto" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}><option value="">Mọi trạng thái</option><option value="active">Đang hoạt động</option><option value="pending">Chờ duyệt</option><option value="disabled">Đã khoá</option></Select>
        <Button type="submit" variant="secondary">Tìm</Button>
      </form>
      <div className="rounded-xl border border-slate-200 bg-white p-2 sm:p-4">
        {loading ? <Spinner /> : error ? <Alert kind="error">{error}</Alert> : !data?.items.length ? <Empty title="Không có người dùng phù hợp" /> : (<>
          <Table head={['Họ tên', 'Email', 'Vai trò', 'Trạng thái', 'Đăng nhập gần nhất', 'Thao tác']}>
            {data.items.map((u) => (
              <tr key={u.id}>
                <Td className="font-medium">{u.full_name}</Td><Td className="break-all">{u.email}</Td><Td>{ROLE[u.role]}</Td><Td><StatusBadge status={u.status} /></Td><Td>{fmtDateTime(u.last_login_at)}</Td>
                <Td>{u.id === me?.id ? <span className="text-xs text-slate-400">Tài khoản của bạn</span> : (
                  <div className="flex flex-wrap gap-1">
                    {u.status === 'pending' && <Button onClick={() => patch(u, { status: 'active' }, 'Duyệt tài khoản')}>Duyệt</Button>}
                    {u.status === 'active' && <Button variant="secondary" onClick={() => patch(u, { status: 'disabled' }, 'Khoá tài khoản')}>Khoá</Button>}
                    {u.status === 'disabled' && <Button variant="secondary" onClick={() => patch(u, { status: 'active' }, 'Mở khoá')}>Mở khoá</Button>}
                    <Select aria-label={`Vai trò của ${u.email}`} className="w-auto" value={u.role} onChange={(e) => patch(u, { role: e.target.value as Role }, `Đổi vai trò thành ${ROLE[e.target.value as Role]}`)}>
                      {Object.entries(ROLE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
                  </div>)}</Td>
              </tr>))}
          </Table>
          <Pagination page={page} pageSize={20} total={data.total} onChange={setPage} /></>)}
      </div>
    </>
  )
}
