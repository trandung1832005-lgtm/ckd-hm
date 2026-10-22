import { useState } from 'react'
import { Alert, Card, Disclaimer, PageTitle, Spinner, useAsync } from '../components/ui'
import { api } from '../lib/api'
import { fmtDate } from '../lib/labels'
import type { Education as Edu } from '../lib/types'

const List = ({ items }: { items: string[] }) => <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">{items.map((i) => <li key={i}>{i}</li>)}</ul>

export default function Education() {
  const { data, loading, error } = useAsync(() => api<Edu>('/api/education'), [])
  const [stage, setStage] = useState('G3a')
  if (loading) return <Spinner />
  if (error || !data) return <Alert kind="error">{error ?? 'Không tải được nội dung'}</Alert>
  const s = data.stages[stage]
  return (
    <>
      <PageTitle title="Hướng dẫn chăm sóc sức khoẻ thận" subtitle={`Cập nhật ${fmtDate(data.updated_on)} · nội dung giáo dục tham khảo`} />
      <div className="space-y-6">
        <Alert kind="warn" title="Lưu ý quan trọng">{data.disclaimer}</Alert>
        <Alert kind="info">{data.review_status}</Alert>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title={data.egfr_guide.title}><List items={data.egfr_guide.points} /></Card>
          <Card title={data.warning_signs.title}><List items={data.warning_signs.points} /><p className="mt-3 text-sm font-medium text-red-800">{data.warning_signs.note}</p></Card>
        </div>
        <Card title="Thông tin tham khảo theo giai đoạn eGFR">
          <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Chọn giai đoạn">
            {Object.entries(data.stages).map(([k, v]) => (
              <button key={k} role="tab" aria-selected={stage === k} onClick={() => setStage(k)}
                className={`min-h-10 rounded-lg border px-3 py-1.5 text-sm font-medium ${stage === k ? 'border-brand-700 bg-brand-700 text-white' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}>{k} <span className="font-normal opacity-80">({v.range})</span></button>))}
          </div>
          <h3 className="font-semibold text-slate-900">{stage} – {s.label}</h3>
          <p className="mb-4 mt-1 text-sm text-slate-600">{s.description}</p>
          <div className="grid gap-5 md:grid-cols-2">
            {([['Mục tiêu chung', s.goals], ['Ăn uống', s.diet], ['Lối sống', s.lifestyle], ['Theo dõi', s.monitoring], ['Biến chứng cần lưu ý', s.complications]] as const).map(([t, items]) => (
              <div key={t}><h4 className="mb-1 text-sm font-semibold text-slate-800">{t}</h4><List items={items as string[]} /></div>))}
          </div>
          <p className="mt-5 text-xs text-slate-500">Phác đồ điều trị cụ thể (thuốc, liều, lọc máu/ghép thận) do bác sĩ quyết định. Kế hoạch theo dõi của riêng bạn nằm trong hồ sơ do nhân viên y tế ghi nhận.</p>
        </Card>
        <Card title="Nguồn tham khảo">
          <ul className="space-y-2 text-sm">{data.sources.map((r) => (
            <li key={r.id}><a className="text-brand-700 underline" href={r.url} target="_blank" rel="noopener noreferrer">{r.title}</a> <span className="text-slate-500">· truy cập {fmtDate(r.accessed)}</span></li>))}</ul>
        </Card>
        <Disclaimer />
      </div>
    </>
  )
}
