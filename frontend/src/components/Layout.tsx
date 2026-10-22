import clsx from 'clsx'
import { Activity, BookOpen, ClipboardList, FileText, LayoutDashboard, LogOut, Menu, ShieldCheck, Users, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import type { Role } from '../lib/types'
import { Spinner } from './ui'

const NAV: Record<Role, { to: string; label: string; icon: typeof Users; end?: boolean }[]> = {
  clinician: [
    { to: '/app', label: 'Tổng quan', icon: LayoutDashboard, end: true },
    { to: '/app/patients', label: 'Bệnh nhân', icon: Users },
    { to: '/app/education', label: 'Hướng dẫn chăm sóc', icon: BookOpen },
  ],
  patient: [
    { to: '/app', label: 'Tổng quan', icon: LayoutDashboard, end: true },
    { to: '/app/patients', label: 'Hồ sơ của tôi', icon: FileText },
    { to: '/app/education', label: 'Hướng dẫn chăm sóc', icon: BookOpen },
  ],
  admin: [
    { to: '/app', label: 'Tổng quan', icon: LayoutDashboard, end: true },
    { to: '/app/admin/users', label: 'Người dùng', icon: Users },
    { to: '/app/admin/model', label: 'Đánh giá mô hình AI', icon: ShieldCheck },
    { to: '/app/admin/logs', label: 'Nhật ký hệ thống', icon: ClipboardList },
  ],
}
const ROLE_LABEL: Record<Role, string> = { admin: 'Quản trị viên', clinician: 'Nhân viên y tế', patient: 'Bệnh nhân' }

export function Brand({ light }: { light?: boolean }) {
  return (
    <Link to="/" className={clsx('flex items-center gap-2 font-semibold', light ? 'text-white' : 'text-slate-900')}>
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-700 text-white"><Activity className="h-5 w-5" aria-hidden /></span>
      CKD Progress
    </Link>
  )
}

export function ProtectedLayout({ roles }: { roles?: Role[] }) {
  const { user, loading, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const nav = useNavigate()
  if (loading) return <Spinner />
  if (!user) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to="/app" replace />

  const links = (
    <nav aria-label="Điều hướng chính" className="flex flex-col gap-1">
      {NAV[user.role].map((n) => (
        <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setOpen(false)}
          className={({ isActive }) => clsx('flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium', isActive ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:bg-slate-100')}>
          <n.icon className="h-4 w-4" aria-hidden /> {n.label}
        </NavLink>
      ))}
    </nav>
  )

  return (
    <div className="min-h-screen md:flex">
      <aside className="no-print hidden w-60 shrink-0 border-r border-slate-200 bg-white p-4 md:block">
        <div className="mb-6 px-1"><Brand /></div>
        {links}
      </aside>

      {open && (
        <div className="no-print fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-64 bg-white p-4">
            <div className="mb-6 flex items-center justify-between"><Brand />
              <button onClick={() => setOpen(false)} aria-label="Đóng menu" className="grid h-10 w-10 place-items-center"><X className="h-5 w-5" /></button></div>
            {links}
          </div>
        </div>
      )}

      <div className="min-w-0 flex-1">
        <header className="no-print sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur">
          <div className="flex items-center gap-2">
            <button className="grid h-10 w-10 place-items-center md:hidden" onClick={() => setOpen(true)} aria-label="Mở menu"><Menu className="h-5 w-5" /></button>
            <span className="hidden text-sm font-medium text-slate-700 sm:block">Hệ thống theo dõi tiến triển bệnh thận mạn theo eGFR</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right leading-tight">
              <p className="max-w-[10rem] truncate text-sm font-medium text-slate-900">{user.full_name}</p>
              <p className="text-xs text-slate-500">{ROLE_LABEL[user.role]}</p>
            </div>
            <button onClick={async () => { await logout(); nav('/login') }} aria-label="Đăng xuất" title="Đăng xuất"
              className="grid h-10 w-10 place-items-center rounded-lg text-slate-600 hover:bg-slate-100"><LogOut className="h-4 w-4" /></button>
          </div>
        </header>
        <main className="mx-auto max-w-6xl p-4 sm:p-6"><Outlet /></main>
      </div>
    </div>
  )
}

export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Brand />
        <div className="flex gap-2">
          <Link to="/login" className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">Đăng nhập</Link>
          <Link to="/register" className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800">Đăng ký</Link>
        </div>
      </header>
      {children}
    </div>
  )
}
