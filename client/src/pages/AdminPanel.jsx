import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Check, Loader2, Shield, Sparkles, Trash2, X } from 'lucide-react'
import { useApp, api } from '../context/AppContext'

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

const COLORS = ['#0D9488', '#059669', '#DC2626', '#D97706', '#0891B2', '#4F46E5', '#0f2440']

export default function AdminPanel() {
  const { groupId } = useParams()
  const { user, t, pushToast, fetchMyGroups, setActiveGroup } = useApp()
  const navigate = useNavigate()
  const [tab, setTab] = useState('members')
  const [group, setGroup] = useState(null)
  const [members, setMembers] = useState([])
  const [requests, setRequests] = useState([])
  const [editRequests, setEditRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [groupColor, setGroupColor] = useState('#0D9488')
  const [invitesEnabled, setInvitesEnabled] = useState(true)
  const [autoApproveJoin, setAutoApproveJoin] = useState(false)
  const [groupCurrency, setGroupCurrency] = useState('PKR')
  const [monthlyBudget, setMonthlyBudget] = useState('')

  const loadAll = useCallback(async () => {
    if (!groupId) return
    setLoading(true)
    try {
      const [groupRes, membersRes, reqRes, editRes] = await Promise.all([
        api.get(`/groups/${groupId}`),
        api.get(`/groups/${groupId}/members`),
        api.get(`/groups/${groupId}/requests`),
        api.get(`/groups/${groupId}/edit-requests`)
      ])
      const g = groupRes.data?.data || groupRes.data
      setGroup(g)
      setGroupName(g?.name || '')
      setGroupColor(g?.color || '#0D9488')
      setInvitesEnabled(g?.invitesEnabled !== false)
      setAutoApproveJoin(g?.autoApproveJoin === true)
      setGroupCurrency(g?.currency || 'PKR')
      setMonthlyBudget(g?.monthlyBudget ? String(g.monthlyBudget) : '')
      setMembers(membersRes.data?.data || [])
      setRequests(reqRes.data?.data || [])
      setEditRequests(editRes.data?.data || [])
    } catch (e) {
      pushToast('error', e?.response?.data?.message || t('failedToLoad'))
    } finally {
      setLoading(false)
    }
  }, [groupId, pushToast, t])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const pendingRequests = requests.filter((r) => (r.status || 'pending') === 'pending')
  const pendingEdits = editRequests.filter((r) => (r.status || 'pending') === 'pending')
  const adminCount = members.filter((m) => m.role === 'admin' || m.role === 'owner').length
  const isLastAdmin = adminCount <= 1 && members.some((m) => idOf(m.user || m) === user?._id && (m.role === 'admin' || m.role === 'owner'))

  async function handleRole(member, role) {
    const uid = idOf(member.user || member)
    setBusy(true)
    try {
      await api.put(`/groups/${groupId}/members/${uid}/role`, { role })
      pushToast('success', t('roleUpdated'))
      loadAll()
    } catch (e) {
      pushToast('error', e?.response?.data?.message || t('failedToLoad'))
    } finally {
      setBusy(false)
    }
  }

  async function handleRequest(membershipId, action) {
    setBusy(true)
    try {
      await api.post(`/groups/${groupId}/requests/${membershipId}/${action}`)
      pushToast('success', action === 'approve' ? t('joinRequestApproved') : t('joinRequestRejected'))
      loadAll()
    } catch (e) {
      pushToast('error', e?.response?.data?.message || t('failedToLoad'))
    } finally {
      setBusy(false)
    }
  }

  async function handleEditRequest(req, action) {
    const expenseId = idOf(req.expense || req.expenseId)
    setBusy(true)
    try {
      await api.post(`/groups/${groupId}/expenses/${expenseId}/edit-request/${action}`)
      pushToast('success', action === 'approve' ? t('editRequestApproved') : t('editRequestRejected'))
      loadAll()
    } catch (e) {
      pushToast('error', e?.response?.data?.message || t('failedToLoad'))
    } finally {
      setBusy(false)
    }
  }

  async function handleSaveSettings(e) {
    e.preventDefault()
    setBusy(true)
    try {
      await api.put(`/groups/${groupId}`, { name: groupName.trim(), color: groupColor, invitesEnabled, autoApproveJoin, currency: groupCurrency, monthlyBudget: monthlyBudget ? Number(monthlyBudget) : 0 })
      pushToast('success', t('groupUpdated'))
      await fetchMyGroups()
      loadAll()
    } catch (err) {
      pushToast('error', err?.response?.data?.message || t('failedToLoad'))
    } finally {
      setBusy(false)
    }
  }

  async function handleLeave() {
    if (isLastAdmin) {
      pushToast('error', t('lastAdminCannotLeave'))
      return
    }
    if (!window.confirm(t('confirmLeave'))) return
    setBusy(true)
    try {
      await api.post(`/groups/${groupId}/leave`)
      pushToast('success', t('leftGroup'))
      await fetchMyGroups()
      navigate('/')
    } catch (e) {
      pushToast('error', e?.response?.data?.message || t('failedToLoad'))
    } finally {
      setBusy(false)
    }
  }

  async function handleLoadDemo() {
    if (!window.confirm(t('confirmLoadDemo'))) return
    setBusy(true)
    try {
      await api.post('/demo/load')
      pushToast('success', t('demoLoaded'))
      loadAll()
    } catch (e) {
      pushToast('error', e?.response?.data?.message || t('failedToLoad'))
    } finally {
      setBusy(false)
    }
  }

  async function handleClearDemo() {
    if (!window.confirm(t('confirmClearDemo'))) return
    setBusy(true)
    try {
      await api.delete('/demo/clear')
      pushToast('success', t('demoCleared'))
      loadAll()
    } catch (e) {
      pushToast('error', e?.response?.data?.message || t('failedToLoad'))
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 text-slate-500">
        <Loader2 className="w-8 h-8 spinner text-brand-700" />
        <p>{t('loading')}</p>
      </div>
    )
  }

  const tabs = [
    { id: 'members', label: t('members') },
    { id: 'requests', label: `${t('joinRequests')} (${pendingRequests.length})` },
    { id: 'edits', label: `${t('editRequests')} (${pendingEdits.length})` },
    { id: 'settings', label: t('groupSettings') }
  ]

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-6 min-w-0">
      <div className="flex items-center gap-3">
        <Link to={`/groups/${groupId}`} className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg border border-slate-300 dark:border-slate-600 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 shrink-0">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white truncate">{t('adminPanel')}</h1>
          <p className="text-sm text-slate-500 truncate">{group?.name}</p>
        </div>
      </div>

      <div className="flex gap-1 sm:gap-2 flex-nowrap overflow-x-auto border-b border-slate-200 dark:border-slate-700 -mx-3 px-3 sm:mx-0 sm:px-0">
        {tabs.map((tb) => (
          <button
            key={tb.id}
            onClick={() => setTab(tb.id)}
            className={`px-4 py-2.5 min-h-[44px] text-sm font-semibold border-b-2 -mb-px whitespace-nowrap ${tab === tb.id ? 'border-brand-600 text-brand-700 dark:text-brand-300' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'} `}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {tab === 'members' && (
        <div className="space-y-3">
          {isLastAdmin && (
            <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3 text-sm text-amber-800 dark:text-amber-200">{t('lastAdminCannotLeave')}</div>
          )}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-card overflow-hidden min-w-0">
          {members.length === 0 && <p className="p-6 text-sm text-slate-500">{t('noMembers')}</p>}
          {members.map((m) => {
            const uid = idOf(m.user || m)
            const nm = nameOf(m.user || m)
            const role = m.role || 'member'
            const isMe = uid === user?._id
            return (
              <div key={uid || nm} className="flex items-center gap-3 px-4 sm:px-5 py-3.5 border-t border-slate-100 dark:border-slate-700 first:border-t-0 flex-wrap min-w-0">
                <span className="w-9 h-9 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold">{nm.charAt(0).toUpperCase()}</span>
                <span className="flex-1 min-w-[120px]">
                  <span className="block font-medium text-slate-900 dark:text-white truncate">{nm}</span>
                  <span className="block text-xs text-slate-500 truncate">{m.user?.email || ''}</span>
                </span>
                <span className={`text-xs px-2 py-1 rounded-full font-semibold flex items-center gap-1 ${role === 'admin' || role === 'owner' ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-600'}`}>
                  <Shield className="w-3 h-3" />
                  {t(role === 'owner' ? 'admin' : role)}
                </span>
                {!isMe && (
                  <div className="flex gap-2">
                    {role === 'member' ? (
                      <button onClick={() => handleRole(m, 'admin')} disabled={busy} className="text-xs font-semibold px-3 py-2.5 min-h-[44px] rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50">
                        {t('promote')}
                      </button>
                    ) : (
                      <button onClick={() => handleRole(m, 'member')} disabled={busy} className="text-xs font-semibold px-3 py-2.5 min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50">
                        {t('demote')}
                      </button>
                    )}
                  </div>
                )}
                              </div>
            )
          })}
          </div>
        </div>
      )}

      {tab === 'requests' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-card overflow-hidden min-w-0">
          {requests.length === 0 && <p className="p-6 text-sm text-slate-500">{t('noRequests')}</p>}
          {requests.map((r) => {
            const mid = r._id || r.membershipId
            const nm = nameOf(r.user || r.member)
            const st = r.status || 'pending'
            return (
              <div key={mid} className="flex items-center gap-3 px-4 sm:px-5 py-3.5 border-t border-slate-100 dark:border-slate-700 first:border-t-0 flex-wrap min-w-0">
                <span className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">{nm.charAt(0).toUpperCase()}</span>
                <span className="flex-1 min-w-[120px] font-medium text-slate-900 dark:text-white truncate">{nm}</span>
                <span className={`text-xs px-2 py-1 rounded-full font-semibold ${st === 'pending' ? 'bg-amber-100 text-amber-800' : st === 'accepted' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                  {t(st)}
                </span>
                {st === 'pending' && (
                  <div className="flex gap-2">
                    <button onClick={() => handleRequest(mid, 'approve')} disabled={busy} className="flex items-center gap-1 text-xs font-semibold px-3 py-2.5 min-h-[44px] rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                      <Check className="w-3.5 h-3.5" />
                      {t('approve')}
                    </button>
                    <button onClick={() => handleRequest(mid, 'reject')} disabled={busy} className="flex items-center gap-1 text-xs font-semibold px-3 py-2.5 min-h-[44px] rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
                      <X className="w-3.5 h-3.5" />
                      {t('reject')}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {tab === 'edits' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-card overflow-hidden min-w-0">
          {editRequests.length === 0 && <p className="p-6 text-sm text-slate-500">{t('noEditRequests')}</p>}
          {editRequests.map((r) => {
            const st = r.status || 'pending'
            const expTitle = r.expense?.title || r.title || t('expense')
            const nm = nameOf(r.requestedBy || r.user)
            return (
              <div key={r._id || `${expTitle}-${nm}`} className="px-4 sm:px-5 py-4 border-t border-slate-100 dark:border-slate-700 first:border-t-0 min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="flex-1 font-medium text-slate-900 dark:text-white min-w-0 break-words">
                    {expTitle} — {nm}
                  </span>
                  <span className={`text-xs px-2 py-1 rounded-full font-semibold ${st === 'pending' ? 'bg-amber-100 text-amber-800' : st === 'approved' || st === 'accepted' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                    {t(st === 'approved' ? 'accepted' : st)}
                  </span>
                  {st === 'pending' && (
                    <div className="flex gap-2">
                      <button onClick={() => handleEditRequest(r, 'approve')} disabled={busy} className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                        <Check className="w-3.5 h-3.5" />
                        {t('approve')}
                      </button>
                      <button onClick={() => handleEditRequest(r, 'reject')} disabled={busy} className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
                        <X className="w-3.5 h-3.5" />
                        {t('reject')}
                      </button>
                    </div>
                  )}
                </div>
                {(() => {
                  const prevAmount = r.previousAmount ?? r.expense?.editHistory?.[r.expense.editHistory.length - 1]?.previousAmount ?? r.prevAmount
                  const prevTitle = r.previousTitle ?? r.expense?.editHistory?.[r.expense.editHistory.length - 1]?.previousTitle ?? r.prevTitle
                  const curAmount = r.expense?.amount ?? r.amount
                  const curTitle = r.expense?.title ?? r.title
                  if (prevAmount === undefined && !prevTitle && curAmount === undefined) return null
                  return (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 text-sm">
                      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                        <div className="text-xs font-bold uppercase tracking-wide text-red-600 mb-1">{t('before')}</div>
                        <div className="font-medium text-slate-900 dark:text-white">{prevTitle || curTitle || '—'}</div>
                        <div className="text-slate-600 dark:text-slate-300">{prevAmount !== undefined && prevAmount !== null ? prevAmount : '—'}</div>
                      </div>
                      <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3">
                        <div className="text-xs font-bold uppercase tracking-wide text-emerald-600 mb-1">{t('after')}</div>
                        <div className="font-medium text-slate-900 dark:text-white">{curTitle || '—'}</div>
                        <div className="text-slate-600 dark:text-slate-300">{curAmount !== undefined && curAmount !== null ? curAmount : '—'}</div>
                      </div>
                    </div>
                  )
                })()}
                {r.reason && <p className="text-sm text-slate-500 mt-2">{t('reason')}: {r.reason}</p>}
              </div>
            )
          })}
        </div>
      )}

      {tab === 'settings' && (
        <div className="space-y-6">
          <form onSubmit={handleSaveSettings} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-card p-5 sm:p-6 space-y-4 min-w-0">
            <h2 className="font-bold text-slate-900 dark:text-white">{t('groupSettings')}</h2>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">{t('groupName')}</label>
              <input value={groupName} onChange={(e) => setGroupName(e.target.value)} className="w-full px-3 py-2.5 min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">{t('groupColor')}</label>
              <div className="flex gap-2 flex-wrap">
                {COLORS.map((c) => (
                  <button key={c} type="button" onClick={() => setGroupColor(c)} className={`w-11 h-11 rounded-full border-2 ${groupColor === c ? 'border-slate-900 dark:border-white scale-110' : 'border-transparent'}`} style={{ backgroundColor: c }} aria-label={c} />
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">{t('groupCurrency')}</label>
                <select value={groupCurrency} onChange={(e) => setGroupCurrency(e.target.value)} className="w-full px-3 py-2.5 min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500">
                  {['PKR', 'USD', 'EUR', 'GBP', 'INR', 'AED', 'SAR', 'BDT'].map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">{t('monthlyBudget')}</label>
                <input type="number" min="0" step="0.01" value={monthlyBudget} onChange={(e) => setMonthlyBudget(e.target.value)} placeholder={t('monthlyBudgetPlaceholder')} className="w-full px-3 py-2.5 min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
            </div>
            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{t('invitesEnabled')}</span>
              <input type="checkbox" checked={invitesEnabled} onChange={(e) => setInvitesEnabled(e.target.checked)} className="w-5 h-5 accent-brand-600" />
            </label>
            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{t('autoApprove')}</span>
              <input type="checkbox" checked={autoApproveJoin} onChange={(e) => setAutoApproveJoin(e.target.checked)} className="w-5 h-5 accent-brand-600" />
            </label>
            <button type="submit" disabled={busy} className="px-5 py-2.5 min-h-[44px] rounded-lg bg-brand-600 text-white font-semibold hover:bg-brand-700 disabled:opacity-60">
              {t('save')}
            </button>
          </form>

          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-card p-5 sm:p-6 min-w-0">
            <h2 className="font-bold text-slate-900 dark:text-white mb-3">{t('loadDemoData')}</h2>
            <div className="flex gap-2 flex-wrap">
              <button onClick={handleLoadDemo} disabled={busy} className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60">
                <Sparkles className="w-4 h-4" />
                {t('loadDemoData')}
              </button>
              <button onClick={handleClearDemo} disabled={busy} className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60">
                <Trash2 className="w-4 h-4" />
                {t('clearDemoData')}
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-red-200 dark:border-red-800 shadow-card p-5 sm:p-6 min-w-0">
            <h2 className="font-bold text-red-700">{t('dangerZone')}</h2>
            <p className="text-sm text-slate-500 mt-1 mb-4">{isLastAdmin ? t('lastAdminCannotLeave') : t('confirmLeave')}</p>
            <button onClick={handleLeave} disabled={busy || isLastAdmin} className="px-5 py-2.5 min-h-[44px] rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed">
              {t('leaveGroup')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
