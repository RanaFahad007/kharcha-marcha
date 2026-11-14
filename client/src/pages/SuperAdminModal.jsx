import { useCallback, useEffect, useState } from 'react'
import { Ban, Loader2, Shield, X } from 'lucide-react'
import { useApp, api } from '../context/AppContext'

function nameOf(v) {
  if (!v) return ''
  if (typeof v === 'string') return v
  return v.name || v.email || v._id || ''
}

function formatWhen(v) {
  if (!v) return ''
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString()
}

const TABS = [
  { id: 'overview', labelKey: 'overview' },
  { id: 'expenses', labelKey: 'allExpenses' },
  { id: 'activity', labelKey: 'allActivity' },
  { id: 'requests', labelKey: 'allRequests' },
]

export default function SuperAdminModal({ open, onClose }) {
  const { user, t, pushToast } = useApp()
  const [tab, setTab] = useState('overview')
  const [stats, setStats] = useState(null)
  const [groups, setGroups] = useState([])
  const [users, setUsers] = useState([])
  const [expenses, setExpenses] = useState([])
  const [activity, setActivity] = useState([])
  const [joinRequests, setJoinRequests] = useState([])
  const [editRequests, setEditRequests] = useState([])
  const [loading, setLoading] = useState(false)
  const [tabLoading, setTabLoading] = useState(false)
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [statsRes, groupsRes, usersRes] = await Promise.all([
        api.get('/admin/stats'),
        api.get('/admin/groups'),
        api.get('/admin/users'),
      ])
      setStats(statsRes.data?.data || statsRes.data || null)
      const gData = groupsRes.data?.data || {}
      setGroups(Array.isArray(gData) ? gData : gData.groups || [])
      const uData = usersRes.data?.data || {}
      setUsers(Array.isArray(uData) ? uData : uData.users || [])
    } catch (e) {
      pushToast('error', e?.response?.data?.message || t('failedToLoad'))
    } finally {
      setLoading(false)
    }
  }, [pushToast, t])

  const loadTab = useCallback(
    async (tabId) => {
      setTabLoading(true)
      try {
        if (tabId === 'expenses') {
          const res = await api.get('/admin/expenses')
          const d = res.data?.data || {}
          setExpenses(Array.isArray(d) ? d : d.expenses || [])
        } else if (tabId === 'activity') {
          const res = await api.get('/admin/activity')
          const d = res.data?.data || {}
          setActivity(Array.isArray(d) ? d : d.activity || [])
        } else if (tabId === 'requests') {
          const res = await api.get('/admin/requests')
          const d = res.data?.data || {}
          setJoinRequests(d.joinRequests || [])
          setEditRequests(d.editRequests || [])
        }
      } catch (e) {
        pushToast('error', e?.response?.data?.message || t('failedToLoad'))
      } finally {
        setTabLoading(false)
      }
    },
    [pushToast, t]
  )

  useEffect(() => {
    if (!open) return
    if (tab === 'overview') load()
    else loadTab(tab)
  }, [open, tab, load, loadTab])

  async function toggleBlock(targetUser, isBlocked) {
    const uid = targetUser?._id || targetUser
    if (!uid) return
    if (uid === user?._id) {
      pushToast('error', t('cannotBlockSelf'))
      return
    }
    if (!isBlocked && !window.confirm(t('confirmBlockUser'))) return
    setBusyId(uid)
    try {
      const action = isBlocked ? 'unblock' : 'block'
      await api.post(`/admin/users/${uid}/${action}`)
      pushToast('success', isBlocked ? t('userUnblocked') : t('userBlocked'))
      load()
    } catch (e) {
      pushToast('error', e?.response?.data?.message || t('failedToLoad'))
    } finally {
      setBusyId(null)
    }
  }

  async function handleDeleteUser(targetUser) {
    const uid = targetUser?._id || targetUser
    if (!uid) return
    if (uid === user?._id) {
      pushToast('error', t('cannotBlockSelf'))
      return
    }
    if (!window.confirm(t('confirmDeleteUser'))) return
    setBusyId(uid)
    try {
      await api.delete(`/admin/users/${uid}`)
      pushToast('success', t('userDeleted'))
      load()
    } catch (e) {
      pushToast('error', e?.response?.data?.message || t('failedToLoad'))
    } finally {
      setBusyId(null)
    }
  }

  if (!open) return null

  const statCards = [
    { label: t('totalUsers'), value: stats?.totalUsers ?? stats?.users ?? stats?.userCount ?? '—' },
    { label: t('totalGroups'), value: stats?.totalGroups ?? stats?.groups ?? stats?.groupCount ?? groups.length },
    { label: t('totalExpenses'), value: stats?.totalExpenses ?? stats?.expenses ?? stats?.expenseCount ?? '—' }
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 modal-backdrop bg-black/50 overflow-y-auto" onClick={onClose}>
      <div className="modal-panel bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl shadow-pop w-full max-w-3xl p-5 sm:p-6 max-h-[92dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-5 h-5 text-brand-700" />
          <h3 className="text-lg font-bold text-slate-900 dark:text-white flex-1">{t('superAdmin')}</h3>
          <button onClick={onClose} className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 shrink-0" aria-label={t('close')}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 mb-4" role="tablist">
          {TABS.map((tb) => (
            <button
              key={tb.id}
              type="button"
              role="tab"
              aria-selected={tab === tb.id}
              onClick={() => setTab(tb.id)}
              className={`px-3 py-2 min-h-[44px] rounded-lg text-sm font-medium whitespace-nowrap border shrink-0 ${
                tab === tb.id
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {t(tb.labelKey)}
              {tb.id === 'requests' && joinRequests.length + editRequests.length > 0 && (
                <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded-full bg-red-500 text-white font-bold">
                  {joinRequests.length + editRequests.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {loading && tab === 'overview' ? (
          <div className="flex items-center justify-center gap-2 py-10 text-slate-500">
            <Loader2 className="w-5 h-5 spinner" />
            {t('loading')}
          </div>
        ) : tab === 'overview' ? (
          <>
            <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-6">
              {statCards.map((c) => (
                <div key={c.label} className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 text-center">
                  <div className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-white break-words">{c.value}</div>
                  <div className="text-xs text-slate-500 mt-1">{c.label}</div>
                </div>
              ))}
            </div>

            <h4 className="font-bold text-slate-900 dark:text-white mb-2">{t('allGroups')}</h4>
            <div className="hidden md:block overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-xl mb-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-2.5">{t('groupName')}</th>
                    <th className="px-4 py-2.5">{t('members')}</th>
                    <th className="px-4 py-2.5">{t('totalExpenses')}</th>
                    <th className="px-4 py-2.5">{t('status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.length === 0 && (
                    <tr>
                      <td colSpan="4" className="px-4 py-4 text-center text-slate-500">
                        {t('noGroups')}
                      </td>
                    </tr>
                  )}
                  {groups.map((g) => (
                    <tr key={g._id} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-4 py-2.5 font-medium text-slate-900 dark:text-white">{g.name}</td>
                      <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{g.members?.length ?? g.memberCount ?? '—'}</td>
                      <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{g.expenseCount ?? g.totalExpenses ?? '—'}</td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">{t('active')}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Card list on small screens — the table above is md+ only. */}
            <div className="md:hidden space-y-3 mb-6">
              {groups.length === 0 && <p className="text-sm text-slate-500 text-center py-4">{t('noGroups')}</p>}
              {groups.map((g) => (
                <div key={g._id} className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-slate-900 dark:text-white truncate min-w-0">{g.name}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold shrink-0">{t('active')}</span>
                  </div>
                  <div className="flex gap-4 mt-2 text-xs text-slate-500">
                    <span>
                      {t('members')}: {g.members?.length ?? g.memberCount ?? '—'}
                    </span>
                    <span>
                      {t('totalExpenses')}: {g.expenseCount ?? g.totalExpenses ?? '—'}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <h4 className="font-bold text-slate-900 dark:text-white mb-2">{t('members')}</h4>
            {users.length === 0 && <p className="text-sm text-slate-500">{t('noMembers')}</p>}
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1 min-w-0">
              {users.map((u) => {
                const isBlocked = u.isBlocked === true || u.status === 'blocked'
                const isSelf = u._id === user?._id
                return (
                  <div key={u._id} className="flex items-center gap-3 flex-wrap border border-slate-200 dark:border-slate-700 rounded-xl px-3 sm:px-4 py-2.5 min-w-0">
                    <span className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-xs">{(u.name || 'U').charAt(0).toUpperCase()}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-medium text-slate-900 dark:text-white truncate">{nameOf(u)}</span>
                      <span className="block text-xs text-slate-500 truncate">{u.emailOrPhone || u.email || ''}</span>
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${isBlocked ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>{isBlocked ? t('blocked') : t('active')}</span>
                    <button
                      onClick={() => toggleBlock(u, isBlocked)}
                      disabled={busyId === u._id || isSelf}
                      title={isSelf ? t('cannotBlockSelf') : ''}
                      className={`flex items-center gap-1 text-xs font-semibold px-3 py-2.5 min-h-[44px] rounded-lg disabled:opacity-50 ${isBlocked ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-red-600 text-white hover:bg-red-700'}`}
                    >
                      <Ban className="w-3.5 h-3.5" />
                      {isBlocked ? t('unblockUser') : t('blockUser')}
                    </button>
                    <button
                      onClick={() => handleDeleteUser(u)}
                      disabled={busyId === u._id || isSelf}
                      title={isSelf ? t('cannotBlockSelf') : t('deleteUser')}
                      className="flex items-center gap-1 text-xs font-semibold px-3 py-2.5 min-h-[44px] rounded-lg border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      {t('deleteUser')}
                    </button>
                  </div>
                )
              })}
            </div>
          </>
        ) : tab === 'expenses' ? (
          <div className="space-y-2 max-h-[60dvh] overflow-y-auto pr-1 min-w-0">
            {tabLoading && (
              <div className="flex items-center justify-center gap-2 py-10 text-slate-500">
                <Loader2 className="w-5 h-5 spinner" />
                {t('loading')}
              </div>
            )}
            {!tabLoading && expenses.length === 0 && <p className="text-sm text-slate-500 text-center py-4">{t('noExpenses')}</p>}
            {expenses.map((e) => (
              <div key={e._id} className="border border-slate-200 dark:border-slate-700 rounded-xl px-3 sm:px-4 py-3 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-slate-900 dark:text-white truncate min-w-0">{e.title}</span>
                  <span className="font-bold text-slate-900 dark:text-white shrink-0">{Number(e.amount || 0).toFixed(2)}</span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5 text-xs text-slate-500">
                  <span>{t('groupName')}: {e.group?.name || '—'}</span>
                  <span>{t('category')}: {e.category}</span>
                  <span>{t('paidBy')}: {e.paidBy?.name || '—'}</span>
                  <span>{t('createdBy')}: {e.createdBy?.name || '—'}</span>
                  <span>{t('date')}: {formatWhen(e.date)}</span>
                </div>
              </div>
            ))}
          </div>
        ) : tab === 'activity' ? (
          <div className="space-y-2 max-h-[60dvh] overflow-y-auto pr-1 min-w-0">
            {tabLoading && (
              <div className="flex items-center justify-center gap-2 py-10 text-slate-500">
                <Loader2 className="w-5 h-5 spinner" />
                {t('loading')}
              </div>
            )}
            {!tabLoading && activity.length === 0 && <p className="text-sm text-slate-500 text-center py-4">{t('noActivity')}</p>}
            {activity.map((a) => (
              <div key={a._id} className="border border-slate-200 dark:border-slate-700 rounded-xl px-3 sm:px-4 py-3 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-slate-900 dark:text-white truncate min-w-0">
                    {a.actor?.name || '—'} — {a.action}
                  </span>
                  <span className="text-xs text-slate-400 shrink-0">{formatWhen(a.createdAt)}</span>
                </div>
                {a.details && <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 break-words">{a.details}</p>}
                <p className="text-xs text-slate-500 mt-1">
                  {t('groupName')}: {a.group?.name || '—'}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-6 max-h-[60dvh] overflow-y-auto pr-1 min-w-0">
            {tabLoading && (
              <div className="flex items-center justify-center gap-2 py-10 text-slate-500">
                <Loader2 className="w-5 h-5 spinner" />
                {t('loading')}
              </div>
            )}
            {!tabLoading && (
              <>
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white mb-2">{t('joinRequests')}</h4>
                  {joinRequests.length === 0 && <p className="text-sm text-slate-500">{t('noJoinRequests')}</p>}
                  <div className="space-y-2">
                    {joinRequests.map((r) => (
                      <div key={r._id} className="border border-slate-200 dark:border-slate-700 rounded-xl px-3 sm:px-4 py-3 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-slate-900 dark:text-white truncate min-w-0">{r.user?.name || '—'}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold shrink-0">{t('pending')}</span>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5 text-xs text-slate-500">
                          <span>{t('groupName')}: {r.group?.name || '—'}</span>
                          <span>{r.user?.emailOrPhone || ''}</span>
                          <span>{formatWhen(r.requestedAt)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white mb-2">{t('editRequests')}</h4>
                  {editRequests.length === 0 && <p className="text-sm text-slate-500">{t('noEditRequests')}</p>}
                  <div className="space-y-2">
                    {editRequests.map((r) => (
                      <div key={r._id} className="border border-slate-200 dark:border-slate-700 rounded-xl px-3 sm:px-4 py-3 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-slate-900 dark:text-white truncate min-w-0">{r.expenseTitle}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold shrink-0">{t('pending')}</span>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5 text-xs text-slate-500">
                          <span>{t('groupName')}: {r.group?.name || '—'}</span>
                          <span>{t('requestedBy')}: {r.requester?.name || '—'}</span>
                          <span>{t('amount')}: {Number(r.expenseAmount || 0).toFixed(2)}</span>
                          <span>{formatWhen(r.requestedAt)}</span>
                        </div>
                        {r.reason && <p className="text-sm text-slate-600 dark:text-slate-300 mt-1.5 break-words">{t('reason')}: {r.reason}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
