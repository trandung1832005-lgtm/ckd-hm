import { ArrowRight, BarChart3, LineChart, Lock, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PublicShell } from '../components/Layout'
import { Disclaimer } from '../components/ui'

const STEPS = [
  { t: 'Dữ liệu bệnh nhân', d: 'eGFR tại tháng 0, 6, 12 cùng các chỉ số lâm sàng (tuổi, huyết áp, albumin, đạm niệu, bệnh nền).' },
  { t: 'GRU', d: 'Mạng nơ-ron hồi quy dự đoán chuỗi eGFR ở tháng 18, 24, 30, 36.' },
  { t: 'Đặc trưng xu hướng', d: 'Tốc độ thay đổi eGFR và mức thay đổi tổng, kết hợp đạm niệu, albumin, huyết áp.' },
  { t: 'K-Means', d: 'Xếp bệnh nhân vào nhóm: Chuyển biến xấu, Ổn định hoặc Cải thiện.' },
]
const FEATURES = [
  { i: LineChart, t: 'Biểu đồ eGFR theo thời gian', d: 'Đường đo thực tế, đường dự đoán và các ngưỡng G1–G5 trên cùng một biểu đồ.' },
  { i: Users, t: 'Quản lý hồ sơ & phân quyền', d: 'Ba vai trò: Admin, nhân viên y tế, bệnh nhân. Mỗi người chỉ thấy dữ liệu được cấp quyền.' },
  { i: BarChart3, t: 'Đánh giá mô hình minh bạch', d: 'Trang riêng cho Admin: MAE, RMSE, R², phân nhóm và phát hiện suy giảm nhanh trên Train/Val/Test.' },
  { i: Lock, t: 'Bảo vệ dữ liệu sức khoẻ', d: 'Xác thực JWT, kiểm tra quyền ở máy chủ, nhật ký thao tác không chứa dữ liệu y tế.' },
]

export default function Landing() {
  return (
    <PublicShell>
      <section className="mx-auto max-w-6xl px-4 pb-14 pt-10 sm:pt-16">
        <p className="mb-3 text-sm font-medium text-brand-700">Đồ án: Dự đoán tiến triển bệnh thận mạn tính qua eGFR</p>
        <h1 className="max-w-3xl text-3xl font-bold leading-tight text-slate-900 sm:text-5xl">Theo dõi chức năng lọc thận theo thời gian, nhìn trước xu hướng.</h1>
        <p className="mt-5 max-w-2xl text-lg text-slate-600">Từ lịch sử eGFR và các chỉ số lâm sàng, hệ thống dự đoán eGFR trong 36 tháng và gợi ý nhóm xu hướng tiến triển để hỗ trợ nhân viên y tế theo dõi.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/register" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-700 px-5 py-2.5 font-medium text-white hover:bg-brand-800">Bắt đầu <ArrowRight className="h-4 w-4" aria-hidden /></Link>
          <Link to="/login" className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-5 py-2.5 font-medium text-slate-700 hover:bg-slate-50">Đăng nhập</Link>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-slate-50 py-12" aria-labelledby="flow">
        <div className="mx-auto max-w-6xl px-4">
          <h2 id="flow" className="mb-6 text-xl font-semibold text-slate-900">Quy trình hoạt động</h2>
          <ol className="grid gap-4 md:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.t} className="relative rounded-xl border border-slate-200 bg-white p-5">
                <span className="mb-3 grid h-7 w-7 place-items-center rounded-full bg-brand-700 text-sm font-semibold text-white">{i + 1}</span>
                <h3 className="font-semibold text-slate-900">{s.t}</h3>
                <p className="mt-1 text-sm text-slate-600">{s.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="mb-6 text-xl font-semibold text-slate-900">Tính năng chính</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.t} className="flex gap-4 rounded-xl border border-slate-200 p-5">
              <f.i className="mt-0.5 h-6 w-6 shrink-0 text-brand-700" aria-hidden />
              <div><h3 className="font-semibold text-slate-900">{f.t}</h3><p className="mt-1 text-sm text-slate-600">{f.d}</p></div>
            </div>
          ))}
        </div>
        <h2 className="mb-3 mt-12 text-xl font-semibold text-slate-900">Vì sao theo dõi eGFR theo thời gian?</h2>
        <p className="max-w-3xl text-slate-600">Một giá trị eGFR đơn lẻ chỉ là ảnh chụp tại một thời điểm. Xu hướng qua nhiều lần đo cho biết chức năng thận đang giảm nhanh, chậm hay ổn định, giúp bác sĩ cân nhắc tần suất theo dõi phù hợp.</p>
        <div className="mt-8"><Disclaimer /></div>
      </section>
      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-500">Hệ thống hỗ trợ nghiên cứu và theo dõi. Không thay thế bác sĩ.</footer>
    </PublicShell>
  )
}
