import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Brand } from '../components/Layout'
import { Alert, Button, Field, Input, Select } from '../components/ui'
import { api, ApiError } from '../lib/api'

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center"><Brand /></div>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="mb-5 text-xl font-semibold text-slate-900">{title}</h1>
          {children}
        </div>
      </div>
    </div>
  )
}

export function Login() {
  const { user, login, sessionExpired } = useAuth()
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  if (user) return <Navigate to="/app" replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr(null)
    try { await login(email.trim(), password); nav('/app') }
    catch (ex) { setErr(ex instanceof ApiError ? ex.message : 'Đăng nhập thất bại') }
    finally { setBusy(false) }
  }
  return (
    <Shell title="Đăng nhập">
      <form onSubmit={submit} className="space-y-4" noValidate>
        {sessionExpired && <Alert kind="warn">Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.</Alert>}
        {err && <Alert kind="error">{err}</Alert>}
        <Field label="Email" required><Input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Mật khẩu" required><Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <Button type="submit" loading={busy} className="w-full">Đăng nhập</Button>
        <p className="text-center text-sm text-slate-600">Chưa có tài khoản? <Link to="/register" className="font-medium text-brand-700 underline">Đăng ký</Link></p>
        <p className="text-center text-xs text-slate-500">Quên mật khẩu: hiện chưa có khôi phục qua email. Vui lòng liên hệ quản trị viên.</p>
      </form>
    </Shell>
  )
}

export function Register() {
  const [f, setF] = useState({ full_name: '', email: '', password: '', role: 'patient' })
  const [errs, setErrs] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<string | null>(null)
  const [fail, setFail] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setErrs({}); setFail(null)
    try {
      const u = await api<{ status: string }>('/api/auth/register', { method: 'POST', body: { ...f, email: f.email.trim() } })
      setMsg(u.status === 'pending' ? 'Đăng ký thành công. Tài khoản nhân viên y tế cần được Admin duyệt trước khi đăng nhập.' : 'Đăng ký thành công. Bạn có thể đăng nhập.')
    } catch (ex) {
      if (ex instanceof ApiError && ex.details) setErrs(Object.fromEntries(ex.details.map((d) => [d.field, d.message.replace(/^Value error, /, '')])))
      else setFail(ex instanceof ApiError ? ex.message : 'Đăng ký thất bại')
    } finally { setBusy(false) }
  }

  if (msg) return <Shell title="Đăng ký"><Alert kind="success">{msg}</Alert><Link to="/login" className="mt-4 block text-center font-medium text-brand-700 underline">Tới trang đăng nhập</Link></Shell>
  return (
    <Shell title="Tạo tài khoản">
      <form onSubmit={submit} className="space-y-4" noValidate>
        {fail && <Alert kind="error">{fail}</Alert>}
        <Field label="Họ và tên" required error={errs.full_name}><Input required minLength={2} value={f.full_name} onChange={(e) => set('full_name', e.target.value)} autoComplete="name" /></Field>
        <Field label="Email" required error={errs.email}><Input type="email" required value={f.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" /></Field>
        <Field label="Mật khẩu" required hint="Tối thiểu 10 ký tự, gồm chữ hoa, chữ thường và chữ số." error={errs.password}>
          <Input type="password" required value={f.password} onChange={(e) => set('password', e.target.value)} autoComplete="new-password" /></Field>
        <Field label="Bạn là" required hint="Tài khoản Admin không thể tự đăng ký. Tài khoản nhân viên y tế cần được duyệt.">
          <Select value={f.role} onChange={(e) => set('role', e.target.value)}><option value="patient">Bệnh nhân</option><option value="clinician">Bác sĩ / nhân viên y tế</option></Select></Field>
        <Button type="submit" loading={busy} className="w-full">Đăng ký</Button>
        <p className="text-center text-sm text-slate-600">Đã có tài khoản? <Link to="/login" className="font-medium text-brand-700 underline">Đăng nhập</Link></p>
      </form>
    </Shell>
  )
}
