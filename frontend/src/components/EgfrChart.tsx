import { CartesianGrid, ComposedChart, Legend, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Egfr, PredResult } from '../lib/types'
import { STAGE_BANDS } from '../lib/labels'

interface Props {
  history: Egfr[]
  results: PredResult[]
  /** lần dự đoán khác để so sánh (đường nét đứt xám) */
  compare?: { label: string; results: PredResult[] } | null
  height?: number
}

const COLORS = { actual: '#0f172a', pred: '#0f766e', bridge: '#64748b', compare: '#7c3aed' }

export function EgfrChart({ history, results, compare, height = 360 }: Props) {
  const months = [0, 6, 12, 18, 24, 30, 36]
  const hist = new Map(history.map((h) => [h.month, h.value]))
  const pred = new Map(results.map((r) => [r.month, r.egfr_pred]))
  const cmp = new Map((compare?.results ?? []).map((r) => [r.month, r.egfr_pred]))
  const lastObsMonth = history.length ? Math.max(...history.map((h) => h.month)) : null
  const lastObs = lastObsMonth !== null ? hist.get(lastObsMonth)! : null

  const data = months.map((m) => ({
    month: m,
    actual: hist.get(m) ?? null,
    predicted: pred.get(m) ?? null,
    // đường nối từ lần đo thật cuối cùng tới mốc dự đoán đầu tiên
    bridge: m === lastObsMonth ? lastObs : m === 18 ? pred.get(18) ?? null : null,
    compare: cmp.get(m) ?? null,
  }))
  const all = data.flatMap((d) => [d.actual, d.predicted, d.compare]).filter((v): v is number => v != null)
  const top = Math.max(...all, 0) > 95 ? 120 : 100
  const yTicks = [0, 15, 30, 45, 60, 90, ...(top > 100 ? [120] : [])]
  const yMax = top
  const yMin = 0

  return (
    <div role="img" aria-label="Biểu đồ eGFR thực tế và dự đoán theo tháng" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 62, left: 0, bottom: 16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          {/* vùng dự đoán */}
          <ReferenceArea x1={12} x2={36} fill="#f0fdfa" fillOpacity={0.7} ifOverflow="visible" />
          <XAxis dataKey="month" type="number" domain={[0, 36]} ticks={months} tickFormatter={(v) => `${v}`}
            label={{ value: 'Tháng (tính từ lần đo đầu)', position: 'insideBottom', offset: -8, fontSize: 12, fill: '#475569' }} tick={{ fontSize: 12 }} />
          <YAxis domain={[yMin, yMax]} ticks={yTicks} tick={{ fontSize: 12 }}
            label={{ value: 'eGFR (mL/phút/1,73m²)', angle: -90, position: 'insideLeft', fontSize: 12, fill: '#475569', dx: 4 }} />
          {STAGE_BANDS.slice(0, 5).map((b) => (
            <ReferenceLine key={b.stage} y={b.min} stroke="#cbd5e1" strokeDasharray="4 4" ifOverflow="hidden"
              label={{ value: `${b.stage} ≥ ${b.min}`, position: 'right', fontSize: 11, fill: '#64748b' }} />
          ))}
          <Tooltip formatter={(v, name) => [typeof v === 'number' ? `${v.toFixed(1)} mL/phút/1,73m²` : '—', name]}
            labelFormatter={(l) => `Tháng ${l}`} />
          <Legend verticalAlign="top" height={32} wrapperStyle={{ fontSize: 12 }} />
          <Line name="Đường nối (không phải đo/dự đoán)" dataKey="bridge" stroke={COLORS.bridge} strokeDasharray="2 4" dot={false} connectNulls legendType="plainline" isAnimationActive={false} />
          {compare && <Line name={compare.label} dataKey="compare" stroke={COLORS.compare} strokeDasharray="6 3" strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />}
          <Line name="eGFR thực tế (đã đo)" dataKey="actual" stroke={COLORS.actual} strokeWidth={2.5} dot={{ r: 5, fill: COLORS.actual }} connectNulls isAnimationActive={false} />
          <Line name="eGFR dự đoán (GRU)" dataKey="predicted" stroke={COLORS.pred} strokeWidth={2.5} strokeDasharray="7 4" dot={{ r: 5, fill: '#fff', stroke: COLORS.pred, strokeWidth: 2 }} connectNulls isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
