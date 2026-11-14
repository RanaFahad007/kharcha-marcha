import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { AlertCircle, CheckCircle2, LayoutDashboard, Plus, Settings, UserPlus, X } from 'lucide-react'
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
    <div className="fixed bottom-24 md:bottom-4 right-4 z-[60] space-y-2 w-[calc(100vw-2rem)] max-w-sm">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-start gap-2 px-4 py-3 rounded-xl shadow-pop text-sm font-medium text-white ${toast.type === 'success' ? 'bg-emerald-600' : toast.type === 'error' ? 'bg-red-600' : 'bg-slate-800'}`}
        >
          {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
          <span className="flex-1 min-w-0 break-words">{toast.message}</span>
          <button onClick={() => removeToast(toast.id)} className="shrink-0 min-w-[44px] min-h-[44px] -m-2 flex items-center justify-center opacity-80 hover:opacity-100" aria-label="Dismiss">
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

/**
 * Mobile bottom navigation (visible only below the md breakpoint).
 * Dashboard / Add / Invite / Admin. Add and Invite open the dashboard
 * modals via window events that GroupDashboard listens for
 * ('splittrack:open-expense' / 'splittrack:open-invite'); if the user is
 * on another page we navigate to the group first, then fire the event.
 * Safe-area padding keeps it clear of the home indicator.
 */
function MobileBottomNav() {
  const { activeGroup, t } = useApp()
  const navigate = useNavigate()
  const location = useLocation()
  const isAdminRoute = location.pathname.endsWith('/admin')
  const isDashboardRoute = !isAdminRoute && (location.pathname === '/' || location.pathname.startsWith('/groups/'))

  function openOnDashboard(eventName) {
    if (!activeGroup) {
      navigate('/')
      return
    }
    const path = `/groups/${activeGroup._id}`
    if (location.pathname !== path) {
      navigate(path)
      window.setTimeout(() => window.dispatchEvent(new Event(eventName)), 400)
    } else {
      window.dispatchEvent(new Event(eventName))
    }
  }

  const itemClass = (active) =>
    `flex flex-col items-center justify-center gap-0.5 flex-1 min-w-0 min-h-[56px] py-1 text-xs font-medium ${
      active ? 'text-brand-700 dark:text-brand-300' : 'text-slate-500 dark:text-slate-400'
    }`

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white dark:bg-navy-900 border-t border-slate-200 dark:border-slate-700 shadow-[0_-2px_10px_rgb(0_0_0/0.06)] pb-safe" aria-label="Primary">
      <div className="flex items-stretch">
        <button onClick={() => navigate('/')} className={itemClass(isDashboardRoute)} aria-current={isDashboardRoute ? 'page' : undefined}>
          <LayoutDashboard className="w-5 h-5" />
          <span className="truncate max-w-full px-1">{t('dashboard')}</span>
        </button>
        <button onClick={() => openOnDashboard('splittrack:open-expense')} className={itemClass(false)} aria-label={t('addExpense')}>
          <span className="w-11 h-11 -mt-5 rounded-full bg-brand-600 text-white flex items-center justify-center shadow-pop border-4 border-white dark:border-navy-900">
            <Plus className="w-6 h-6" />
          </span>
          <span className="truncate max-w-full px-1 -mt-0.5">{t('addExpense')}</span>
        </button>
        <button onClick={() => openOnDashboard('splittrack:open-invite')} className={itemClass(false)} aria-label={t('invite')}>
          <UserPlus className="w-5 h-5" />
          <span className="truncate max-w-full px-1">{t('invite')}</span>
        </button>
        <button
          onClick={() => (activeGroup ? navigate(`/groups/${activeGroup._id}/admin`) : navigate('/'))}
          className={itemClass(isAdminRoute)}
          aria-current={isAdminRoute ? 'page' : undefined}
        >
          <Settings className="w-5 h-5" />
          <span className="truncate max-w-full px-1">{t('adminPanel')}</span>
        </button>
      </div>
    </nav>
  )
}

function AuthedLayout({ children }) {
  return (
    <div className="min-h-screen bg-slate-100 dark:bg-navy-950 text-slate-900 dark:text-slate-100">
      <Navbar />
      {/* pb-20 on mobile clears the fixed bottom nav; md:pb-0 removes it on desktop. */}
      <main className="pb-20 md:pb-0">{children}</main>
      <MobileBottomNav />
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
