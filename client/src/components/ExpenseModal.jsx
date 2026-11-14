import { useEffect, useMemo, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { useApp, api } from '../context/AppContext'
import { categoryKeys } from '../i18n/locales'

function memberId(m) {
  if (!m) return ''
  if (typeof m === 'string') return m
  return m.user?._id || m.user || m._id || ''
}
function memberName(m) {
  if (!m) return ''
  if (typeof m === 'string') return m
  return m.user?.name || m.name || m.user?.email || m._id || ''
}
function splitIdOf(s) {
  if (!s) return ''
  const u = s.user
  return typeof u === 'object' ? u?._id || '' : u || ''
}

const SPLIT_MODES = [
  { id: 'EQUAL', labelKey: 'splitEqual' },
  { id: 'EXACT', labelKey: 'splitExact' },
  { id: 'PERCENTAGE', labelKey: 'splitPercentage' },
  { id: 'SHARES', labelKey: 'splitShares' }
]

function normalizeMode(v) {
  if (!v) return 'EQUAL'
  const u = String(v).toUpperCase()
  if (u === 'EQUAL' || u === 'EXACT' || u === 'PERCENTAGE' || u === 'SHARES') return u
  if (u === 'CUSTOM') return 'EXACT'
  return 'EQUAL'
}

export default function ExpenseModal({ group, members, expense, onClose, onSaved }) {
  const { user, t, pushToast } = useApp()
  const isEdit = Boolean(expense?._id)
  const [title, setTitle] = useState(expense?.title || '')
  const [amount, setAmount] = useState(expense?.amount ? String(expense.amount) : '')
  const [category, setCategory] = useState(expense?.category || 'food')
  const [date, setDate] = useState(() => {
    if (expense?.date) return new Date(expense.date).toISOString().slice(0, 10)
    return new Date().toISOString().slice(0, 10)
  })
  const [paidBy, setPaidBy] = useState(() => {
    if (!expense?.paidBy) return ''
    return typeof expense.paidBy === 'string' ? expense.paidBy : expense.paidBy._id || ''
  })
  const [splitMethod, setSplitMethod] = useState(() => normalizeMode(expense?.splitMethod || expense?.splitType))
  // per-member inputs: EXACT -> amount, PERCENTAGE -> %, SHARES -> share count
  const [inputs, setInputs] = useState({})
  const [notes, setNotes] = useState(expense?.notes || expense?.note || '')
  const [receiptUrl, setReceiptUrl] = useState(expense?.receiptUrl || '')
  const [selected, setSelected] = useState(() => {
    if (expense?.splitBetween?.length) return expense.splitBetween.map(splitIdOf).filter(Boolean)
    return members.map((m) => memberId(m))
  })
  const [reason, setReason] = useState('')
  const [showReason, setShowReason] = useState(false)
  const [editRequestRequired, setEditRequestRequired] = useState(false)
  const [saving, setSaving] = useState(false)

  const memberList = useMemo(() => (members || []).filter((m) => memberId(m)), [members])

  useEffect(() => {
    if (!paidBy && memberList.length > 0) {
      const me = memberList.find((m) => memberId(m) === user?._id)
      setPaidBy(memberId(me || memberList[0]))
    }
  }, [memberList, paidBy, user?._id])

  useEffect(() => {
    if (expense?.splitBetween?.length) {
      const map = {}
      expense.splitBetween.forEach((s) => {
        const id = splitIdOf(s)
        if (!id) return
        const meta = s.shareMeta || {}
        if (normalizeMode(expense?.splitMethod || expense?.splitType) === 'PERCENTAGE') map[id] = String(meta.percentage ?? s.percentage ?? '')
        else if (normalizeMode(expense?.splitMethod || expense?.splitType) === 'SHARES') map[id] = String(meta.shares ?? s.shares ?? '')
        else map[id] = String(s.shareAmount ?? '')
      })
      setInputs(map)
    }
  }, [expense])

  const total = parseFloat(amount) || 0
  const activeMembers = memberList.filter((m) => selected.includes(memberId(m)))
  const equalShare = activeMembers.length > 0 ? total / activeMembers.length : 0

  const pctSum = useMemo(
    () => activeMembers.reduce((s, m) => s + (parseFloat(inputs[memberId(m)] || 0) || 0), [inputs, activeMembers]),
    [inputs, activeMembers]
  )
  const exactSum = useMemo(
    () => activeMembers.reduce((s, m) => s + (parseFloat(inputs[memberId(m)] || 0) || 0), [inputs, activeMembers]),
    [inputs, activeMembers]
  )
  const shareTotal = useMemo(
    () => activeMembers.reduce((s, m) => s + (parseFloat(inputs[memberId(m)] || 0) || 0), [inputs, activeMembers]),
    [inputs, activeMembers]
  )

  function computedSplitBetween() {
    if (splitMethod === 'EQUAL') {
      return activeMembers.map((m) => ({ user: memberId(m), shareAmount: Number(equalShare.toFixed(2)), shareMeta: { method: 'EQUAL' } }))
    }
    if (splitMethod === 'EXACT') {
      return activeMembers.map((m) => ({ user: memberId(m), shareAmount: parseFloat(inputs[memberId(m)] || 0) || 0, shareMeta: { method: 'EXACT' } }))
    }
    if (splitMethod === 'PERCENTAGE') {
      return activeMembers.map((m) => {
        const pct = parseFloat(inputs[memberId(m)] || 0) || 0
        return { user: memberId(m), shareAmount: Number(((total * pct) / 100).toFixed(2)), shareMeta: { method: 'PERCENTAGE', percentage: pct } }
      })
    }
    // SHARES
    return activeMembers.map((m) => {
      const shares = parseFloat(inputs[memberId(m)] || 0) || 0
      return {
        user: memberId(m),
        shareAmount: shareTotal > 0 ? Number(((total * shares) / shareTotal).toFixed(2)) : 0,
        shareMeta: { method: 'SHARES', shares }
      }
    })
  }

  const splitValid = useMemo(() => {
    if (splitMethod === 'EQUAL') return true
    if (splitMethod === 'EXACT') return Math.abs(exactSum - total) < 0.01
    if (splitMethod === 'PERCENTAGE') return Math.abs(pctSum - 100) < 0.01
    if (splitMethod === 'SHARES') return shareTotal > 0 && activeMembers.every((m) => (parseFloat(inputs[memberId(m)] || 0) || 0) > 0)
    return true
  }, [splitMethod, exactSum, total, pctSum, shareTotal, activeMembers, inputs])

  const splitError = useMemo(() => {
    if (splitValid) return ''
    if (splitMethod === 'EXACT') return t('exactMustSumTotal')
    if (splitMethod === 'PERCENTAGE') return t('percentageMustSum100')
    if (splitMethod === 'SHARES') return t('sharesMustBePositive')
    return t('splitValidationError')
  }, [splitValid, splitMethod, t])

  const isOwner = expense && (typeof expense.createdBy === 'string' ? expense.createdBy === user?._id : expense.createdBy?._id === user?._id)
  const isAdmin = group?.isAdmin === true || group?.role === 'admin' || (group?.members || []).some((m) => memberId(m) === user?._id && (m.role === 'admin' || m.role === 'owner'))
  const needsReason = isEdit && !isAdmin && isOwner && (expense?.editCount || 0) >= 1

  function toggleMember(id) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function buildPayload() {
    return {
      title: title.trim(),
      amount: total,
      category,
      date,
      paidBy: paidBy || user?._id,
      splitMethod,
      splitType: splitMethod.toLowerCase(),
      splitBetween: computedSplitBetween(),
      memberIds: activeMembers.map((m) => memberId(m)),
      notes: notes.trim(),
      receiptUrl: receiptUrl.trim()
    }
  }

  async function submit(e) {
    e.preventDefault()
    if (!title.trim()) {
      pushToast('error', t('titleRequired'))
      return
    }
    if (!total || total <= 0) {
      pushToast('error', t('amountMustBePositive'))
      return
    }
    if (activeMembers.length === 0) {
      pushToast('error', t('noMembers'))
      return
    }
    if (!splitValid) {
      pushToast('error', splitError || t('splitValidationError'))
      return
    }
    if ((needsReason || editRequestRequired) && !showReason) {
      setShowReason(true)
      return
    }
    if ((needsReason || editRequestRequired) && !reason.trim()) {
      pushToast('error', t('editReasonPrompt'))
      return
    }
    setSaving(true)
    try {
      const payload = buildPayload()
      if (needsReason || editRequestRequired) {
        await api.post(`/groups/${group._id}/expenses/${expense._id}/request-edit`, { reason: reason.trim(), ...payload })
        pushToast('success', t('editRequestSent'))
        onSaved?.()
        onClose()
        return
      }
      if (isEdit) {
        await api.put(`/groups/${group._id}/expenses/${expense._id}`, payload)
        pushToast('success', t('expenseUpdated'))
      } else {
        await api.post(`/groups/${group._id}/expenses`, payload)
        pushToast('success', t('expenseAdded'))
      }
      onSaved?.()
      onClose()
    } catch (err) {
      const code = err?.response?.data?.code || err?.response?.data?.error
      const msg = err?.response?.data?.message || ''
      if (isEdit && err?.response?.status === 403 && (code === 'EDIT_REQUEST_REQUIRED' || /edit request/i.test(msg))) {
        setEditRequestRequired(true)
        setShowReason(true)
        pushToast('error', t('editRequestRequired'))
        return
      }
      pushToast('error', msg || t('failedToLoad'))
    } finally {
      setSaving(false)
    }
  }

  const showReasonBox = showReason || needsReason || editRequestRequired

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 modal-backdrop bg-black/50 overflow-y-auto" onClick={onClose}>
      <div className="modal-panel bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl shadow-pop w-full max-w-lg p-5 sm:p-6 max-h-[92dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">{isEdit ? t('editExpense') : t('addExpense')}</h3>
          <button onClick={onClose} className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {(needsReason || editRequestRequired) && (
          <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2.5 text-sm text-amber-800 dark:text-amber-200 mb-4">{t('secondEditNeedsApproval')}</div>
        )}

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">{t('title')}</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('enterTitle')} className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">{t('amount')}</label>
              <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={t('enterAmount')} className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">{t('date')}</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">{t('category')}</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500">
                {categoryKeys.map((c) => (
                  <option key={c} value={c}>
                    {t(c)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">{t('paidBy')}</label>
              <select value={paidBy} onChange={(e) => setPaidBy(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500">
                <option value="">{t('selectPayer')}</option>
                {memberList.map((m) => (
                  <option key={memberId(m)} value={memberId(m)}>
                    {memberName(m)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">{t('receiptNote')}</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('receiptNotePlaceholder')} className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">{t('receiptUrl')}</label>
            <input type="url" value={receiptUrl} onChange={(e) => setReceiptUrl(e.target.value)} placeholder={t('receiptUrlPlaceholder')} className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500" />
            {receiptUrl.trim() && (
              <a href={receiptUrl.trim()} target="_blank" rel="noreferrer" className="text-xs text-brand-700 hover:underline break-all">
                {receiptUrl.trim()}
              </a>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">{t('splitMethod')}</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
              {SPLIT_MODES.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setSplitMethod(mode.id)}
                  className={`py-2 min-h-[44px] rounded-lg text-xs sm:text-sm font-medium border ${splitMethod === mode.id ? 'bg-brand-600 text-white border-brand-600' : 'border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'}`}
                >
                  {t(mode.labelKey)}
                </button>
              ))}
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {memberList.map((m) => {
                const id = memberId(m)
                const checked = selected.includes(id)
                const computed = computedSplitBetween().find((s) => s.user === id)
                const displayShare = splitMethod === 'EQUAL' ? (checked ? equalShare : 0) : computed?.shareAmount || 0
                return (
                  <div key={id} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700">
                    <input type="checkbox" checked={checked} onChange={() => toggleMember(id)} className="w-5 h-5 shrink-0 accent-brand-600" />
                    <span className="flex-1 text-sm font-medium truncate text-slate-800 dark:text-slate-100">{memberName(m)}</span>
                    {splitMethod === 'EQUAL' ? (
                      <span className="text-sm text-slate-600 dark:text-slate-300">{checked ? displayShare.toFixed(2) : '0.00'}</span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <input
                          type="number"
                          min="0"
                          step={splitMethod === 'SHARES' ? '1' : '0.01'}
                          disabled={!checked}
                          value={inputs[id] || ''}
                          onChange={(e) => setInputs((prev) => ({ ...prev, [id]: e.target.value }))}
                          className="w-28 max-w-full px-2 py-2 min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm text-right disabled:bg-slate-50 dark:disabled:bg-slate-800"
                          placeholder={splitMethod === 'PERCENTAGE' ? '%' : splitMethod === 'SHARES' ? '1' : '0.00'}
                        />
                        <span className="text-xs text-slate-500 w-14 shrink-0 text-right">{displayShare.toFixed(2)}</span>
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
            {splitMethod === 'EXACT' && (
              <p className={`text-xs mt-2 ${splitValid ? 'text-emerald-600' : 'text-red-600'}`}>
                {t('exactMustSumTotal')} ({exactSum.toFixed(2)} / {total.toFixed(2)})
              </p>
            )}
            {splitMethod === 'PERCENTAGE' && (
              <p className={`text-xs mt-2 ${splitValid ? 'text-emerald-600' : 'text-red-600'}`}>
                {t('percentageMustSum100')} ({pctSum.toFixed(1)}% / 100%)
              </p>
            )}
            {splitMethod === 'SHARES' && (
              <p className={`text-xs mt-2 ${splitValid ? 'text-emerald-600' : 'text-red-600'}`}>
                {t('sharesCount')}: {shareTotal}
              </p>
            )}
            {!splitValid && <p className="text-xs mt-1 text-red-600 font-medium">{splitError}</p>}
            {splitMethod === 'EQUAL' && activeMembers.length > 0 && (
              <p className="text-xs text-slate-500 mt-2">
                {equalShare.toFixed(2)} {t('perPerson')}
              </p>
            )}
          </div>

          {showReasonBox && (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">{t('secondEditReason')}</label>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder={t('editReasonPrompt')} className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500" />
              {editRequestRequired && <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">{t('editRequestRequired')}</p>}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 font-medium hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100">
              {t('cancel')}
            </button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 min-h-[44px] rounded-lg bg-brand-600 text-white font-semibold hover:bg-brand-700 disabled:opacity-60 flex items-center justify-center gap-2">
              {saving && <Loader2 className="w-4 h-4 spinner" />}
              {needsReason || editRequestRequired ? t('requestEdit') : t('save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
