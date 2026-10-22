import { Download, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Alert, Button, Card, Check, Disclaimer, Field, Input, PageTitle, Spinner, useAsync } from '../components/ui'
import { api, ApiError } from '../lib/api'
import { ETIOLOGY_LABEL, GENDER_LABEL } from '../lib/labels'
import type { Measurement, Patient, Run } from '../lib/types'

const STEPS = ['Thông tin cơ bản', 'Tiền sử & bệnh đồng mắc', 'Chỉ số lâm sàng', 'Lịch sử eGFR', 'Xác nhận']
const TEMPLATE = 'recorded_on,age_years,sbp,albumin,upcr,egfr_0m,egfr_6m,egfr_12m\n2026-01-15,65,140,3.8,0.9,45.5,43.0,45.3\n'

interface Form {
  recorded_on: string; age_years: string; sbp: string; albumin: string; upcr: string; upcr_unknown: boolean
  egfr_0: string; egfr_6: string; egfr_12: string; no6: boolean; no12: boolean
}
const today = new Date().toISOString().slice(0, 10)
const EMPTY: Form = { recorded_on: today, age_years: '', sbp: '', albumin: '', upcr: '', upcr_unknown: false, egfr_0: '', egfr_6: '', egfr_12: '', no6: false, no12: false }

const RANGE = {
  age_years: [18, 110, 'Tuổi'], sbp: [50, 300, 'Huyết áp tâm thu'], albumin: [1, 6, 'Albumin'], upcr: [0, 50, 'UPCR'], egfr: [1, 200, 'eGFR'],
} as const

function checkRange(v: string, [lo, hi, name]: readonly [number, number, string]): string | undefined {
  if (v.trim() === '') return `${name} là bắt buộc`
  const n = Number(v)
  if (!Number.isFinite(n)) return `${name} phải là số`
  if (n < lo || n > hi) return `${name} phải trong khoảng ${lo}–${hi}`
}

