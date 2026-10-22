import { CalendarClock, FilePlus2, Share2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { EgfrChart } from '../components/EgfrChart'
import { Alert, Button, Card, Check, ClusterBadge, DemoBadge, Disclaimer, Empty, Field, Input, PageTitle, Select, Spinner, Table, Td, useAsync } from '../components/ui'
import { api, ApiError } from '../lib/api'
import { CODING_NOTE, ETIOLOGY_LABEL, GENDER_LABEL, fmtDate, fmtDateTime, num } from '../lib/labels'
import type { Measurement, Note, Patient, Run } from '../lib/types'

const KIND_LABEL = { note: 'Ghi chú', plan: 'Kế hoạch theo dõi', follow_up: 'Lịch tái khám' }

export default function PatientDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const isDoc = user?.role === 'clinician'
  const patient = useAsync(() => api<Patient>(`/api/patients/${id}`), [id])
  const runs = useAsync(() => api<Run[]>(`/api/patients/${id}/predictions`), [id])
  const meas = useAsync(() => api<Measurement[]>(`/api/patients/${id}/measurements`), [id])
  const notes = useAsync(() => api<Note[]>(`/api/patients/${id}/notes`), [id])
  const [cmpId, setCmpId] = useState<string>('')

  if (patient.loading) return <Spinner />
  if (patient.error || !patient.data) return <Alert kind="error">{patient.error ?? 'Không tìm thấy hồ sơ'}</Alert>
  const p = patient.data
  const latest = runs.data?.[0]
  const cmp = runs.data?.find((r) => String(r.id) === cmpId)

  return (
    <>
      <PageTitle title={`Hồ sơ ${p.code}`} subtitle={<span className="flex flex-wrap items-center gap-2">Cập nhật {fmtDateTime(p.updated_at)} {p.is_demo && <DemoBadge />}</span>}
        actions={<Link to={`/app/patients/${p.id}/predict`}><Button><FilePlus2 className="h-4 w-4" aria-hidden /> Nhập dữ liệu &amp; dự đoán</Button></Link>} />
      <div className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6">
            <ProfileCard p={p} editable onSaved={patient.reload} showEmail={isDoc} />
            <ShareCard id={p.id} self={!isDoc} />
          </div>
          <div className="lg:col-span-2">
            <Card title="Biểu đồ eGFR – lần dự đoán mới nhất" actions={latest && <Link className="text-sm text-brand-700 underline" to={`/app/predictions/${latest.id}`}>Xem kết quả đầy đủ</Link>}>
              {runs.loading ? <Spinner /> : !latest ? <Empty title="Chưa có dự đoán" hint="Nhập eGFR các mốc 0/6/12 tháng và chỉ số lâm sàng để dự đoán." /> : (
                <>
                  <div className="mb-3 flex flex-wrap items-center gap-3 text-sm"><ClusterBadge cluster={latest.cluster} size="lg" /><span className="text-slate-500">{fmtDateTime(latest.created_at)}</span></div>
                  <EgfrChart history={latest.history} results={latest.results} compare={cmp ? { label: `So sánh: ${fmtDate(cmp.created_at)} (#${cmp.id})`, results: cmp.results } : null} />
                  {runs.data!.length > 1 && (
                    <div className="mt-3 max-w-xs"><Field label="So sánh với lần dự đoán trước">
                      <Select value={cmpId} onChange={(e) => setCmpId(e.target.value)}><option value="">Không so sánh</option>
                        {runs.data!.slice(1).map((r) => <option key={r.id} value={r.id}>#{r.id} – {fmtDateTime(r.created_at)}</option>)}</Select></Field></div>)}
                </>)}
            </Card>
          </div>
        </div>

        <Card title="Lịch sử dự đoán">
          {runs.loading ? <Spinner /> : !runs.data?.length ? <Empty title="Chưa có lần dự đoán" /> : (
            <Table head={['#', 'Thời điểm', 'Nhóm xu hướng', 'eGFR 18→36 tháng', 'G (36 th.)', 'Độ tin cậy', 'Người nhập', 'Mô hình']}>
              {runs.data.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <Td><Link className="font-medium text-brand-700 underline" to={`/app/predictions/${r.id}`}>#{r.id}</Link></Td>
                  <Td>{fmtDateTime(r.created_at)}</Td><Td><ClusterBadge cluster={r.cluster} /></Td>
                  <Td className="whitespace-nowrap">{r.results.map((x) => num(x.egfr_pred)).join(' → ')}</Td>
                  <Td>{r.stage_36m}</Td><Td>{r.confidence}</Td><Td className="text-xs">{r.requested_by_role === 'patient' ? 'Bệnh nhân' : 'Nhân viên y tế'}</Td><Td className="text-xs text-slate-500">{r.model_version}</Td>
                </tr>))}
            </Table>)}
        </Card>

        <Card title="Dữ liệu xét nghiệm đã nhập">
          {meas.loading ? <Spinner /> : !meas.data?.length ? <Empty title="Chưa có dữ liệu xét nghiệm" /> : (
            <Table head={['Ngày ghi nhận', 'Tuổi', 'HA tâm thu (mmHg)', 'Albumin (g/dL)', 'UPCR (g/g)', 'eGFR 0 / 6 / 12 tháng']}>
              {meas.data.map((m) => {
                const by = Object.fromEntries(m.egfr.map((e) => [e.month, e.value]))
                return (<tr key={m.id}><Td>{fmtDate(m.recorded_on)}</Td><Td>{num(m.age_years, 0)}</Td><Td>{num(m.sbp, 0)}</Td><Td>{num(m.albumin)}</Td>
                  <Td>{m.upcr == null ? 'Chưa đo' : num(m.upcr, 2)}</Td><Td>{[0, 6, 12].map((k) => (by[k] != null ? num(by[k]) : '—')).join(' / ')}</Td></tr>)
              })}
            </Table>)}
        </Card>

        <NotesCard id={p.id} notes={notes.data} loading={notes.loading} editable={isDoc} onAdded={notes.reload} />
        <Disclaimer />
      </div>
    </>
  )
}

function ProfileCard({ p, editable, onSaved, showEmail }: { p: Patient; editable: boolean; onSaved: () => void; showEmail: boolean }) {
  const [edit, setEdit] = useState(false)
  const [f, setF] = useState({ gender: p.gender, etiology: p.etiology, hypertension: p.hypertension, diabetes: p.diabetes, cvd: p.cvd })
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true); setErr(null)
    try { await api(`/api/patients/${p.id}`, { method: 'PATCH', body: f }); setEdit(false); onSaved() }
    catch (ex) { setErr(ex instanceof ApiError ? ex.message : 'Lưu thất bại') } finally { setBusy(false) }
  }
  const yes = (v: boolean) => (v ? 'Có' : 'Không')
  return (
    <Card title="Thông tin nền" actions={editable && !edit && <button className="text-sm text-brand-700 underline" onClick={() => setEdit(true)}>Sửa</button>}>
      {!edit ? (
        <dl className="grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-slate-500">Mã nội bộ</dt><dd className="font-medium">{p.code}</dd>
          <dt className="text-slate-500">Giới tính (mã hoá)</dt><dd>{GENDER_LABEL[p.gender]}</dd>
          <dt className="text-slate-500">Nhóm nguyên nhân</dt><dd>{ETIOLOGY_LABEL[p.etiology]}</dd>
          <dt className="text-slate-500">Tăng huyết áp</dt><dd>{yes(p.hypertension)}</dd>
          <dt className="text-slate-500">Đái tháo đường</dt><dd>{yes(p.diabetes)}</dd>
          <dt className="text-slate-500">Bệnh tim mạch</dt><dd>{yes(p.cvd)}</dd>
          {showEmail && (<><dt className="text-slate-500">Email liên kết</dt><dd className="break-all">{p.linked_email ?? '—'}</dd></>)}
        </dl>
      ) : (
        <div className="space-y-3">
          {err && <Alert kind="error">{err}</Alert>}
          <Field label="Giới tính (mã hoá)" hint={CODING_NOTE}><Select value={f.gender} onChange={(e) => setF({ ...f, gender: Number(e.target.value) as 1 | 2 })}>{[1, 2].map((g) => <option key={g} value={g}>{GENDER_LABEL[g]}</option>)}</Select></Field>
          <Field label="Nhóm nguyên nhân"><Select value={f.etiology} onChange={(e) => setF({ ...f, etiology: Number(e.target.value) as 1 | 2 | 3 | 4 })}>{[1, 2, 3, 4].map((g) => <option key={g} value={g}>{ETIOLOGY_LABEL[g]}</option>)}</Select></Field>
          <Check label="Tăng huyết áp" checked={f.hypertension} onChange={(v) => setF({ ...f, hypertension: v })} />
          <Check label="Đái tháo đường" checked={f.diabetes} onChange={(v) => setF({ ...f, diabetes: v })} />
          <Check label="Bệnh tim mạch" checked={f.cvd} onChange={(v) => setF({ ...f, cvd: v })} />
          <div className="flex gap-2"><Button onClick={save} loading={busy}>Lưu</Button><Button variant="secondary" onClick={() => setEdit(false)}>Huỷ</Button></div>
        </div>)}
    </Card>
  )
}

