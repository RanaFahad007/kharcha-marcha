import { useMemo } from 'react'
import { BarChart3, TrendingUp } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { categoryKeys } from '../i18n/locales'

const CATEGORY_COLORS = {
  food: '#f59e0b',
  transport: '#3b82f6',
  rent: '#1e3a5f',
  utilities: '#06b6d4',
  entertainment: '#4f46e5',
  shopping: '#10b981',
  other: '#64748b'
}

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

export function budgetStatus(spent, budget) {
  if (!budget || budget <= 0) return { pct: 0, level: 'none' }
  const pct = (spent / budget) * 100
  if (pct >= 100) return { pct, level: 'over' }
  if (pct >= 75) return { pct, level: 'warning' }
  return { pct, level: 'ok' }
}

export function budgetBarClass(level) {
  if (level === 'over') return 'bg-red-500 animate-pulse-red'
  if (level === 'warning') return 'bg-amber-500'
  return 'bg-emerald-500'
}

export default function AnalyticsSection({ expenses = [], members = [], group = {}, currency = '', isAdmin = true, currentUserId = '' }) {
  const { t } = useApp()
  const cur = currency || group?.currency || ''
  const list = expenses || []

  // Privacy: an admin sees group numbers; a member sees ONLY their own
  // numbers — their own share of each visible expense (never another
  // member's amounts, and never the group-wide budget).
  const ownShare = (e) => {
    if (!currentUserId) return Number(e.amount) || 0
    const mine = (e.splitBetween || []).find((x) => idOf(x.user) === currentUserId)
    if (mine) return Number(mine.shareAmount) || 0
    if (idOf(e.paidBy) === currentUserId) return Number(e.amount) || 0
    return 0
  }
  const amountOf = (e) => (isAdmin ? Number(e.amount) || 0 : ownShare(e))

  const totalsByCategory = useMemo(() => {
    const totals = {}
    list.forEach((e) => {
      const c = e.category || 'other'
      totals[c] = (totals[c] || 0) + amountOf(e)
    })
    return totals
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, isAdmin, currentUserId])

  const totalSpent = useMemo(() => list.reduce((s, e) => s + amountOf(e), 0), [list, isAdmin, currentUserId])
  const maxCat = Math.max(0, ...Object.values(totalsByCategory))

  const leaderboard = useMemo(() => {
    if (!isAdmin) {
      // Members see only their own row — never other members' totals.
      if (!currentUserId) return []
      const me = (members || []).find((m) => idOf(m.user || m) === currentUserId)
      return [{ id: currentUserId, name: me ? nameOf(me.user || me) : currentUserId, total: totalSpent }]
    }
    const paid = {}
    list.forEach((e) => {
      const id = idOf(e.paidBy)
      if (!id) return
      paid[id] = (paid[id] || 0) + (Number(e.amount) || 0)
    })
    const rows = Object.entries(paid)
      .map(([id, total]) => {
        const member = (members || []).find((m) => idOf(m.user || m) === id)
        return { id, name: member ? nameOf(member.user || member) : id, total }
      })
      .sort((a, b) => b.total - a.total)
    return rows
  }, [list, members, isAdmin, currentUserId, totalSpent, t])

  const maxPaid = leaderboard.length ? leaderboard[0].total : 0

  const now = new Date()
  const monthTotal = useMemo(
    () =>
      list
        .filter((e) => {
          const d = new Date(e.date || e.createdAt)
          return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
        })
        .reduce((s, e) => s + amountOf(e), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [list, isAdmin, currentUserId]
  )

  const budget = Number(group?.monthlyBudget) || 0
  const { pct, level } = budgetStatus(monthTotal, budget)

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-card p-4 sm:p-5 min-w-0">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="w-5 h-5 text-brand-700" />
        <h3 className="font-bold text-slate-900 dark:text-white">{t('analytics')}</h3>
      </div>

      {/* Monthly budget progress — admin only (group-wide). Members see
          only their own spending this month, never the group budget. */}
      {isAdmin ? (
        <div className="mb-5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm mb-1.5">
            <span className="font-medium text-slate-700 dark:text-slate-200 min-w-0 break-words">
              {t('monthlyBudget')} — {t('spentThisMonth')}: {cur} {monthTotal.toFixed(2)}
              {budget > 0 ? ` / ${cur} ${budget.toFixed(2)}` : ''}
            </span>
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                level === 'over' ? 'bg-red-100 text-red-700 animate-pulse-red' : level === 'warning' ? 'bg-amber-100 text-amber-800' : level === 'none' ? 'bg-slate-100 text-slate-600' : 'bg-emerald-100 text-emerald-700'
              }`}
            >
              {budget > 0 ? `${pct.toFixed(0)}% · ${level === 'over' ? t('budgetExceeded') : level === 'warning' ? t('budgetWarning') : t('budgetOnTrack')}` : t('noBudgetSet')}
            </span>
          </div>
          {budget > 0 && (
            <div className="w-full h-3 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden" role="progressbar" aria-valuenow={Math.round(Math.min(pct, 100))} aria-valuemin="0" aria-valuemax="100">
              <div className={`h-full rounded-full transition-all ${budgetBarClass(level)}`} style={{ width: `${Math.min(pct, 100)}%` }} />
            </div>
          )}
        </div>
      ) : (
        <div className="mb-5 text-sm text-slate-600 dark:text-slate-300">
          {t('spentThisMonth')}: {cur} {monthTotal.toFixed(2)}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {/* Category breakdown — horizontal bars (pure Tailwind, no chart lib) */}
        <div>
          <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">{t('categoryBreakdown')}</h4>
          {Object.keys(totalsByCategory).length === 0 && <p className="text-sm text-slate-500">{t('noExpenses')}</p>}
          <div className="space-y-2.5">
            {categoryKeys
              .filter((c) => totalsByCategory[c] > 0)
              .sort((a, b) => totalsByCategory[b] - totalsByCategory[a])
              .map((c) => (
                <div key={c}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium text-slate-700 dark:text-slate-200">{t(c)}</span>
                    <span className="text-slate-500">
                      {cur} {totalsByCategory[c].toFixed(2)} ({totalSpent > 0 ? ((totalsByCategory[c] / totalSpent) * 100).toFixed(0) : 0}%)
                    </span>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${maxCat > 0 ? (totalsByCategory[c] / maxCat) * 100 : 0}%`, backgroundColor: CATEGORY_COLORS[c] || '#64748b' }} />
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* Member spending leaderboard */}
        <div>
          <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-brand-700" />
            {t('topSpenders')}
          </h4>
          {leaderboard.length === 0 && <p className="text-sm text-slate-500">{t('noMembers')}</p>}
          <div className="space-y-2.5">
            {leaderboard.map((row, i) => (
              <div key={row.id} className="flex items-center gap-2 min-w-0">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-slate-200 text-slate-700' : i === 2 ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-500'}`}>
                  {i + 1}
                </span>
                <span className="flex-1 text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{row.name}</span>
                <div className="w-16 sm:w-24 h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden hidden sm:block shrink-0">
                  <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${maxPaid > 0 ? (row.total / maxPaid) * 100 : 0}%` }} />
                </div>
                <span className="text-sm font-bold text-slate-900 dark:text-white whitespace-nowrap shrink-0">
                  {cur} {row.total.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
