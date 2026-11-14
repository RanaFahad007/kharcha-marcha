import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AlertCircle, CheckCircle2, X } from 'lucide-react'
import { useApp } from './context/AppContext'
import Navbar from './components/Navbar'
import OnboardingCards from './components/OnboardingCards'
import AuthPage from './pages/AuthPage'
import JoinGroupScreen from './pages/JoinGroupScreen'
import GroupDashboard from './pages/GroupDashboard'
import AdminPanel from './pages/AdminPanel'

function Toasts() {
  const { toasts, removeToast } = useApp()
  return (
    <div className="fixed bottom-4 right-4 z-[60] space-y-2 w-[calc(100vw-2rem)] max-w-sm">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-start gap-2 px-4 py-3 rounded-xl shadow-pop text-sm font-medium text-white ${toast.type === 'success' ? 'bg-emerald-600' : toast.type === 'error' ? 'bg-red-600' : 'bg-slate-800'}`}
        >
          {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
          <span className="flex-1">{toast.message}</span>
          <button onClick={() => removeToast(toast.id)} className="shrink-0 opacity-80 hover:opacity-100">
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  )
}

function Protected({ children }) {
  const { token } = useApp()
  const location = useLocation()
  if (!token) {
    const joinMatch = location.pathname.match(/^\/join\/([^/]+)/)
    if (joinMatch) localStorage.setItem('pendingInviteCode', joinMatch[1])
    return <Navigate to="/login" replace />
  }
  return children
}

function HomeRoute() {
  const { token, myGroups, groupsLoading, t } = useApp()
  if (!token) return <Navigate to="/login" replace />
  if (groupsLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-slate-500">
        <span className="animate-pulse">{t('loading')}</span>
      </div>
    )
  }
  if (myGroups.length === 0) return <OnboardingCards />
  return <GroupDashboard />
}

function AuthedLayout({ children }) {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <Navbar />
      <main>{children}</main>
    </div>
  )
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<AuthPage />} />
        <Route
          path="/join/:inviteCode"
          element={
            <Protected>
              <AuthedLayout>
                <JoinGroupScreen />
              </AuthedLayout>
            </Protected>
          }
        />
        <Route
          path="/"
          element={
            <Protected>
              <AuthedLayout>
                <HomeRoute />
              </AuthedLayout>
            </Protected>
          }
        />
        <Route
          path="/groups/:groupId"
          element={
            <Protected>
              <AuthedLayout>
                <GroupDashboard />
              </AuthedLayout>
            </Protected>
          }
        />
        <Route
          path="/groups/:groupId/admin"
          element={
            <Protected>
              <AuthedLayout>
                <AdminPanel />
              </AuthedLayout>
            </Protected>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toasts />
    </>
  )
}