function ShareCard({ id, self }: { id: number; self: boolean }) {
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState<{ k: 'success' | 'error'; t: string } | null>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    try { await api(`/api/patients/${id}/assignments`, { method: 'POST', body: { clinician_email: email.trim() } }); setMsg({ k: 'success', t: 'Đã cấp quyền truy cập.' }); setEmail('') }
    catch (ex) { setMsg({ k: 'error', t: ex instanceof ApiError ? ex.message : 'Thất bại' }) }
  }
  return (
    <Card title={<span className="flex items-center gap-2"><Share2 className="h-4 w-4" aria-hidden />{self ? 'Chia sẻ với bác sĩ' : 'Chia sẻ hồ sơ'}</span>}>
      <form onSubmit={submit} className="space-y-3">
        {msg && <Alert kind={msg.k}>{msg.t}</Alert>}
        <Field label="Email nhân viên y tế được cấp quyền" hint={self ? 'Bác sĩ này sẽ xem được hồ sơ, dữ liệu và kết quả dự đoán của bạn, và có thể ghi chú theo dõi.' : undefined}><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Button type="submit" variant="secondary">Cấp quyền</Button>
      </form>
    </Card>
  )
}

function NotesCard({ id, notes, loading, editable, onAdded }: { id: number; notes: Note[] | null; loading: boolean; editable: boolean; onAdded: () => void }) {
  const [f, setF] = useState({ kind: 'note', body: '', due_date: '', visible_to_patient: false })
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null)
    try {
      await api(`/api/patients/${id}/notes`, { method: 'POST', body: { ...f, due_date: f.due_date || null } })
      setF({ kind: 'note', body: '', due_date: '', visible_to_patient: false }); onAdded()
    } catch (ex) { setErr(ex instanceof ApiError ? ex.message : 'Thất bại') } finally { setBusy(false) }
  }
  return (
    <Card title="Ghi chú, kế hoạch theo dõi & lịch tái khám">
      <p className="mb-3 text-xs text-slate-500">Nội dung do nhân viên y tế nhập và chịu trách nhiệm. Hệ thống không tự đề xuất phác đồ hay liều thuốc.</p>
      {editable && (
        <form onSubmit={submit} className="mb-5 space-y-3 rounded-lg bg-slate-50 p-4">
          {err && <Alert kind="error">{err}</Alert>}
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Loại"><Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
            {f.kind === 'follow_up' && <Field label="Ngày hẹn" required><Input type="date" required value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} /></Field>}
          </div>
          <Field label="Nội dung" required><textarea required maxLength={4000} rows={3} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></Field>
          <Check label="Cho bệnh nhân xem" checked={f.visible_to_patient} onChange={(v) => setF({ ...f, visible_to_patient: v })} />
          <Button type="submit" loading={busy}>Lưu</Button>
        </form>)}
      {loading ? <Spinner /> : !notes?.length ? <Empty title="Chưa có ghi chú" /> : (
        <ul className="space-y-3">{notes.map((n) => (
          <li key={n.id} className="rounded-lg border border-slate-200 p-3 text-sm">
            <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-700">{KIND_LABEL[n.kind]}</span>
              {n.due_date && <span className="inline-flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" aria-hidden />{fmtDate(n.due_date)}</span>}
              <span>{n.author_name} · {fmtDateTime(n.created_at)}</span>{editable && !n.visible_to_patient && <span>(nội bộ)</span>}
            </div>
            <p className="whitespace-pre-wrap">{n.body}</p>
          </li>))}</ul>)}
    </Card>
  )
}
