import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2, Trash2, Wallet } from 'lucide-react'
import { useApp, api } from '../context/AppContext'
import { categoryKeys } from '../i18n/locales'

function monthStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return monthStr(d)
}

function monthLabel(month) {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })
}

function money(n) {
  return Number(n || 0).toFixed(2)
}

export default function PocketMoney() {
  const { t, pushToast } = useApp()
  const [month, setMonth] = useState(() => monthStr(new Date()))
  const [summary, setSummary] = useState(null)
  const [breakdown, setBreakdown] = useState([])
  const [breakdownTotal, setBreakdownTotal] = useState(0)
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingBudget, setSavingBudget] = useState(false)
  const [adding, setAdding] = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  // Pocket money form
  const [pocketInput, setPocketInput] = useState('')
  // Add personal expense form
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('food')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [sumRes, expRes, brRes] = await Promise.all([
        api.get(`/pocket-money/${month}`),
        api.get(`/pocket-money/${month}/expenses`),
        api.get(`/pocket-money/${month}/breakdown`),
      ])
      const sum = sumRes.data?.data || null
      setSummary(sum)
      setPocketInput(sum?.budgetSet ? String(sum.pocketMoney) : '')
      const eData = expRes.data?.data || {}
      setExpenses(Array.isArray(eData) ? eData : eData.expenses || [])
      const bData = brRes.data?.data || {}
      setBreakdown(bData.breakdown || [])
      setBreakdownTotal(bData.total || 0)
    } catch {
      pushToast('error', t('failedToLoad'))
    } finally {
      setLoading(false)
    }
  }, [month, pushToast, t])

  useEffect(() => {
    load()
  }, [load])

  // Keep the expense date inside the viewed month.
  useEffect(() => {
    const [y, m] = month.split('-').map(Number)
    const first = `${month}-01`
    const lastDay = new Date(y, m, 0).getDate()
    const last = `${month}-${String(lastDay).padStart(2, '0')}`
    setDate((d) => (d < first || d > last ? first : d))
  }, [month])

  const currency = summary?.currency || 'PKR'
  const pct = summary?.spentPercent || 0
  const barColor = summary?.warning === 'over' ? 'bg-red-500' : summary?.warning === 'warning' ? 'bg-amber-500' : 'bg-emerald-500'
  const maxBreakdown = useMemo(() => Math.max(0, ...breakdown.map((b) => b.total || 0)), [breakdown])

  async function saveBudget(e) {
    e.preventDefault()
    const value = parseFloat(pocketInput)
    if (!Number.isFinite(value) || value < 0) {
      pushToast('error', t('enterPocketMoney'))
      return
    }
    setSavingBudget(true)
    try {
      await api.put(`/pocket-money/${month}`, { pocketMoney: value })
      pushToast('success', t('pocketMoneySaved'))
      load()
    } catch (err) {
      pushToast('error', err?.response?.data?.error || t('failedToLoad'))
    } finally {
      setSavingBudget(false)
    }
  }

  async function addExpense(e) {
    e.preventDefault()
    if (!title.trim()) {
      pushToast('error', t('enterTitle'))
      return
    }
    const value = parseFloat(amount)
    if (!Number.isFinite(value) || value <= 0) {
      pushToast('error', t('enterAmount'))
      return
    }
    setAdding(true)
    try {
      await api.post(`/pocket-money/${month}/expenses`, {
        title: title.trim(),
        amount: value,
        category,
        date,
        notes: notes.trim(),
      })
      pushToast('success', t('personalExpenseAdded'))
      setTitle('')
      setAmount('')
      setNotes('')
      load()
    } catch (err) {
      pushToast('error', err?.response?.data?.error || t('failedToLoad'))
    } finally {
      setAdding(false)
    }
  }

  async function deleteExpense(id) {
    if (!window.confirm(t('confirmDeleteExpense'))) return
    setDeletingId(id)
    try {
      await api.delete(`/pocket-money/${month}/expenses/${id}`)
      pushToast('success', t('personalExpenseDeleted'))
      load()
    } catch (err) {
      pushToast('error', err?.response?.data?.error || t('failedToLoad'))
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-4 sm:py-6 space-y-4">
      {/* Header + month selector */}
      <div className="flex items-center gap-2">
        <div className="w-10 h-10 rounded-xl bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 flex items-center justify-center shrink-0">
          <Wallet className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white truncate">{t('pocketMoney')}</h1>
          <p className="text-xs sm:text-sm text-slate-500 truncate">{t('pocketMoneyDesc')}</p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-card p-3 flex items-center justify-between gap-2">
        <button
          onClick={() => setMonth((m) => shiftMonth(m, -1))}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
          aria-label={t('previousMonth')}
          title={t('previousMonth')}
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="font-bold text-slate-900 dark:text-white text-base sm:text-lg">{monthLabel(month)}</span>
        <button
          onClick={() => setMonth((m) => shiftMonth(m, 1))}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
          aria-label={t('nextMonth')}
          title={t('nextMonth')}
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {loading ? (
        <div className="py-16 flex items-center justify-center text-slate-500">
          <Loader2 className="w-6 h-6 spinner" />
          <span className="ml-2">{t('loading')}</span>
        </div>
      ) : (
        <>
          {/* Pocket money form */}
          <form onSubmit={saveBudget} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-card p-4 space-y-3">
            <label htmlFor="pocket-money-input" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
              {t('setPocketMoney')} — {monthLabel(month)}
            </label>
            <div className="flex gap-2">
              <input
                id="pocket-money-input"
                type="number"
                min="0"
                step="0.01"
                value={pocketInput}
                onChange={(e) => setPocketInput(e.target.value)}
                placeholder={t('pocketMoneyPlaceholder')}
                className="flex-1 min-w-0 px-3 py-2.5 min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <button
                type="submit"
                disabled={savingBudget}
                className="px-4 py-2.5 min-h-[44px] rounded-lg bg-brand-600 text-white font-semibold hover:bg-brand-700 disabled:opacity-60 flex items-center gap-2 shrink-0"
              >
                {savingBudget && <Loader2 className="w-4 h-4 spinner" />}
                {t('save')}
              </button>
            </div>
            {!summary?.budgetSet && (
              <p className="text-xs text-slate-500">{t('budgetNotSetHint')}</p>
            )}
          </form>

          {/* Warning banners */}
          {summary?.warning === 'over' && (
            <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 text-sm font-medium text-red-700 dark:text-red-300 flex gap-2">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span>{t('overBudgetWarning')}</span>
            </div>
          )}
          {summary?.warning === 'warning' && (
            <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3 text-sm font-medium text-amber-700 dark:text-amber-300 flex gap-2">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span>{t('nearBudgetWarning')}</span>
            </div>
          )}
          {summary && !summary.budgetSet && (
            <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
              {t('budgetNotSet')}
            </div>
          )}

          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-card p-4">
              <p className="text-xs font-medium text-slate-500">{t('pocketMoney')}</p>
              <p className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white mt-1 break-words">
                {currency} {money(summary?.pocketMoney)}
              </p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-card p-4">
              <p className="text-xs font-medium text-slate-500">{t('spentThisMonth')}</p>
              <p className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white mt-1 break-words">
                {currency} {money(summary?.spent)}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                {t('personal')}: {money(summary?.personalSpent)} · {t('groupShare')}: {money(summary?.groupSpent)}
              </p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-card p-4">
              <p className="text-xs font-medium text-slate-500">{t('remaining')}</p>
              <p className={`text-lg sm:text-xl font-bold mt-1 break-words ${(summary?.remaining ?? 0) < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {currency} {money(summary?.remaining)}
              </p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-card p-4">
              <p className="text-xs font-medium text-slate-500">{t('safePerDay')}</p>
              <p className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white mt-1 break-words">
                {currency} {money(summary?.safeDailySpend)}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                {summary?.daysLeft ?? 0} {t('daysLeft')}
              </p>
            </div>
          </div>

          {/* Progress bar */}
          {summary?.budgetSet && (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-card p-4">
              <div className="flex justify-between text-xs font-medium text-slate-500 mb-2">
                <span>
                  {pct}% {t('spentThisMonth').toLowerCase()}
                </span>
                <span>
                  {currency} {money(summary?.spent)} / {money(summary?.pocketMoney)}
                </span>
              </div>
              <div className="h-3 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${Math.min(100, pct)}%` }} />
              </div>
            </div>
          )}

          {/* Category breakdown */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-card p-4">
            <h2 className="font-bold text-slate-900 dark:text-white mb-3">{t('categoryBreakdown')}</h2>
            {breakdownTotal <= 0 ? (
              <p className="text-sm text-slate-500">{t('noPersonalExpenses')}</p>
            ) : (
              <div className="space-y-3">
                {breakdown
                  .filter((b) => b.total > 0)
                  .map((b) => (
                    <div key={b.category}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium text-slate-700 dark:text-slate-200">
                          {t(b.category)}
                          <span className="text-xs text-slate-400 font-normal ml-2">
                            {t('personal')} {money(b.personal)} · {t('groupShare')} {money(b.group)}
                          </span>
                        </span>
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {currency} {money(b.total)}
                        </span>
                      </div>
                      <div className="h-2.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-brand-500"
                          style={{ width: `${maxBreakdown > 0 ? (b.total / maxBreakdown) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Add personal expense */}
          <form onSubmit={addExpense} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-card p-4 space-y-3">
            <h2 className="font-bold text-slate-900 dark:text-white">{t('addPersonalExpense')}</h2>
            <div>
              <label htmlFor="pm-title" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                {t('title')}
              </label>
              <input
                id="pm-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('enterTitle')}
                className="w-full px-3 py-2.5 min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="pm-amount" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                  {t('amount')} ({currency})
                </label>
                <input
                  id="pm-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={t('enterAmount')}
                  className="w-full px-3 py-2.5 min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label htmlFor="pm-date" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                  {t('date')}
                </label>
                <input
                  id="pm-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2.5 min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <p className="text-xs text-slate-400 mt-1">{t('expenseDateHint')}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="pm-category" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                  {t('category')}
                </label>
                <select
                  id="pm-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-2.5 min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  {categoryKeys.map((c) => (
                    <option key={c} value={c}>
                      {t(c)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="pm-notes" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                  {t('receiptNote')}
                </label>
                <input
                  id="pm-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t('receiptNotePlaceholder')}
                  className="w-full px-3 py-2.5 min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={adding}
              className="w-full py-2.5 min-h-[44px] rounded-lg bg-brand-600 text-white font-semibold hover:bg-brand-700 disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {adding && <Loader2 className="w-4 h-4 spinner" />}
              {t('addPersonalExpense')}
            </button>
          </form>

          {/* Personal expense list */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-card p-4">
            <h2 className="font-bold text-slate-900 dark:text-white mb-3">{t('personalExpenses')}</h2>
            {expenses.length === 0 ? (
              <p className="text-sm text-slate-500">{t('noPersonalExpenses')}</p>
            ) : (
              <div className="space-y-2">
                {expenses.map((e) => (
                  <div key={e._id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{e.title}</p>
                      <p className="text-xs text-slate-500">
                        {t(e.category)} · {new Date(e.date).toLocaleDateString('en-GB')}
                        {e.notes ? ` · ${e.notes}` : ''}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-slate-900 dark:text-white shrink-0">
                      {currency} {money(e.amount)}
                    </span>
                    <button
                      onClick={() => deleteExpense(e._id)}
                      disabled={deletingId === e._id}
                      className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 shrink-0"
                      aria-label={t('delete')}
                      title={t('delete')}
                    >
                      {deletingId === e._id ? <Loader2 className="w-4 h-4 spinner" /> : <Trash2 className="w-4 h-4" />}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <p className="text-xs text-slate-400 text-center pb-2">{t('groupExpensesThisMonth')}</p>
        </>
      )}
    </div>
  )
}
