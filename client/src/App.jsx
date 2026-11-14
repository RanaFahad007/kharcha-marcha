import { Component } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { AlertCircle, CheckCircle2, LayoutDashboard, Plus, RefreshCw, UserPlus, X } from 'lucide-react'
import { useApp } from './context/AppContext'
import Navbar from './components/Navbar'
import OnboardingCards from './components/OnboardingCards'
import AuthPage from './pages/AuthPage'
import JoinGroupScreen from './pages/JoinGroupScreen'
import GroupDashboard from './pages/GroupDashboard'
import AdminPanel from './pages/AdminPanel'

/**
 * Error boundary: a render crash (e.g. an unexpected API shape) used to
 * blank the whole page with no message. Now the user gets a friendly
 * "Something went wrong — Reload" screen instead of a white page.
 */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error) {
    // Keep the details in the console for debugging; the UI stays friendly.
    console.error('App crashed:', error)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 px-4 text-center">
          <AlertCircle className="w-10 h-10 text-red-500" />
          <p className="font-bold text-slate-900 dark:text-white text-lg">Something went wrong</p>
          <p className="text-sm text-slate-500">Please reload the page and try again.</p>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 px-5 py-2.5 min-h-[44px] rounded-lg bg-brand-600 text-white font-semibold hover:bg-brand-700"
          >
            <RefreshCw className="w-4 h-4" />
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

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
  // myGroups must always be an array — guard so a bad payload can never
  // crash the dashboard again.
  const groups = Array.isArray(myGroups) ? myGroups : []
  if (groups.length === 0) return <OnboardingCards />
  return <GroupDashboard />
}

/**
 * Mobile bottom navigation (visible only below the md breakpoint).
 * Dashboard / Add / Invite only — the Admin Panel is intentionally NOT
 * shown on mobile (admin tasks are desktop-only); admins use the Admin
 * Panel link in the top bar on desktop. Add and Invite open the dashboard
 * modals via window events that GroupDashboard listens for
 * ('splittrack:open-expense' / 'splittrack:open-invite'); if the user is
 * on another page we navigate to the group first, then fire the event.
 * Safe-area padding keeps it clear of the home indicator.
 */
function MobileBottomNav() {
  const { activeGroup, t, pushToast } = useApp()
  const navigate = useNavigate()
  const location = useLocation()
  const isDashboardRoute = location.pathname === '/' || location.pathname.startsWith('/groups/')

  function openOnDashboard(eventName) {
    if (!activeGroup) {
      // No group yet — there is nothing to invite into. Send the user to
      // the empty state (Create Group) and say so, instead of silently
      // doing nothing.
      navigate('/')
      pushToast('error', t('noGroupsDesc'))
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
    <ErrorBoundary>
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
    </ErrorBoundary>
  )
}
