import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Alert, Button, Card, Check, Field, Input, PageTitle, Select } from '../components/ui'
import { api, ApiError } from '../lib/api'
import { CODING_NOTE, ETIOLOGY_LABEL, GENDER_LABEL } from '../lib/labels'
import type { Patient } from '../lib/types'

export default function PatientNew() {
  const nav = useNavigate()
  const { user } = useAuth()
  const self = user?.role === 'patient'
  const [f, setF] = useState({ gender: 1, etiology: 1, hypertension: false, diabetes: false, cvd: false, linked_email: '', is_demo: false })
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr(null)
    try {
      const p = await api<Patient>('/api/patients', { method: 'POST', body: { ...f, linked_email: f.linked_email.trim() || null } })
      nav(self ? `/app/patients/${p.id}/predict` : `/app/patients/${p.id}`)
    } catch (ex) { setErr(ex instanceof ApiError ? ex.message : 'Không tạo được hồ sơ') } finally { setBusy(false) }
  }
  return (
    <>
      <PageTitle title={self ? 'Tạo hồ sơ của tôi' : 'Tạo hồ sơ bệnh nhân'} subtitle="Chỉ thu thập thông tin cần thiết cho mô hình. Hệ thống tự sinh mã nội bộ; không nhập họ tên hay số định danh." />
      <form onSubmit={submit} className="max-w-2xl space-y-6">
        {err && <Alert kind="error">{err}</Alert>}
        <Card title="Thông tin nền">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Giới tính (mã hoá)" required hint={CODING_NOTE}>
              <Select value={f.gender} onChange={(e) => setF({ ...f, gender: Number(e.target.value) })}>{[1, 2].map((g) => <option key={g} value={g}>{GENDER_LABEL[g]}</option>)}</Select></Field>
            <Field label="Nhóm nguyên nhân bệnh thận" required hint={CODING_NOTE}>
              <Select value={f.etiology} onChange={(e) => setF({ ...f, etiology: Number(e.target.value) })}>{[1, 2, 3, 4].map((g) => <option key={g} value={g}>{ETIOLOGY_LABEL[g]}</option>)}</Select></Field>
          </div>
        </Card>
        <Card title="Tiền sử và bệnh đồng mắc">
          <Check label="Tăng huyết áp" checked={f.hypertension} onChange={(v) => setF({ ...f, hypertension: v })} />
          <Check label="Đái tháo đường" checked={f.diabetes} onChange={(v) => setF({ ...f, diabetes: v })} />
          <Check label="Bệnh tim mạch" checked={f.cvd} onChange={(v) => setF({ ...f, cvd: v })} />
        </Card>
        {!self && <Card title="Liên kết tài khoản bệnh nhân (tuỳ chọn)">
          <Field label="Email đăng ký của bệnh nhân" hint="Nếu nhập, bệnh nhân có thể xem hồ sơ khi đăng nhập bằng email này.">
            <Input type="email" value={f.linked_email} onChange={(e) => setF({ ...f, linked_email: e.target.value })} /></Field>
          <div className="mt-3"><Check label="Đây là dữ liệu minh hoạ (không phải bệnh nhân thật)" checked={f.is_demo} onChange={(v) => setF({ ...f, is_demo: v })} /></div>
        </Card>}
        <Button type="submit" loading={busy}>{self ? 'Tạo hồ sơ và tiếp tục nhập dữ liệu' : 'Tạo hồ sơ'}</Button>
      </form>
    </>
  )
}