export default function PredictNew() {
  const { id } = useParams()
  const nav = useNavigate()
  const patient = useAsync(() => api<Patient>(`/api/patients/${id}`), [id])
  const [step, setStep] = useState(0)
  const [f, setF] = useState<Form>(EMPTY)
  const [prof, setProf] = useState<Pick<Patient, 'hypertension' | 'diabetes' | 'cvd'> | null>(null)
  const [errs, setErrs] = useState<Record<string, string>>({})
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [fail, setFail] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  if (patient.loading) return <Spinner />
  if (!patient.data) return <Alert kind="error">{patient.error ?? 'Không tìm thấy hồ sơ'}</Alert>
  const p = patient.data
  const history = prof ?? { hypertension: p.hypertension, diabetes: p.diabetes, cvd: p.cvd }
  const set = (k: keyof Form, v: string | boolean) => setF((x) => ({ ...x, [k]: v }))

  const validate = (s: number): Record<string, string> => {
    const e: Record<string, string> = {}
    if (s === 0) {
      if (!f.recorded_on) e.recorded_on = 'Ngày ghi nhận là bắt buộc'
      const a = checkRange(f.age_years, RANGE.age_years); if (a) e.age_years = a
    }
    if (s === 2) {
      const a = checkRange(f.sbp, RANGE.sbp); if (a) e.sbp = a
      const b = checkRange(f.albumin, RANGE.albumin); if (b) e.albumin = b
      if (!f.upcr_unknown) { const c = checkRange(f.upcr, RANGE.upcr); if (c) e.upcr = c }
    }
    if (s === 3) {
      const a = checkRange(f.egfr_0, RANGE.egfr); if (a) e.egfr_0 = 'eGFR tháng 0: ' + a.replace('eGFR ', '')
      if (!f.no6) { const b = checkRange(f.egfr_6, RANGE.egfr); if (b) e.egfr_6 = 'eGFR tháng 6: ' + b.replace('eGFR ', '') }
      if (!f.no12) { const c = checkRange(f.egfr_12, RANGE.egfr); if (c) e.egfr_12 = 'eGFR tháng 12: ' + c.replace('eGFR ', '') }
    }
    return e
  }
  const next = () => { const e = validate(step); setErrs(e); if (!Object.keys(e).length) setStep(step + 1) }

  const importCsv = async (file: File) => {
    const lines = (await file.text()).trim().split(/\r?\n/)
    if (lines.length < 2) { setFail('Tệp CSV cần có dòng tiêu đề và 1 dòng dữ liệu.'); return }
    const head = lines[0].split(',').map((s) => s.trim())
    const row = Object.fromEntries(lines[1].split(',').map((v, i) => [head[i], v.trim()]))
    const need = ['age_years', 'sbp', 'albumin', 'egfr_0m']
    const miss = need.filter((k) => !row[k])
    if (miss.length) { setFail(`Thiếu cột/giá trị bắt buộc: ${miss.join(', ')}`); return }
    setFail(null)
    setF({ ...EMPTY, recorded_on: row.recorded_on || today, age_years: row.age_years, sbp: row.sbp, albumin: row.albumin,
      upcr: row.upcr ?? '', upcr_unknown: !row.upcr, egfr_0: row.egfr_0m, egfr_6: row.egfr_6m ?? '', egfr_12: row.egfr_12m ?? '',
      no6: !row.egfr_6m, no12: !row.egfr_12m })
    setStep(4)
  }

  const submit = async () => {
    setBusy(true); setFail(null)
    try {
      if (history.hypertension !== p.hypertension || history.diabetes !== p.diabetes || history.cvd !== p.cvd)
        await api(`/api/patients/${p.id}`, { method: 'PATCH', body: history })
      const egfr = [{ month: 0, value: Number(f.egfr_0) }]
      if (!f.no6) egfr.push({ month: 6, value: Number(f.egfr_6) })
      if (!f.no12) egfr.push({ month: 12, value: Number(f.egfr_12) })
      const m = await api<Measurement>(`/api/patients/${p.id}/measurements`, { method: 'POST', body: {
        recorded_on: f.recorded_on, age_years: Number(f.age_years), sbp: Number(f.sbp), albumin: Number(f.albumin),
        upcr: f.upcr_unknown ? null : Number(f.upcr), egfr } })
      const run = await api<Run>(`/api/patients/${p.id}/predict`, { method: 'POST', body: { measurement_id: m.id } })
      nav(`/app/predictions/${run.id}`)
    } catch (ex) {
      if (ex instanceof ApiError && ex.details?.length) setFail(ex.details.map((d) => `${d.field}: ${d.message}`).join('; '))
      else setFail(ex instanceof ApiError ? ex.message : 'Có lỗi xảy ra')
    } finally { setBusy(false) }
  }

  const visits = 1 + Number(!f.no6) + Number(!f.no12)
  return (
    <>
      <PageTitle title={`Nhập dữ liệu & dự đoán – ${p.code}`} subtitle="Điền theo từng bước. Không có giá trị mặc định: dữ liệu chưa có phải được đánh dấu rõ là chưa có."
        actions={<>
          <Button variant="secondary" onClick={() => { const u = URL.createObjectURL(new Blob([TEMPLATE], { type: 'text/csv' })); const a = document.createElement('a'); a.href = u; a.download = 'mau_du_lieu.csv'; a.click(); URL.revokeObjectURL(u) }}><Download className="h-4 w-4" aria-hidden /> Tệp mẫu CSV</Button>
          <Button variant="secondary" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" aria-hidden /> Nhập từ CSV</Button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => { const x = e.target.files?.[0]; if (x) importCsv(x); e.target.value = '' }} />
        </>} />
      <ol className="mb-6 flex flex-wrap gap-2 text-sm" aria-label="Các bước">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === step ? 'step' : undefined}
            className={`rounded-full border px-3 py-1 ${i === step ? 'border-brand-700 bg-brand-700 text-white' : i < step ? 'border-brand-600 text-brand-800' : 'border-slate-300 text-slate-500'}`}>{i + 1}. {s}</li>))}
      </ol>
      {fail && <div className="mb-4"><Alert kind="error">{fail}</Alert></div>}

      <div className="max-w-2xl space-y-6">
        {step === 0 && <Card title="Thông tin cơ bản">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Ngày ghi nhận (mốc tháng 0)" required error={errs.recorded_on}><Input type="date" max={today} value={f.recorded_on} onChange={(e) => set('recorded_on', e.target.value)} /></Field>
            <Field label="Tuổi" unit="năm" required error={errs.age_years} hint="18–110"><Input inputMode="decimal" value={f.age_years} onChange={(e) => set('age_years', e.target.value)} /></Field>
          </div>
          <p className="mt-4 text-sm text-slate-600">Giới tính (mã hoá): <b>{GENDER_LABEL[p.gender]}</b> · Nhóm nguyên nhân: <b>{ETIOLOGY_LABEL[p.etiology]}</b> (sửa tại hồ sơ bệnh nhân).</p>
        </Card>}

        {step === 1 && <Card title="Tiền sử & bệnh đồng mắc">
          <Check label="Tăng huyết áp" checked={history.hypertension} onChange={(v) => setProf({ ...history, hypertension: v })} />
          <Check label="Đái tháo đường" checked={history.diabetes} onChange={(v) => setProf({ ...history, diabetes: v })} />
          <Check label="Bệnh tim mạch" checked={history.cvd} onChange={(v) => setProf({ ...history, cvd: v })} />
          <p className="mt-3 text-xs text-slate-500">Không tích nghĩa là “không có”. Hãy xác nhận lại với hồ sơ khám trước khi tiếp tục.</p>
        </Card>}

        {step === 2 && <Card title="Chỉ số lâm sàng">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Huyết áp tâm thu" unit="mmHg" required error={errs.sbp} hint="50–300"><Input inputMode="decimal" value={f.sbp} onChange={(e) => set('sbp', e.target.value)} /></Field>
            <Field label="Albumin huyết thanh" unit="g/dL" required error={errs.albumin} hint="1–6"><Input inputMode="decimal" value={f.albumin} onChange={(e) => set('albumin', e.target.value)} /></Field>
            <div>
              <Field label="UPCR (đạm niệu/creatinine niệu)" unit="g/g" required={!f.upcr_unknown} error={errs.upcr} hint="0–50"><Input inputMode="decimal" disabled={f.upcr_unknown} value={f.upcr} onChange={(e) => set('upcr', e.target.value)} /></Field>
              <Check label="Chưa có kết quả UPCR" checked={f.upcr_unknown} onChange={(v) => set('upcr_unknown', v)} />
              {f.upcr_unknown && <p className="text-xs text-amber-800">Mô hình sẽ dùng giá trị điền thiếu cố định của tập huấn luyện và đánh dấu cờ “thiếu UPCR”; độ tin cậy giảm.</p>}
            </div>
          </div>
        </Card>}

        {step === 3 && <Card title="Lịch sử eGFR (mL/phút/1,73m²)">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Tháng 0" unit="mL/phút/1,73m²" required error={errs.egfr_0}><Input inputMode="decimal" value={f.egfr_0} onChange={(e) => set('egfr_0', e.target.value)} /></Field>
            <div><Field label="Tháng 6" required={!f.no6} error={errs.egfr_6}><Input inputMode="decimal" disabled={f.no6} value={f.egfr_6} onChange={(e) => set('egfr_6', e.target.value)} /></Field>
              <Check label="Không có lần đo này" checked={f.no6} onChange={(v) => set('no6', v)} /></div>
            <div><Field label="Tháng 12" required={!f.no12} error={errs.egfr_12}><Input inputMode="decimal" disabled={f.no12} value={f.egfr_12} onChange={(e) => set('egfr_12', e.target.value)} /></Field>
              <Check label="Không có lần đo này" checked={f.no12} onChange={(v) => set('no12', v)} /></div>
          </div>
          <p className="mt-3 text-xs text-slate-500">Khoảng hợp lệ 1–200. Thiếu lần đo vẫn dự đoán được nhưng độ tin cậy thấp hơn.</p>
        </Card>}

        {step === 4 && <Card title="Xác nhận trước khi dự đoán">
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-slate-500">Hồ sơ</dt><dd>{p.code}</dd>
            <dt className="text-slate-500">Ngày ghi nhận</dt><dd>{f.recorded_on}</dd>
            <dt className="text-slate-500">Tuổi</dt><dd>{f.age_years} năm</dd>
            <dt className="text-slate-500">Tiền sử</dt><dd>{[history.hypertension && 'Tăng huyết áp', history.diabetes && 'Đái tháo đường', history.cvd && 'Tim mạch'].filter(Boolean).join(', ') || 'Không ghi nhận'}</dd>
            <dt className="text-slate-500">Huyết áp tâm thu</dt><dd>{f.sbp} mmHg</dd>
            <dt className="text-slate-500">Albumin</dt><dd>{f.albumin} g/dL</dd>
            <dt className="text-slate-500">UPCR</dt><dd>{f.upcr_unknown ? 'Chưa có' : `${f.upcr} g/g`}</dd>
            <dt className="text-slate-500">eGFR tháng 0 / 6 / 12</dt><dd>{f.egfr_0} / {f.no6 ? '—' : f.egfr_6} / {f.no12 ? '—' : f.egfr_12}</dd>
            <dt className="text-slate-500">Số lần đo eGFR</dt><dd>{visits}/3</dd>
          </dl>
          {visits < 3 && <div className="mt-3"><Alert kind="warn">Thiếu {3 - visits} lần đo eGFR: độ tin cậy dự đoán sẽ {visits === 1 ? 'thấp' : 'ở mức trung bình'}.</Alert></div>}
          <div className="mt-4"><Check label="Tôi đã kiểm tra dữ liệu ở trên và xác nhận gửi cho mô hình." checked={confirmed} onChange={setConfirmed} /></div>
        </Card>}

        <div className="flex gap-2">
          {step > 0 && <Button variant="secondary" onClick={() => { setErrs({}); setStep(step - 1) }}>Quay lại</Button>}
          {step < 4 ? <Button onClick={next}>Tiếp tục</Button> : <Button onClick={submit} loading={busy} disabled={!confirmed}>{busy ? 'Đang dự đoán…' : 'Dự đoán'}</Button>}
        </div>
        <Disclaimer />
      </div>
    </>
  )
}
