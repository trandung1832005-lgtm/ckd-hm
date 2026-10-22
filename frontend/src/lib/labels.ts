import type { Cluster } from './types'

// Nhãn mã hoá gốc của bộ dữ liệu. Chưa có tài liệu xác nhận nhãn Nam/Nữ hay tên bệnh nguyên:
// khi có, chỉ cần sửa tại đây.
export const GENDER_LABEL: Record<number, string> = { 1: 'Nhóm 1', 2: 'Nhóm 2' }
export const ETIOLOGY_LABEL: Record<number, string> = {
  1: 'Nhóm nguyên nhân 1',
  2: 'Nhóm nguyên nhân 2',
  3: 'Nhóm nguyên nhân 3',
  4: 'Nhóm nguyên nhân 4',
}
export const CODING_NOTE = 'Mã hoá gốc của bộ dữ liệu nghiên cứu (chưa kèm nhãn lâm sàng).'

export const MONTHS_PRED = [18, 24, 30, 36]

export const CLUSTER_ORDER: Cluster[] = ['Chuyển biến xấu', 'Ổn định', 'Cải thiện']

export const STAGE_BANDS = [
  { stage: 'G1', min: 90, label: '≥ 90' },
  { stage: 'G2', min: 60, label: '60–89' },
  { stage: 'G3a', min: 45, label: '45–59' },
  { stage: 'G3b', min: 30, label: '30–44' },
  { stage: 'G4', min: 15, label: '15–29' },
  { stage: 'G5', min: 0, label: '< 15' },
]

export function stageOf(e: number): string {
  return (STAGE_BANDS.find((b) => e >= b.min) ?? STAGE_BANDS[5]).stage
}

export const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleDateString('vi-VN') : '—'
export const fmtDateTime = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : '—'
export const pct = (v: number | null | undefined, d = 1) => (v == null ? '—' : `${(v * 100).toFixed(d)}%`)
export const num = (v: number | null | undefined, d = 1) => (v == null ? '—' : v.toFixed(d))
