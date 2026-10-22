import clsx from 'clsx'
import { AlertTriangle, CheckCircle2, Info, Loader2, MinusCircle, TrendingDown, TrendingUp } from 'lucide-react'
import { useCallback, useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
import type { Cluster } from '../lib/types'

// ---------- Button ----------
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; loading?: boolean }
export function Button({ variant = 'primary', loading, className, children, disabled, ...p }: BtnProps) {
  return (
    <button
      {...p}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 min-h-10',
        variant === 'primary' && 'bg-brand-700 text-white hover:bg-brand-800',
        variant === 'secondary' && 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
        variant === 'danger' && 'bg-red-700 text-white hover:bg-red-800',
        variant === 'ghost' && 'text-slate-600 hover:bg-slate-100',
        className,
      )}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
}

// ---------- Card ----------
export function Card({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={clsx('rounded-xl border border-slate-200 bg-white', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          {actions}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  )
}

export function PageTitle({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
      </div>
      <div className="no-print flex flex-wrap gap-2">{actions}</div>
    </div>
  )
}

// ---------- Alert ----------
export function Alert({ kind = 'info', title, children }: { kind?: 'info' | 'warn' | 'error' | 'success'; title?: string; children: ReactNode }) {
  const Icon = { info: Info, warn: AlertTriangle, error: AlertTriangle, success: CheckCircle2 }[kind]
  const cls = {
    info: 'border-sky-200 bg-sky-50 text-sky-900',
    warn: 'border-amber-300 bg-amber-50 text-amber-900',
    error: 'border-red-300 bg-red-50 text-red-900',
    success: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  }[kind]
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={clsx('flex gap-3 rounded-lg border p-3 text-sm', cls)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div>
        {title && <p className="font-semibold">{title}</p>}
        <div>{children}</div>
      </div>
    </div>
  )
}

export function Disclaimer() {
  return (
    <Alert kind="warn" title="Chỉ mang tính hỗ trợ">
      Kết quả là ước lượng thống kê từ mô hình học máy, không phải chẩn đoán và không thay thế tư vấn của bác sĩ. Hệ thống không kê đơn hay quyết định phác đồ điều trị.
    </Alert>
  )
}

// ---------- Trạng thái ----------
export function Spinner({ label = 'Đang tải…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {label}
    </div>
  )
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <p className="font-medium text-slate-700">{title}</p>
      {hint && <p className="max-w-md text-sm text-slate-500">{hint}</p>}
      {action}
    </div>
  )
}

// ---------- Badges ----------
const CLUSTER_STYLE: Record<Cluster, { cls: string; Icon: typeof TrendingDown }> = {
  'Chuyển biến xấu': { cls: 'border-red-300 bg-red-50 text-red-800', Icon: TrendingDown },
  'Ổn định': { cls: 'border-amber-300 bg-amber-50 text-amber-900', Icon: MinusCircle },
  'Cải thiện': { cls: 'border-emerald-300 bg-emerald-50 text-emerald-800', Icon: TrendingUp },
}
export function ClusterBadge({ cluster, size = 'md' }: { cluster: Cluster | string | null | undefined; size?: 'md' | 'lg' }) {
  if (!cluster) return <span className="text-sm text-slate-400">Chưa dự đoán</span>
  const s = CLUSTER_STYLE[cluster as Cluster]
  if (!s) return <span>{cluster}</span>
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-full border font-medium', s.cls, size === 'lg' ? 'px-3.5 py-1.5 text-base' : 'px-2.5 py-0.5 text-xs')}>
      <s.Icon className={size === 'lg' ? 'h-5 w-5' : 'h-3.5 w-3.5'} aria-hidden />
      {cluster}
    </span>
  )
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: 'bg-emerald-50 text-emerald-800 border-emerald-300',
    pending: 'bg-amber-50 text-amber-900 border-amber-300',
    disabled: 'bg-slate-100 text-slate-700 border-slate-300',
    inactive: 'bg-slate-100 text-slate-700 border-slate-300',
    pending_weights: 'bg-amber-50 text-amber-900 border-amber-300',
    success: 'bg-emerald-50 text-emerald-800 border-emerald-300',
    failed: 'bg-red-50 text-red-800 border-red-300',
  }
  const label: Record<string, string> = {
    active: 'Đang hoạt động', pending: 'Chờ duyệt', disabled: 'Đã khoá', inactive: 'Không hoạt động',
    pending_weights: 'Thiếu trọng số', success: 'Thành công', failed: 'Lỗi',
  }
  return <span className={clsx('inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium', map[status] ?? 'border-slate-300')}>{label[status] ?? status}</span>
}

export const DemoBadge = () => (
  <span className="rounded border border-violet-300 bg-violet-50 px-1.5 py-0.5 text-xs font-medium text-violet-800">Dữ liệu minh hoạ</span>
)

// ---------- Form ----------
export function Field({ label, hint, unit, error, children, required }: { label: string; hint?: string; unit?: string; error?: string; children: ReactNode; required?: boolean }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">
        {label} {required && <span className="text-red-600" aria-label="bắt buộc">*</span>}
        {unit && <span className="ml-1 font-normal text-slate-500">({unit})</span>}
      </span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
      {error && <span role="alert" className="mt-1 block text-xs text-red-700">{error}</span>}
    </label>
  )
}
const inputCls = 'block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm min-h-10 focus:border-brand-600 disabled:bg-slate-100'
export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={clsx(inputCls, p.className)} />
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={clsx(inputCls, p.className)} />

export function Check({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm text-slate-700">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 rounded border-slate-300 accent-brand-700" />
      {label}
    </label>
  )
}

// ---------- Phân trang ----------
export function Pagination({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  return (
    <div className="flex items-center justify-between gap-2 pt-3 text-sm text-slate-600">
      <span>{total} mục</span>
      <div className="flex items-center gap-2">
        <Button variant="secondary" disabled={page <= 1} onClick={() => onChange(page - 1)}>Trước</Button>
        <span>Trang {page}/{pages}</span>
        <Button variant="secondary" disabled={page >= pages} onClick={() => onChange(page + 1)}>Sau</Button>
      </div>
    </div>
  )
}

// ---------- Hook tải dữ liệu ----------
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps)
  const reload = useCallback(() => {
    setLoading(true)
    run().then((d) => { setData(d); setError(null) }).catch((e: Error) => setError(e.message)).finally(() => setLoading(false))
  }, [run])
  useEffect(reload, [reload])
  return { data, error, loading, reload }
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
            {head.map((h) => <th key={h} scope="col" className="whitespace-nowrap px-3 py-2 font-medium">{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  )
}
export const Td = ({ children, className, title }: { children: ReactNode; className?: string; title?: string }) => <td title={title} className={clsx("px-3 py-2.5 align-middle", className)}>{children}</td>
