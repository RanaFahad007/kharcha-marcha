import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bell, ChevronDown, Globe, LogOut, Moon, Plus, Shield, Sparkles, Sun, Trash2, Users, Wallet } from 'lucide-react'
import { useApp, api } from '../context/AppContext'
import { languages } from '../i18n/locales'
import SuperAdminModal from '../pages/SuperAdminModal'

export default function Navbar() {
  const { user, myGroups, activeGroup, setActiveGroup, language, setLanguage, theme, toggleTheme, t, pushToast, logout, fetchMyGroups } = useApp()
  const navigate = useNavigate()
  const [groupOpen, setGroupOpen] = useState(false)
  const [notifCount, setNotifCount] = useState(0)
  const [demoBusy, setDemoBusy] = useState(false)
  const [showSuperAdmin, setShowSuperAdmin] = useState(false)
  const groupRef = useRef(null)

  useEffect(() => {
    function onClick(e) {
      if (groupRef.current && !groupRef.current.contains(e.target)) setGroupOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  useEffect(() => {
    if (!activeGroup?._id) {
      setNotifCount(0)
      return
    }
    let cancelled = false
    async function loadCounts() {
      try {
        const [reqRes, editRes] = await Promise.allSettled([
          api.get(`/groups/${activeGroup._id}/requests`),
          api.get(`/groups/${activeGroup._id}/edit-requests`)
        ])
        if (cancelled) return
        const reqList = reqRes.status === 'fulfilled' ? reqRes.value.data?.data || [] : []
        const editList = editRes.status === 'fulfilled' ? editRes.value.data?.data || [] : []
        const pendingReq = reqList.filter((r) => (r.status || 'pending') === 'pending').length
        const pendingEdit = editList.filter((r) => (r.status || 'pending') === 'pending').length
        setNotifCount(pendingReq + pendingEdit)
      } catch {
        if (!cancelled) setNotifCount(0)
      }
    }
    loadCounts()
    const timer = window.setInterval(loadCounts, 60000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [activeGroup?._id])

  async function handleLoadDemo() {
    if (!window.confirm(t('confirmLoadDemo'))) return
    setDemoBusy(true)
    try {
      await api.post('/demo/load')
      pushToast('success', t('demoLoaded'))
      await fetchMyGroups()
    } catch (e) {
      pushToast('error', e?.response?.data?.message || t('failedToLoad'))
    } finally {
      setDemoBusy(false)
    }
  }

  async function handleClearDemo() {
    if (!window.confirm(t('confirmClearDemo'))) return
    setDemoBusy(true)
    try {
      await api.delete('/demo/clear')
      pushToast('success', t('demoCleared'))
      await fetchMyGroups()
    } catch (e) {
      pushToast('error', e?.response?.data?.message || t('failedToLoad'))
    } finally {
      setDemoBusy(false)
    }
  }

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <header className="sticky top-0 z-40 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center gap-3">
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <span className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center">
            <Wallet className="w-5 h-5" />
          </span>
          <span className="font-bold text-lg text-slate-900 dark:text-white">{t('appName')}</span>
        </Link>

        <div className="relative" ref={groupRef}>
          <button
            onClick={() => setGroupOpen((v) => !v)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-sm font-medium max-w-[220px]"
          >
            <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: activeGroup?.color || '#4F46E5' }} />
            <span className="truncate">{activeGroup?.name || t('dashboard')}</span>
            <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
          </button>
          {groupOpen && (
            <div className="absolute left-0 mt-2 w-72 bg-white border border-slate-200 rounded-xl shadow-pop overflow-hidden">
              <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{t('members')}</div>
              {myGroups.length === 0 && <div className="px-4 py-3 text-sm text-slate-500">{t('noGroups')}</div>}
              {myGroups.map((g) => (
                <button
                  key={g._id}
                  onClick={() => {
                    setActiveGroup(g)
                    setGroupOpen(false)
                    navigate(`/groups/${g._id}`)
                  }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-indigo-50"
                >
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: g.color || '#4F46E5' }} />
                  <span className="truncate flex-1">{g.name}</span>
                  {activeGroup?._id === g._id && <span className="text-indigo-600 text-xs font-semibold">●</span>}
                </button>
              ))}
              <div className="border-t border-slate-100 p-2 flex gap-2">
                <Link to="/" onClick={() => setGroupOpen(false)} className="flex-1 text-center text-sm px-3 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
                  {t('createGroup')}
                </Link>
                <Link to="/" onClick={() => setGroupOpen(false)} className="flex-1 text-center text-sm px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50">
                  {t('joinGroup')}
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Prominent top-bar language switcher: always visible, right next to
            the Group Switcher — all 3 languages shown, active one highlighted.
            setLanguage() in AppContext instantly re-translates the whole UI
            via locales.js and persists the choice in localStorage
            ('splittrack_lang'). Not inside any menu or drawer. */}
        <div
          className="flex items-center gap-1 rounded-xl border border-indigo-200 bg-indigo-50/60 p-1 shrink-0"
          role="group"
          aria-label="Choose language"
          title="Choose language / زبان منتخب کریں / اختر اللغة"
        >
          <Globe className="w-4 h-4 text-indigo-600 shrink-0 ml-1" />
          {languages.map((l) => (
            <button
              key={l.code}
              onClick={() => setLanguage(l.code)}
              aria-pressed={l.code === language}
              title={l.label}
              className={`px-2.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap transition-colors ${
                l.code === language
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-600 hover:bg-white hover:text-indigo-700'
              }`}
            >
              <span className="hidden sm:inline">{l.label}</span>
              <span className="sm:hidden">{l.code === 'en' ? 'EN' : l.code === 'ur' ? 'UR' : 'ع'}</span>
            </button>
          ))}
        </div>

        <div className="flex-1" />

        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
          title={theme === 'dark' ? t('lightMode') : t('darkMode')}
          aria-label={t('toggleTheme')}
        >
          {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>

        {user?.isSuperAdmin && (
          <button
            onClick={() => setShowSuperAdmin(true)}
            className="hidden sm:flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 hover:bg-amber-100"
          >
            <Shield className="w-4 h-4" />
            {t('superAdmin')}
          </button>
        )}

        <button
          onClick={handleLoadDemo}
          disabled={demoBusy}
          className="hidden md:flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 disabled:opacity-50"
        >
          <Sparkles className="w-3.5 h-3.5" />
          {t('loadDemoData')}
        </button>
        <button
          onClick={handleClearDemo}
          disabled={demoBusy}
          className="hidden md:flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100 disabled:opacity-50"
        >
          <Trash2 className="w-3.5 h-3.5" />
          {t('clearDemoData')}
        </button>

        {activeGroup && (
          <button
            onClick={() => navigate(`/groups/${activeGroup._id}/admin`)}
            className="relative p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
            title={t('notifications')}
          >
            <Bell className="w-5 h-5" />
            {notifCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center justify-center">
                {notifCount}
              </span>
            )}
          </button>
        )}

        {activeGroup && (
          <Link
            to={`/groups/${activeGroup._id}/admin`}
            className="hidden sm:flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50"
          >
            <Users className="w-4 h-4" />
            {t('adminPanel')}
          </Link>
        )}

        <div className="hidden lg:flex items-center gap-2 pl-2 border-l border-slate-200">
          <span className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-bold">
            {(user?.name || 'U').charAt(0).toUpperCase()}
          </span>
          <span className="text-sm font-medium max-w-[120px] truncate">{user?.name}</span>
          <button onClick={handleLogout} className="p-2 rounded-lg hover:bg-red-50 text-slate-500 hover:text-red-600" title={t('logout')}>
            <LogOut className="w-4 h-4" />
          </button>
        </div>
        <button onClick={handleLogout} className="lg:hidden p-2 rounded-lg hover:bg-red-50 text-slate-500 hover:text-red-600" title={t('logout')}>
          <LogOut className="w-5 h-5" />
        </button>
      </div>

      <nav className="md:hidden border-t border-slate-100 flex justify-around py-1 text-xs">
        <Link to="/" className="flex flex-col items-center gap-0.5 py-1 px-3 text-indigo-600 font-medium">
          <Wallet className="w-5 h-5" />
          {t('dashboard')}
        </Link>
        <Link to="/" className="flex flex-col items-center gap-0.5 py-1 px-3 text-slate-500">
          <Plus className="w-5 h-5" />
          {t('createGroup')}
        </Link>
        {activeGroup && (
          <Link to={`/groups/${activeGroup._id}/admin`} className="flex flex-col items-center gap-0.5 py-1 px-3 text-slate-500">
            <Users className="w-5 h-5" />
            {t('adminPanel')}
          </Link>
        )}
      </nav>
      {showSuperAdmin && <SuperAdminModal open={showSuperAdmin} onClose={() => setShowSuperAdmin(false)} />}
    </header>
  )
}
