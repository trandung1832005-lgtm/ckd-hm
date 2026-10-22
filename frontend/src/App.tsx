import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { ProtectedLayout } from './components/Layout'
import { Spinner } from './components/ui'
import Landing from './pages/Landing'
import { Login, Register } from './pages/AuthPages'
import Dashboard from './pages/Dashboard'
import Patients from './pages/Patients'
import PatientNew from './pages/PatientNew'
import PatientDetail from './pages/PatientDetail'
import PredictNew from './pages/PredictNew'
import PredictionResult from './pages/PredictionResult'
import Education from './pages/Education'
import AdminUsers from './pages/admin/Users'
import AdminLogs from './pages/admin/Logs'

const ModelEvaluation = lazy(() => import('./pages/admin/ModelEvaluation'))

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<Spinner />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/app" element={<ProtectedLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="patients" element={<Patients />} />
              <Route path="patients/:id" element={<PatientDetail />} />
              <Route path="predictions/:runId" element={<PredictionResult />} />
              <Route path="education" element={<Education />} />
            </Route>
            <Route path="/app" element={<ProtectedLayout roles={['clinician', 'patient']} />}>
              <Route path="patients/new" element={<PatientNew />} />
              <Route path="patients/:id/predict" element={<PredictNew />} />
            </Route>
            <Route path="/app/admin" element={<ProtectedLayout roles={['admin']} />}>
              <Route path="users" element={<AdminUsers />} />
              <Route path="model" element={<ModelEvaluation />} />
              <Route path="logs" element={<AdminLogs />} />
            </Route>
            <Route path="*" element={<div className="p-10 text-center">Không tìm thấy trang.</div>} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  )
}
