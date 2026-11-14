import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Activity, ChevronDown, Download, FileSpreadsheet, FileText, Loader2, Pencil, Plus, Receipt, RefreshCw, Search, Settings, Trash2, UserPlus } from 'lucide-react'
import { useApp, api } from '../context/AppContext'
import ExpenseModal from '../components/ExpenseModal'
import InviteModal from '../components/InviteModal'
import WhoOwesWhomCard from '../components/WhoOwesWhomCard'
import AnalyticsSection, { budgetStatus, budgetBarClass } from '../components/AnalyticsSection'
import ActivityFeedDrawer from '../components/ActivityFeedDrawer'
import { downloadCSV, downloadPDF, fetchExport } from '../utils/exportGenerator'
import { categoryKeys } from '../i18n/locales'

function nameOf(v) {
  if (!v) return ''
  if (typeof v === 'string') return v
  return v.name || v.email || v._id || ''
}
function idOf(v) {
  if (!v) return ''
  if (typeof v === 'string') return v
  return v._id || ''
}

export default function GroupDashboard() {
  const { groupId } = useParams()
  const { user, myGroups, activeGroup, setActiveGroup, t, pushToast } = useApp()
  const navigate = useNavigate()
  const [group, setGroup] = useState(activeGroup || null)
  const [members, setMembers] = useState([])
  const [expenses, setExpenses] = useState([])
  const [balances, setBalances] = useState([])
  const [settlements, setSettlements] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [showExpenseModal, setShowExpenseModal] = useState(false)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [editingExpense, setEditingExpense] = useState(null)
  const [exporting, setExporting] = useState(false)
  const [showActivity, setShowActivity] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const groupsArr = Array.isArray(myGroups) ? myGroups : []
  const resolvedGroupId = groupId || activeGroup?._id || groupsArr[0]?._id

  const loadAll = useCallback(async () => {
    if (!resolvedGroupId) {
      setLoading(false)
      return
    }
    setLoading(true)
    setLoadError('')
    try {
      const params = {}
      if (category) params.category = category
      if (dateFrom) params.from = dateFrom
      if (dateTo) params.to = dateTo
      const [groupRes, membersRes, expensesRes, balancesRes] = await Promise.all([
        api.get(`/groups/${resolvedGroupId}`),
        api.get(`/groups/${resolvedGroupId}/members`),
        api.get(`/groups/${resolvedGroupId}/expenses`, { params }),
        api.get(`/groups/${resolvedGroupId}/balances`)
      ])
      // Backend wraps every payload: { data: { group } }, { data: { members } },
      // { data: { expenses } }, { data: { balances, settlements } }.
      const gData = groupRes.data?.data || {}
      setGroup(gData.group || gData)
      const mData = membersRes.data?.data || {}
      setMembers(Array.isArray(mData) ? mData : mData.members || [])
      const eData = expensesRes.data?.data || {}
      setExpenses(Array.isArray(eData) ? eData : eData.expenses || [])
      const bal = balancesRes.data?.data || balancesRes.data || {}
      setBalances(bal.balances || [])
      setSettlements(bal.settlements || [])
    } catch (e) {
      setLoadError(e?.response?.data?.message || t('failedToLoad'))
    } finally {
      setLoading(false)
    }
  }, [resolvedGroupId, category, dateFrom, dateTo, t])

  useEffect(() => {
    if (resolvedGroupId && activeGroup?._id !== resolvedGroupId) {
      const found = groupsArr.find((g) => g._id === resolvedGroupId)
      if (found) setActiveGroup(found)
    }
  }, [resolvedGroupId, activeGroup?._id, myGroups, setActiveGroup])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // Mobile bottom nav (App.jsx) opens these modals via window events.
  useEffect(() => {
    const openExpense = () => {
      setEditingExpense(null)
      setShowExpenseModal(true)
    }
    const openInvite = () => setShowInviteModal(true)
    window.addEventListener('splittrack:open-expense', openExpense)
    window.addEventListener('splittrack:open-invite', openInvite)
    return () => {
      window.removeEventListener('splittrack:open-expense', openExpense)
      window.removeEventListener('splittrack:open-invite', openInvite)
    }
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return expenses
    return expenses.filter((e) => (e.title || '').toLowerCase().includes(q) || (e.category || '').toLowerCase().includes(q) || nameOf(e.paidBy).toLowerCase().includes(q))
  }, [expenses, search])

  const totalSpent = useMemo(() => expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0), [expenses])
  const myBalance = useMemo(() => balances.find((b) => idOf(b.user) === user?._id), [balances, user?._id])
  const myNet = Number(myBalance?.netBalance ?? 0)
  const youOwe = myNet < 0 ? Math.abs(myNet) : 0
  const youAreOwed = myNet > 0 ? myNet : 0
  const yourShare = Number(myBalance?.totalShare ?? 0)
  const currency = group?.currency || ''
  const now = new Date()
  // The group-wide month total (admin only). Members see only their own
  // share of this month's expenses — their full share of each visible
  // expense, so other members' amounts never leak through the budget bar.
  // Own share of every visible expense (members see only their own numbers).
  const myTotalSpent = useMemo(
    () =>
      expenses.reduce((s, e) => {
        const mine = (e.splitBetween || []).find((x) => idOf(x.user) === user?._id)
        if (mine) return s + (Number(mine.shareAmount) || 0)
        if (idOf(e.paidBy) === user?._id) return s + (Number(e.amount) || 0)
        return s
      }, 0),
    [expenses, user?._id]
  )
  const myMonthTotal = useMemo(
    () =>
      expenses
        .filter((e) => {
          const d = new Date(e.date || e.createdAt)
          return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
        })
        .reduce((s, e) => {
          const mine = (e.splitBetween || []).find((x) => idOf(x.user) === user?._id)
          if (mine) return s + (Number(mine.shareAmount) || 0)
          if (idOf(e.paidBy) === user?._id) return s + (Number(e.amount) || 0)
          return s
        }, 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [expenses, user?._id]
  )
  const monthTotal = useMemo(
    () =>
      expenses
        .filter((e) => {
          const d = new Date(e.date || e.createdAt)
          return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
        })
        .reduce((s, e) => s + (Number(e.amount) || 0), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [expenses]
  )
  const monthlyBudget = Number(group?.monthlyBudget) || 0
  const budgetInfo = budgetStatus(monthTotal, monthlyBudget)

  // The group creator is the admin; the backend returns the caller's role
  // as group.myRole ('ADMIN' / 'MEMBER') — use it first, fall back to the
  // membership list (roles are uppercase on the backend).
  const isAdmin = useMemo(() => {
    if (group?.myRole === 'ADMIN') return true
    if (group?.myRole === 'MEMBER') return false
    if (!user) return false
    return members.some((m) => idOf(m.user || m) === user._id && m.role === 'ADMIN')
  }, [members, user, group])

  // Defense in depth: the backend already filters /balances for members,
  // but never render another member's debts/balances to a non-admin.
  const visibleSettlements = useMemo(() => {
    if (isAdmin) return settlements
    return settlements.filter((s) => idOf(s.from) === user?._id || idOf(s.to) === user?._id)
  }, [settlements, isAdmin, user?._id])
  const visibleBalances = useMemo(() => {
    if (isAdmin) return balances
    return balances.filter((b) => idOf(b.user) === user?._id)
  }, [balances, isAdmin, user?._id])

  async function handleDelete(exp) {
    if (!isAdmin) {
      pushToast('error', t('onlyAdminCanDelete'))
      return
    }
    if (!window.confirm(t('confirmDelete'))) return
    try {
      await api.delete(`/groups/${resolvedGroupId}/expenses/${exp._id}`)
      pushToast('success', t('expenseDeleted'))
      loadAll()
    } catch (e) {
      pushToast('error', e?.response?.data?.message || t('failedToLoad'))
    }
  }

  async function handleExport(kind) {
    setExporting(true)
    try {
      const filters = { from: dateFrom, to: dateTo, category, search: search.trim() || undefined }
      const data = await fetchExport(resolvedGroupId, filters)
      // Use the export endpoint's own (privacy-filtered) settlements and
      // balances — never overwrite them with the dashboard's unfiltered ones.
      const payload = { ...data, group: data.group || group }
      if (kind === 'csv') {
        downloadCSV(payload, `${(group?.name || 'splittrack').replace(/[^a-z0-9-_]+/gi, '-').toLowerCase()}-expenses.csv`)
      } else {
        downloadPDF(payload)
      }
      pushToast('success', kind === 'csv' ? t('exportCSV') : t('exportPDF'))
    } catch (e) {
      pushToast('error', e?.response?.data?.message || t('failedToLoad'))
    } finally {
      setExporting(false)
    }
  }

  function clearFilters() {
    setSearch('')
    setCategory('')
    setDateFrom('')
    setDateTo('')
  }

  if (!resolvedGroupId) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="text-slate-500">{t('noGroups')}</p>
        <p className="text-sm text-slate-400 mt-1">{t('noGroupsDesc')}</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 text-slate-500">
        <Loader2 className="w-8 h-8 spinner text-brand-700" />
        <p>{t('loading')}</p>
      </div>
    )
  }

  if (loadError && !group) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="text-red-600 font-medium">{loadError}</p>
        <button onClick={loadAll} className="mt-4 inline-flex items-center gap-2 px-4 py-2 min-h-[44px] rounded-lg bg-brand-600 text-white font-medium hover:bg-brand-700">
          <RefreshCw className="w-4 h-4" />
          {t('retry')}
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-6 min-w-0">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-4 h-10 rounded-full shrink-0" style={{ backgroundColor: group?.color || '#0D9488' }} />
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white truncate">{group?.name}</h1>
            <p className="text-sm text-slate-500">
              {members.length} {t('membersCount')} · {expenses.length} {t('expenses')}
            </p>
          </div>
        </div>
        <div className="flex-1" />
        <button onClick={() => setShowActivity(true)} className="flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-lg border border-slate-300 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 dark:border-slate-600 dark:text-slate-100">
          <Activity className="w-4 h-4" />
          {t('activityFeed')}
        </button>
        <button onClick={() => setShowInviteModal(true)} className="flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 dark:text-slate-100 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800">
          <UserPlus className="w-4 h-4" />
          {t('invite')}
        </button>
        <Link to={`/groups/${resolvedGroupId}/admin`} className="hidden md:flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 dark:text-slate-100 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800">
          <Settings className="w-4 h-4" />
          {t('adminPanel')}
        </Link>
        <button
          onClick={() => {
            setEditingExpense(null)
            setShowExpenseModal(true)
          }}
          className="flex items-center gap-1.5 px-4 py-2 min-h-[44px] rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700"
        >
          <Plus className="w-4 h-4" />
          {t('addExpense')}
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-card p-5">
          <div className="text-sm text-slate-500">{isAdmin ? t('totalSpent') : t('yourSpending')}</div>
          <div className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-1 break-words">{currency} {(isAdmin ? totalSpent : myTotalSpent).toFixed(2)}</div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-card p-5">
          <div className="text-sm text-slate-500">{t('yourShare')}</div>
          <div className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-1 break-words">{currency} {yourShare.toFixed(2)}</div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-card p-5">
          <div className="text-sm text-slate-500">{t('youOwe')}</div>
          <div className="text-xl sm:text-2xl font-bold text-red-600 mt-1 break-words">{currency} {youOwe.toFixed(2)}</div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-card p-5">
          <div className="text-sm text-slate-500">{t('youAreOwed')}</div>
          <div className="text-xl sm:text-2xl font-bold text-emerald-600 mt-1 break-words">{currency} {youAreOwed.toFixed(2)}</div>
        </div>
      </div>

      {monthlyBudget > 0 && isAdmin && (
        <div
          className={`rounded-2xl border px-5 py-4 flex flex-wrap items-center gap-3 ${
            budgetInfo.level === 'over'
              ? 'bg-red-50 dark:bg-red-900/30 border-red-300 dark:border-red-700 text-red-800 dark:text-red-200 animate-pulse-red'
              : budgetInfo.level === 'warning'
                ? 'bg-amber-50 dark:bg-amber-900/30 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200'
                : 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200'
          }`}
          role="alert"
        >
          <span className="font-bold text-sm">
            {budgetInfo.level === 'over' ? t('budgetExceeded') : budgetInfo.level === 'warning' ? t('budgetWarning') : t('budgetOnTrack')}
          </span>
          <span className="text-sm">
            {t('spentThisMonth')}: {currency} {monthTotal.toFixed(2)} / {currency} {monthlyBudget.toFixed(2)} ({budgetInfo.pct.toFixed(0)}%)
          </span>
          <div className="flex-1 min-w-[160px] h-2.5 rounded-full bg-white/70 dark:bg-slate-800 overflow-hidden">
            <div className={`h-full rounded-full ${budgetBarClass(budgetInfo.level)}`} style={{ width: `${Math.min(budgetInfo.pct, 100)}%` }} />
          </div>
          <span className="text-sm font-semibold">
            {t('budgetRemaining')}: {currency} {Math.max(monthlyBudget - monthTotal, 0).toFixed(2)}
          </span>
        </div>
      )}

      {!isAdmin && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-5 py-3 text-sm text-slate-600 dark:text-slate-300">
          {t('spentThisMonth')}: {currency} {myMonthTotal.toFixed(2)}
        </div>
      )}

      <AnalyticsSection expenses={expenses} members={members} group={group} currency={currency} isAdmin={isAdmin} currentUserId={user?._id} />

      <div className="grid lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-card p-4 min-w-0">
            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('searchExpenses')} className="w-full pl-9 pr-3 py-2 min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="px-3 py-2 min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 max-w-full">
                <option value="">{t('all')} — {t('category')}</option>
                {categoryKeys.map((c) => (
                  <option key={c} value={c}>
                    {t(c)}
                  </option>
                ))}
              </select>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="px-3 py-2 min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white text-sm max-w-full" />
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="px-3 py-2 min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white text-sm max-w-full" />
              <button onClick={clearFilters} className="px-3 py-2 min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 dark:text-slate-100 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
                {t('clearFilters')}
              </button>
              <button onClick={loadAll} className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg border border-slate-300 dark:border-slate-600 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800" title={t('refresh')}>
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
            <div className="flex gap-2 mt-3">
              <div className="relative">
                <button onClick={() => setExportOpen((v) => !v)} disabled={exporting} className="flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-60">
                  <Download className="w-4 h-4" />
                  {t('exportMenu')}
                  <ChevronDown className="w-4 h-4" />
                </button>
                {exportOpen && (
                  <div className="absolute left-0 mt-2 w-56 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-pop overflow-hidden z-20">
                    <button onClick={() => { setExportOpen(false); handleExport('csv') }} className="w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100">
                      <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                      {t('exportCSV')}
                    </button>
                    <button onClick={() => { setExportOpen(false); handleExport('pdf') }} className="w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100">
                      <FileText className="w-4 h-4 text-indigo-600" />
                      {t('exportPDF')}
                    </button>
                    <div className="px-4 py-2 text-xs text-slate-400 border-t border-slate-100 dark:border-slate-700">{t('exportWithSearch')}</div>
                  </div>
                )}
              </div>
              {exporting && <span className="text-sm text-slate-500 self-center flex items-center gap-1"><Loader2 className="w-4 h-4 spinner" />{t('loading')}</span>}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-card p-6 sm:p-10 text-center">
              <Receipt className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="font-semibold text-slate-900">{t('noExpenses')}</p>
              <p className="text-sm text-slate-500 mt-1">{t('noExpensesDesc')}</p>
              <button
                onClick={() => {
                  setEditingExpense(null)
                  setShowExpenseModal(true)
                }}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700"
              >
                <Plus className="w-4 h-4" />
                {t('addYourFirstExpense')}
              </button>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-card overflow-hidden min-w-0">
              <div className="hidden md:grid grid-cols-[1fr_110px_110px_110px_90px] gap-2 px-5 py-3 bg-slate-50 dark:bg-slate-800 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <span>{t('title')}</span>
                <span>{t('category')}</span>
                <span>{t('paidBy')}</span>
                <span className="text-right">{t('amount')}</span>
                <span className="text-right">{t('date')}</span>
              </div>
              {filtered.map((exp) => (
                <div key={exp._id} className="flex flex-col md:grid md:grid-cols-[1fr_110px_110px_110px_90px] gap-2 px-4 sm:px-5 py-3.5 border-t border-slate-100 dark:border-slate-700 items-start md:items-center min-w-0">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 dark:text-white truncate">
                      {exp.title}{' '}
                      {((exp.editHistory?.length || 0) > 0 || (exp.editCount || 0) > 0) && (
                        <span
                          className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-semibold whitespace-nowrap"
                          title={`${t('previousTitle')}: ${(exp.editHistory?.[exp.editHistory.length - 1]?.previousTitle ?? exp.editHistory?.[exp.editHistory.length - 1]?.title) || '—'} · ${t('previousAmount')}: ${exp.editHistory?.[exp.editHistory.length - 1]?.previousAmount ?? '—'}`}
                        >
                          {t('edited')} ({exp.editHistory?.length || exp.editCount || 1}/{exp.editHistory?.length || exp.editCount || 1})
                        </span>
                      )}
                      {((exp.editRequest?.status || exp.pendingEditRequest?.status || '') === 'PENDING' || exp.editRequest?.status === 'pending') && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold whitespace-nowrap">{t('pendingApproval')}</span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 md:hidden">
                      {t(exp.category) || exp.category} · {nameOf(exp.paidBy)} · {Number(exp.amount || 0).toFixed(2)}
                    </div>
                    <div className="text-xs text-slate-400">{exp.status ? t(exp.status === 'settled' ? 'settled' : 'unsettled') : ''}</div>
                  </div>
                  <div className="hidden md:block"><span className="text-xs px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 font-medium">{t(exp.category) || exp.category}</span></div>
                  <div className="hidden md:block text-sm text-slate-600 truncate">{nameOf(exp.paidBy)}</div>
                  <div className="hidden md:block text-sm font-bold text-slate-900 text-right">{Number(exp.amount || 0).toFixed(2)}</div>
                  <div className="hidden md:block text-sm text-slate-500 text-right">{exp.date ? new Date(exp.date).toLocaleDateString() : ''}</div>
                  <div className="flex gap-1 md:col-span-5 md:justify-end -mt-1 md:mt-0">
                    <button
                      onClick={() => {
                        setEditingExpense(exp)
                        setShowExpenseModal(true)
                      }}
                      className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-brand-50 dark:hover:bg-slate-700 text-brand-700"
                      title={t('editExpense')}
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(exp)} disabled={!isAdmin} className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-red-50 dark:hover:bg-slate-700 text-red-600 disabled:opacity-40 disabled:cursor-not-allowed" title={isAdmin ? t('delete') : t('onlyAdminCanDelete')}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <WhoOwesWhomCard group={group} balances={visibleBalances} settlements={visibleSettlements} onSettled={loadAll} currency={currency} isAdmin={isAdmin} />
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-card p-4 sm:p-5 min-w-0">
            <h3 className="font-bold text-slate-900 dark:text-white mb-3">{t('members')}</h3>
            <div className="space-y-2">
              {members.map((m) => {
                const uid = idOf(m.user || m)
                const nm = nameOf(m.user || m)
                const role = m.role || 'member'
                return (
                  <div key={uid || nm} className="flex items-center gap-2 text-sm">
                    <span className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-xs">{nm.charAt(0).toUpperCase()}</span>
                    <span className="flex-1 truncate font-medium text-slate-900 dark:text-white min-w-0">{nm}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${role === 'ADMIN' ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-600'}`}>
                      {role === 'ADMIN' ? t('admin') : t('member')}
                    </span>
                  </div>
                )
              })}
              {members.length === 0 && <p className="text-sm text-slate-500">{t('noMembers')}</p>}
            </div>
          </div>
        </div>
      </div>

      {showExpenseModal && <ExpenseModal group={group} members={members} expense={editingExpense} onClose={() => setShowExpenseModal(false)} onSaved={loadAll} />}
      {showInviteModal && <InviteModal group={group} onClose={() => setShowInviteModal(false)} />}
      <ActivityFeedDrawer groupId={resolvedGroupId} open={showActivity} onClose={() => setShowActivity(false)} />
    </div>
  )
}
